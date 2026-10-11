import { StatusCodes } from 'http-status-codes';
import { RequestHandler, Request } from 'express';

import { handle } from '@vault/shared';
import { ISessionContext } from '../session';

import { UsersService } from './user.service';
import { TagAvailabilityQuery, UpdateProfileBody } from './user.schema';

const currentSession = (req: Request): ISessionContext => req.session as ISessionContext;

/**
 * Input is already validated and normalized by the validate middleware.
 * Routes that read req.session sit behind requireSession, so it's always set.
 */
export const UsersController: Record<string, RequestHandler> = {
    getTagAvailability: handle(async (req, res) => {
        const { tag } = req.query as unknown as TagAvailabilityQuery;
        res.status(StatusCodes.OK).json({ available: await UsersService.isTagAvailable(tag) });
    }),

    // using currentSession to tell express that 
    updateMe: handle(async (req, res) => {
        const { name } = req.body as UpdateProfileBody;
        const user = await UsersService.updateUserName(currentSession(req).data.userId, name);
        res.status(StatusCodes.OK).json({ user });
    }),
};
