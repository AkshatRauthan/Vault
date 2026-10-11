import { UAParser } from 'ua-parser-js';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

import { Logger, toSeconds } from '@shared';
import { ServerConfig } from '@vault/config';

import { SessionStore } from './session.store';
import { SESSION_LIFETIME_MS } from './session.constant';
import { IActiveSession, IClientContext, ICreateSessionInput, ISession, ISessionContext } from './session.types';



// Sessions Service

const newId = (): string => randomBytes(32).toString('base64url');

/** Browser family + OS only, so routine browser auto-updates don't trip the flag. */
const fingerprint = (userAgent: string): string => {
    const { browser, os } = new UAParser(userAgent).getResult();
    return `${browser.name ?? 'unknown'}|${os.name ?? 'unknown'}`;
};

const remainingSeconds = (expiresAt: number): number => toSeconds(expiresAt - Date.now());

type RotatePatch = Partial<
    Pick<ISession, 'authenticatedAt' | 'suspicious' | 'ip' | 'userAgent' | 'uaFingerprint'>
>;

const destroySession = async (id: string): Promise<void> => {
    const session = await SessionStore.findSession(id);
    await SessionStore.removeSession(id);
    if (session) await SessionStore.unindexUserSession(session.userId, id);
};

const getSession = async (id: string): Promise<ISession | null> => {
    const session = await SessionStore.findSession(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
        await destroySession(id);
        return null;
    }
    return session;
};

/**
 * Issues a new ID for an existing session. Original createdAt/expiresAt are
 * carried over, so rotation never restarts the fixed lifetime.
 */
const rotateSession = async (id: string, patch: RotatePatch = {}): Promise<ISessionContext | null> => {
    const current = await getSession(id);
    if (!current) return null;

    const next: ISession = { ...current, ...patch };
    const nextId = newId();

    await SessionStore.saveSession(nextId, next, remainingSeconds(next.expiresAt));
    await SessionStore.indexUserSession(next.userId, nextId, next.createdAt);
    await SessionStore.unindexUserSession(next.userId, id);
    await SessionStore.removeSession(id);

    return { id: nextId, data: next };
};

export const SessionService = {
    async createSession(userId: string, input: ICreateSessionInput): Promise<ISessionContext> {
        const now = Date.now();
        const lifetime = input.remember ? SESSION_LIFETIME_MS.long : SESSION_LIFETIME_MS.short;
        const id = newId();

        const session: ISession = {
            userId,
            createdAt: now,
            expiresAt: now + lifetime,
            authenticatedAt: now,
            remember: input.remember,
            ip: input.ip,
            userAgent: input.userAgent,
            uaFingerprint: fingerprint(input.userAgent),
            suspicious: false,
        };

        const evicted = await SessionStore.evictOldestSessionIfFull(userId);
        if (evicted) Logger.info('Evicted oldest session at concurrency limit', { userId });

        await SessionStore.saveSession(id, session, toSeconds(lifetime));
        await SessionStore.indexUserSession(userId, id, now);

        return { id, data: session };
    },

    /** Returns null for unknown or expired sessions. */
    getSession,

    rotateSession,

    /** Reauth: refreshes authenticatedAt, clears the suspicious flag, adopts the current client, rotates the ID. */
    markSessionAuthenticated(id: string, client: IClientContext): Promise<ISessionContext | null> {
        return rotateSession(id, {
            authenticatedAt: Date.now(),
            suspicious: false,
            ip: client.ip,
            userAgent: client.userAgent,
            uaFingerprint: fingerprint(client.userAgent),
        });
    },

    hasSessionUserAgentChanged(session: ISession, userAgent: string): boolean {
        return fingerprint(userAgent) !== session.uaFingerprint;
    },

    /** Marks a session suspicious in place, without touching its TTL. */
    async flagSessionSuspicious(id: string, session: ISession): Promise<void> {
        await SessionStore.updateSession(id, { ...session, suspicious: true });
    },

    destroySession,

    /** Destroys a session only if it belongs to `userId`. Returns false otherwise. */
    async destroyOwnedSession(userId: string, id: string): Promise<boolean> {
        const session = await SessionStore.findSession(id);
        if (!session || session.userId !== userId) return false;
        await destroySession(id);
        return true;
    },

    /** Logout everywhere / password change. Returns how many sessions were removed. */
    destroyAllUserSessions(userId: string, exceptId?: string): Promise<number> {
        return SessionStore.removeAllUserSessions(userId, exceptId);
    },

    async listUserSessions(userId: string, currentId?: string): Promise<IActiveSession[]> {
        const live = await SessionStore.pruneStaleUserSessions(userId);
        return live
            .map(({ id, session }) => ({
                id,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                remember: session.remember,
                ip: session.ip,
                userAgent: session.userAgent,
                suspicious: session.suspicious,
                current: id === currentId,
            }))
            .sort((a, b) => b.createdAt - a.createdAt);
    },
};



// Csrf Servcie

const sign = (sessionId: string): Buffer =>
    createHmac('sha256', ServerConfig.CSRF_TOKEN_SECRET).update(sessionId).digest();

/**
 * Stateless CSRF token: HMAC-SHA256(CSRF_SECRET, sessionId). Nothing is stored,
 * and rotating the session ID rotates the token automatically.
 */
export const CsrfService = {
    generateCsrfToken: (sessionId: string): string => sign(sessionId).toString('base64url'),

    verifyCsrfToken(sessionId: string, token: string | undefined): boolean {
        if (!token) return false;
        const expected = new Uint8Array(sign(sessionId));
        const given = new Uint8Array(Buffer.from(token, 'base64url'));
        return given.length === expected.length && timingSafeEqual(given, expected);
    },
};