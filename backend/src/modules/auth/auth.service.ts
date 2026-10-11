import { createHash } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';

import { CustomError, Logger } from '@shared';
import { IPublicUser, UsersService } from '@vault/modules/user';
import { IClientContext, ISessionContext, SessionService } from '@vault/modules/session';

import { PasswordService } from './password.service';
import { IAuthResult, IAuthSession } from './auth.types';
import { ChangePasswordBody, LoginBody, RegisterBody } from './auth.schema';

/** Opaque, non-reversible handle for a session, safe to expose to its owner. */
const toSessionRef = (sessionId: string): string =>
    createHash('sha256').update(sessionId).digest('base64url').slice(0, 22);

/** Verifies a user's password by ID (reauth, change-password). Same timing path as login. */
const verifyUserPassword = async (userId: string, password: string): Promise<IPublicUser> => {
    const credentials = await UsersService.findCredentialsById(userId);
    const valid = await PasswordService.verifyPassword(password, credentials?.passwordHash);
    if (!credentials || !valid) {
        throw new CustomError('Incorrect password', StatusCodes.UNAUTHORIZED);
    }
    return credentials.user;
};

const requireRotated = (rotated: ISessionContext | null): ISessionContext => {
    if (!rotated) throw new CustomError('Authentication required', StatusCodes.UNAUTHORIZED);
    return rotated;
};

export const AuthService = {
    /** Always creates a short (1 day) session and logs the user in. */
    async register(input: RegisterBody, client: IClientContext, previousSessionId?: string): Promise<IAuthResult> {
        const passwordHash = await PasswordService.hashPassword(input.password);
        const user = await UsersService.createUser({
            email: input.email,
            tag: input.tag,
            name: input.name,
            passwordHash,
        });

        if (previousSessionId) await SessionService.destroySession(previousSessionId);
        const session = await SessionService.createSession(user.userId, { remember: false, ...client });

        Logger.info('User registered', { userId: user.userId });
        return { user, session };
    },

    async login(input: LoginBody, client: IClientContext, previousSessionId?: string): Promise<IAuthResult> {
        const credentials = await UsersService.findCredentialsByIdentifier(input.identifier);
        const valid = await PasswordService.verifyPassword(input.password, credentials?.passwordHash);

        if (!credentials || !valid) {
            // Deliberately no identifier in the log: it may be an email, or a mistyped password.
            Logger.warn('Failed login attempt', { ip: client.ip });
            throw new CustomError('Invalid credentials', StatusCodes.UNAUTHORIZED);
        }

        if (previousSessionId) await SessionService.destroySession(previousSessionId);
        const session = await SessionService.createSession(credentials.user.userId, {
            remember: input.remember,
            ...client,
        });

        return { user: credentials.user, session };
    },

    /** Idempotent: a missing session is fine. */
    async logout(sessionId?: string): Promise<void> {
        if (sessionId) await SessionService.destroySession(sessionId);
    },

    async logoutAll(userId: string): Promise<void> {
        await SessionService.destroyAllUserSessions(userId);
    },

    /** Step-up: password check, then a rotated session with fresh authenticatedAt and the flag cleared. */
    async reauthenticate(
        session: ISessionContext,
        password: string,
        client: IClientContext,
    ): Promise<ISessionContext> {
        await verifyUserPassword(session.data.userId, password);
        return requireRotated(await SessionService.markSessionAuthenticated(session.id, client));
    },

    /** Kills every other session, then rotates the current one. */
    async changePassword(
        session: ISessionContext,
        input: ChangePasswordBody,
        client: IClientContext,
    ): Promise<ISessionContext> {
        const { userId } = session.data;
        await verifyUserPassword(userId, input.currentPassword);

        const passwordHash = await PasswordService.hashPassword(input.newPassword);
        await UsersService.updatePasswordHash(userId, passwordHash);
        await SessionService.destroyAllUserSessions(userId, session.id);

        Logger.info('Password changed', { userId });
        return requireRotated(await SessionService.markSessionAuthenticated(session.id, client));
    },

    async getCurrentUser(userId: string): Promise<IPublicUser> {
        const user = await UsersService.findUserById(userId);
        if (!user) throw new CustomError('User not found', StatusCodes.NOT_FOUND);
        return user;
    },

    async listSessions(userId: string, currentSessionId: string): Promise<IAuthSession[]> {
        const sessions = await SessionService.listUserSessions(userId, currentSessionId);
        return sessions.map(({ id, ...rest }) => ({ ref: toSessionRef(id), ...rest }));
    },

    /** Revokes one of the caller's own sessions by ref. Throws 404 if it isn't theirs. */
    async revokeSession(
        userId: string,
        ref: string,
        currentSessionId: string,
    ): Promise<{ wasCurrent: boolean }> {
        const sessions = await SessionService.listUserSessions(userId, currentSessionId);
        const target = sessions.find((session) => toSessionRef(session.id) === ref);
        if (!target) throw new CustomError('Session not found', StatusCodes.NOT_FOUND);

        await SessionService.destroyOwnedSession(userId, target.id);
        return { wasCurrent: target.current };
    },
};