import { StatusCodes } from 'http-status-codes';
import { NextFunction, Request, RequestHandler, Response } from 'express';

import { CustomError, Logger } from '@shared';

import { SessionService, CsrfService } from './session.service';
import { CSRF_HEADER, STEP_UP_WINDOW_MS } from './session.constant';
import { clearSessionCookie, readSessionCookie } from './session.cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Attaches req.session when a valid session exists. Never rejects on its own:
 * anonymous requests pass through, and guards below decide what needs auth.
 * Mount after cookieParser(SESSION_COOKIE_SECRET).
 */
export const sessionLoader: RequestHandler = async (req, res, next) => {
    try {
        const cookie = readSessionCookie(req);
        if (cookie === undefined) return next();

        // Present but tampered (bad signature): drop it and continue anonymous.
        if (typeof cookie !== 'string') {
            clearSessionCookie(res);
            return next();
        }

        const session = await SessionService.getSession(cookie);
        if (!session) {
            clearSessionCookie(res);
            return next();
        }

        const userAgent = req.get('user-agent') ?? '';
        if (!session.suspicious && SessionService.hasSessionUserAgentChanged(session, userAgent)) {
            await SessionService.flagSessionSuspicious(cookie, session);
            session.suspicious = true;
            Logger.warn('Session user agent changed; flagged for re-authentication', {
                userId: session.userId,
                ip: req.ip,
            });
        }

        req.session = { id: cookie, data: session };
        next();
    } catch (err) {
        next(err);
    }
};

export const requireSession: RequestHandler = (req, _res, next) => {
    if (!req.session) {
        return next(new CustomError('Authentication required', StatusCodes.UNAUTHORIZED));
    }
    next();
};

/** Step-up: password must have been entered recently, and the session must not be flagged. */
export const requireFreshAuth =
    (maxAgeMs: number = STEP_UP_WINDOW_MS): RequestHandler =>
        (req: Request, _res: Response, next: NextFunction) => {
            const session = req.session?.data;
            if (!session) {
                return next(new CustomError('Authentication required', StatusCodes.UNAUTHORIZED));
            }
            if (session.suspicious || Date.now() - session.authenticatedAt > maxAgeMs) {
                return next(new CustomError('Re-authentication required', StatusCodes.FORBIDDEN));
            }
            next();
        };

/**
 * Validates X-CSRF-Token on state-changing requests that have a session.
 * Requests without a session are skipped (login/register); pair with
 * requireSession on protected routes.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || !req.session) return next();

    if (!CsrfService.verifyCsrfToken(req.session.id, req.get(CSRF_HEADER))) {
        return next(new CustomError('Invalid CSRF token', StatusCodes.FORBIDDEN));
    }
    next();
};