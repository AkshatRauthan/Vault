import { Router } from 'express';

import { validate } from '@shared';
import { requireSession } from '@vault/modules/session';

import { UsersController } from './user.controller';
import { tagAvailabilityQuerySchema, updateProfileBodySchema } from './user.schema';

export const userRouter: Router = Router();

userRouter.get(
    '/tag-availability',
    validate({ query: tagAvailabilityQuerySchema }),
    UsersController.getTagAvailability,
);

userRouter.patch(
    '/me',
    requireSession,
    validate({ body: updateProfileBodySchema }),
    UsersController.updateMe,
);