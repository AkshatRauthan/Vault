import { CookieOptions } from 'express';
import ServerConfig from "./server.config";

const isProd = (ServerConfig.NODE_ENV === 'production');

export const CookieConfig = {
    
    shortSessionToken: {
        path: '/',
        signed: true,
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: ServerConfig.SHORT_SESSION_EXPIRY * 1000,
    } as CookieOptions,
    
    longSessionToken: {
        path: '/',
        signed: true,
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: ServerConfig.LONG_SESSION_EXPIRY * 1000,
    } as CookieOptions,
    
    sessionCookieName: isProd ? '__Host-sid' : 'sid',
};