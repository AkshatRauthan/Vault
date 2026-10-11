import { StatusCodes } from 'http-status-codes';
import { Request, RequestHandler, Response } from 'express';

import { AuthService } from './auth.service';
import { handle, getClientContext } from '@shared';
import { ChangePasswordBody, LoginBody, ReauthBody, RegisterBody, SessionRefParams } from './auth.schema';
import { clearSessionCookie, CsrfService, ISessionContext, setSessionCookie } from '@vault/modules/session';


/** Routes using this sit behind requireSession, so req.session is always set. */
const currentSession = (req: Request): ISessionContext => req.session as ISessionContext;

const sendSession = (res: Response, session: ISessionContext, status: number, body: object): void => {
    setSessionCookie(res, session.id, session.data);
    res.status(status).json({ ...body, csrfToken: CsrfService.generateCsrfToken(session.id) });
};

export const AuthController: Record<string, RequestHandler> = {
    register: handle(async (req, res) => {
        const result = await AuthService.register(req.body as RegisterBody, getClientContext(req), req.session?.id);
        sendSession(res, result.session, StatusCodes.CREATED, { user: result.user });
    }),

    login: handle(async (req, res) => {
        const result = await AuthService.login(req.body as LoginBody, getClientContext(req), req.session?.id);
        sendSession(res, result.session, StatusCodes.OK, { user: result.user });
    }),

    logout: handle(async (req, res) => {
        await AuthService.logout(req.session?.id);
        clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).end();
    }),

    logoutAll: handle(async (req, res) => {
        await AuthService.logoutAll(currentSession(req).data.userId);
        clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).end();
    }),

    reauth: handle(async (req, res) => {
        const { password } = req.body as ReauthBody;
        const session = await AuthService.reauthenticate(currentSession(req), password, getClientContext(req));
        sendSession(res, session, StatusCodes.OK, {});
    }),

    changePassword: handle(async (req, res) => {
        const session = await AuthService.changePassword(
            currentSession(req),
            req.body as ChangePasswordBody,
            getClientContext(req),
        );
        sendSession(res, session, StatusCodes.OK, {});
    }),

    /** Also hands out the CSRF token, so a page reload needs just this one call. */
    getMe: handle(async (req, res) => {
        const session = currentSession(req);
        const user = await AuthService.getCurrentUser(session.data.userId);
        res.status(StatusCodes.OK).json({ user, csrfToken: CsrfService.generateCsrfToken(session.id) });
    }),

    listSessions: handle(async (req, res) => {
        const session = currentSession(req);
        const sessions = await AuthService.listSessions(session.data.userId, session.id);
        res.status(StatusCodes.OK).json({ sessions });
    }),

    revokeSession: handle(async (req, res) => {
        const session = currentSession(req);
        const { ref } = req.params as unknown as SessionRefParams;
        const { wasCurrent } = await AuthService.revokeSession(session.data.userId, ref, session.id);
        if (wasCurrent) clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).end();
    }),
};