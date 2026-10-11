import { Request, Response } from 'express';

import { ISession } from './session.types';
import { CookieConfig } from '@vault/config';

export const SESSION_COOKIE_NAME = CookieConfig.sessionCookieName;


/**
 * Sets the signed session cookie. maxAge is the time REMAINING on the session,
 * not the full lifetime, so a rotated session keeps its original expiry.
 */
export const setSessionCookie = (res: Response, id: string, session: ISession): void => {
    const base = session.remember ? CookieConfig.longSessionToken : CookieConfig.shortSessionToken;
    res.cookie(SESSION_COOKIE_NAME, id, {
        ...base,
        maxAge: Math.max(0, session.expiresAt - Date.now()),
    });
};

export const clearSessionCookie = (res: Response): void => {
    // clearCookie needs matching path/secure/sameSite attributes (and no maxAge).
    const { maxAge: _maxAge, signed: _signed, ...attributes } = CookieConfig.shortSessionToken;
    res.clearCookie(SESSION_COOKIE_NAME, attributes);
};

/**
 * Requires cookieParser(SESSION_COOKIE_SECRET) upstream.
 * undefined = no cookie, false = present but signature invalid, string = verified ID.
 */
export const readSessionCookie = (req: Request): string | false | undefined =>
    req.signedCookies?.[SESSION_COOKIE_NAME];