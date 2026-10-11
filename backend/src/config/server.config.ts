import { getPort, getEnv, getPositiveInteger } from '@shared';

interface IServerConfig {
    PORT: number,
    NODE_ENV: string;

    CORS_ORIGINS: string;
    SERVICE_NAME: string;

    CSRF_TOKEN_SECRET: string,
    SESSION_COOKIE_SECRET: string,

    LONG_SESSION_EXPIRY: number,
    SHORT_SESSION_EXPIRY: number,

    MAX_CONCURRENT_SESSIONS_PER_USER: number;
}

const ServerConfig: IServerConfig = {
    PORT: getPort('PORT', '7001'),
    NODE_ENV: getEnv('NODE_ENV', 'development'),

    CORS_ORIGINS: getEnv('CORS_ORIGINS', '*'),
    SERVICE_NAME: getEnv('SERVICE_NAME', 'backend@vault'),

    LONG_SESSION_EXPIRY: getPositiveInteger('LONG_SESSION_EXPIRY', '2419200'),
    SHORT_SESSION_EXPIRY: getPositiveInteger('SHORT_SESSION_EXPIRY', '86400'),

    CSRF_TOKEN_SECRET: getEnv('CSRF_TOKEN_SECRET'),
    SESSION_COOKIE_SECRET: getEnv('SESSION_COOKIE_SECRET'),

    MAX_CONCURRENT_SESSIONS_PER_USER: getPositiveInteger('MAX_CONCURRENT_SESSIONS_PER_USER', '5'),
}

export default ServerConfig;