import { ServerConfig } from '@vault/config';

export const SessionKeys = {
    session: (id: string) => `sess:${id}`,
    userSessions: (userId: string) => `user:${userId}:sessions`,
};

export const SESSION_LIFETIME_MS = {
    short: ServerConfig.SHORT_SESSION_EXPIRY * 1000,
    long: ServerConfig.LONG_SESSION_EXPIRY * 1000,
} as const;

export const CSRF_HEADER = 'x-csrf-token';

export const STEP_UP_WINDOW_MS = 15 * 60 * 1000;

export const USER_INDEX_TTL_SECONDS = ServerConfig.LONG_SESSION_EXPIRY;

export const MAX_SESSIONS_PER_USER = ServerConfig.MAX_CONCURRENT_SESSIONS_PER_USER;