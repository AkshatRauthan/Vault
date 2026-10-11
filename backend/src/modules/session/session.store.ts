import { guard } from '@shared';
import { VaultCache } from '@vault/infra/cache';

import { ISession } from './session.types';
import { SessionKeys, MAX_SESSIONS_PER_USER, USER_INDEX_TTL_SECONDS } from './session.constant';


export const SessionStore = {
    saveSession: (id: string, session: ISession, ttlSeconds: number) =>
        guard('saveSession', () => VaultCache.set(SessionKeys.session(id), session, ttlSeconds)),

    findSession: (id: string) =>
        guard('findSession', () => VaultCache.get<ISession>(SessionKeys.session(id))),

    /** Overwrites in place, preserving the remaining TTL. False if the session is gone. */
    updateSession: (id: string, session: ISession) =>
        guard('updateSession', () => VaultCache.update(SessionKeys.session(id), session)),

    removeSession: (id: string) =>
        guard('removeSession', () => VaultCache.invalidate(SessionKeys.session(id))),

    indexUserSession: (userId: string, id: string, createdAt: number) =>
        guard('indexUserSession', () =>
            VaultCache.zAdd(SessionKeys.userSessions(userId), createdAt, id, USER_INDEX_TTL_SECONDS),
        ),

    unindexUserSession: (userId: string, id: string) =>
        guard('unindexUserSession', () => VaultCache.zRem(SessionKeys.userSessions(userId), id)),

    /** Drops index entries whose session expired; returns the live sessions. */
    pruneStaleUserSessions: (userId: string) =>
        guard('pruneStaleUserSessions', async () => {
            const indexKey = SessionKeys.userSessions(userId);
            const ids = await VaultCache.zRange(indexKey);
            const sessions = await VaultCache.mGet<ISession>(ids.map(SessionKeys.session));

            const live: { id: string; session: ISession }[] = [];
            const stale: string[] = [];
            ids.forEach((id, i) => {
                const session = sessions[i];
                if (session) live.push({ id, session });
                else stale.push(id);
            });

            await VaultCache.zRemMany(indexKey, stale);
            return live;
        }),

    /** If the user is at the concurrency limit, evicts their oldest session. Returns its ID. */
    evictOldestSessionIfFull: (userId: string) =>
        guard('evictOldestSessionIfFull', async () => {
            const indexKey = SessionKeys.userSessions(userId);
            // Expired IDs linger in the index; clear them so they don't count toward the limit.
            if ((await VaultCache.zCard(indexKey)) >= MAX_SESSIONS_PER_USER) {
                const live = await SessionStore.pruneStaleUserSessions(userId);
                if (live.length < MAX_SESSIONS_PER_USER) return null;
            }
            const victim = await VaultCache.checkAndEvictLru(indexKey, MAX_SESSIONS_PER_USER);
            if (victim) await VaultCache.invalidate(SessionKeys.session(victim));
            return victim;
        }),

    /** Removes all of a user's sessions, optionally keeping one. */
    removeAllUserSessions: (userId: string, exceptId?: string) =>
        guard('removeAllUserSessions', async () => {
            const indexKey = SessionKeys.userSessions(userId);
            const ids = await VaultCache.zRange(indexKey);
            const targets = ids.filter((id) => id !== exceptId);

            await VaultCache.invalidate(...targets.map(SessionKeys.session));
            if (exceptId) await VaultCache.zRemMany(indexKey, targets);
            else await VaultCache.invalidate(indexKey);
            return targets.length;
        }),
};