import { StatusCodes } from 'http-status-codes';
import { Request, RequestHandler, Response } from 'express';

import { IKeyContext } from './key.types';
import { KeyService } from './key.instance';
import { ISessionContext } from '../session';
import { PublicKeyParams, RevokeBody } from './key.schema';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

// Express 4 doesn't catch rejected promises, so forward them to the error handler.
const handle =
    (fn: AsyncHandler): RequestHandler =>
    (req, res, next) => {
        fn(req, res).catch(next);
    };

/** Routes using this sit behind requireSession, so req.session is always set. */
const keyContext = (req: Request): IKeyContext => {
    const session = req.session as ISessionContext;
    return {
        userId: session.data.userId,
        sessionId: session.id,
        ip: req.ip ?? 'unknown',
        userAgent: req.get('user-agent') ?? '',
    };
};

export const KeyController: Record<string, RequestHandler> = {
    /** 201 when this call created the user's first key, 200 for a normal rotation. */
    rotate: handle(async (req, res) => {
        const { key, created } = await KeyService.rotateKey(keyContext(req));
        res.status(created ? StatusCodes.CREATED : StatusCodes.OK).json({ key });
    }),

    revoke: handle(async (req, res) => {
        const { reason } = req.body as RevokeBody;
        const result = await KeyService.revokeActiveKey(keyContext(req), reason);
        res.status(StatusCodes.OK).json(result);
    }),

    listMine: handle(async (req, res) => {
        const keys = await KeyService.listKeyVersions(keyContext(req).userId);
        res.status(StatusCodes.OK).json({ keys });
    }),

    /** Public: no session. Lets an external verifier fetch a key version's public key and certificate. */
    getPublic: handle(async (req, res) => {
        const { keyId, keyVersion } = req.params as unknown as PublicKeyParams;
        const bundle = await KeyService.getPublicKeyBundle(keyId, keyVersion);
        if (!bundle) {
            res.status(StatusCodes.NOT_FOUND).json({ message: 'Key version not found' });
            return;
        }
        res.status(StatusCodes.OK).json(bundle);
    }),
};