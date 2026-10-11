/** Stored in Redis as one JSON value under sess:{id}. All timestamps are epoch ms. */
export interface ISession {
    ip: string;
    userId: string;
    userAgent: string;
    createdAt: number;

    /** Absolute expiry. Fixed at creation, carried over on rotation. */
    expiresAt: number;

    /** Last time the user entered their password (login or reauth). */
    authenticatedAt: number;

    /** true = long session, false = short session. */
    remember: boolean;

    /** Normalized "browser|os" used for change detection (versions ignored). */
    uaFingerprint: string;

    /** Set when the UA fingerprint changed mid-session; forces step-up until reauth. */
    suspicious: boolean;
}

export interface ISessionContext {
    id: string;
    data: ISession;
}

export interface IClientContext {
    ip: string;
    userAgent: string;
}

export interface ICreateSessionInput extends IClientContext {
    remember: boolean;
}

export interface IActiveSession {
    id: string;
    createdAt: number;
    expiresAt: number;
    remember: boolean;
    ip: string;
    userAgent: string;
    suspicious: boolean;
    current: boolean;
}
