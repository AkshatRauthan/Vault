import { IPublicUser } from '@vault/modules/user';
import { ISessionContext } from '@vault/modules/session';

/** Result of register/login: the user plus the freshly created session (cookie + CSRF are set by the controller). */
export interface IAuthResult {
    user: IPublicUser;
    session: ISessionContext;
}

/** What clients see for each active session. The raw session ID never leaves the server. */
export interface IAuthSession {
    /** Opaque reference derived from the session ID; used to revoke it. */
    ref: string;
    createdAt: number;
    expiresAt: number;
    remember: boolean;
    ip: string;
    userAgent: string;
    suspicious: boolean;
    current: boolean;
}