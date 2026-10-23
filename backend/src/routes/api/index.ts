import { Router } from 'express';

import { authRouter } from '@vault/modules/auth';
import { userRouter } from '@vault/modules/user';
import { documentRouter } from '@vault/modules/document';
import { keyRouter } from '@vault/modules/keys';


const router: Router = Router();

router.use(
    "/auth",
    authRouter
);

router.use(
    '/users',
    userRouter
);

router.use(
    '/documents',
    documentRouter
);

router.use(
    '/keys',
    keyRouter
);

export default router;