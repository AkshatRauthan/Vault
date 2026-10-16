import { Router } from 'express';

import { validate } from '@shared';

import { KeyController } from './key.controller';
import { requireFreshAuth, requireSession } from '../session';
import { publicKeyParamsSchema, revokeBodySchema } from './key.schema';

export const keyRouter: Router = Router();

// Public: for external verifiers
keyRouter.get(
    '/:keyId/versions/:keyVersion/public',
    validate({ params: publicKeyParamsSchema }),
    KeyController.getPublic
);

// Authenticated
keyRouter.get(
    '/me',
    requireSession,
    KeyController.listMine
);

// Sensitive: also need a recent password confirmation (step-up)
keyRouter.post(
    '/rotate',
    requireSession,
    requireFreshAuth(),
    KeyController.rotate
);

keyRouter.post(
    '/revoke',
    requireSession,
    requireFreshAuth(),
    validate({ body: revokeBodySchema }),
    KeyController.revoke,
);