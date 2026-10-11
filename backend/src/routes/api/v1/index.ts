import { Router } from 'express';

import { authRouter } from '@vault/modules/auth';
import { userRouter } from '@vault/modules/user';


const router: Router = Router();

router.use(
    "/auth",
    authRouter
);

router.use(
    '/users',
    userRouter
);

export default router;