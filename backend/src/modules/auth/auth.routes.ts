import { Router } from 'express';

import { validate } from '@shared';
import { requireSession } from '@vault/modules/session';

import { AuthController } from './auth.controller';
import { changePasswordBodySchema, loginBodySchema, reauthBodySchema, registerBodySchema, sessionRefParamsSchema } from './auth.schema';

export const authRouter: Router = Router();


// No Authentication needed
authRouter.post(
    '/register',
    validate({ body: registerBodySchema }),
    AuthController.register
);

authRouter.post(
    '/login',
    validate({ body: loginBodySchema }),
    AuthController.login
);


// Idempotent: works with or without a session
authRouter.post(
    '/logout',
    AuthController.logout
);


// Authenticated: strict authentication needed
authRouter.use(requireSession);

authRouter.post(
    '/logout-all',
    AuthController.logoutAll
);

authRouter.post(
    '/reauth',
    validate({ body: reauthBodySchema }),
    AuthController.reauth
);

authRouter.post(
    '/change-password',
    validate({ body: changePasswordBodySchema }),
    AuthController.changePassword,
);

authRouter.get(
    '/me',
    AuthController.getMe
);

authRouter.get(
    '/sessions',
    AuthController.listSessions
);

authRouter.delete(
    '/sessions/:ref',
    validate({ params: sessionRefParamsSchema }),
    AuthController.revokeSession,
);