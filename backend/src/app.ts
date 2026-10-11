import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { StatusCodes } from 'http-status-codes';
import express, { Application, Request, Response, NextFunction } from 'express';

import appRoutes from '@vault/routes';
import { CorsConfig, ServerConfig } from '@vault/config';
import { ErrorHandler, CustomError } from '@vault/shared';

import { healthRouter } from '@vault/modules/health';
import { sessionLoader, csrfProtection } from '@vault/modules/session';

const app: Application = express();

app.use(helmet());
app.use(CorsConfig);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());
app.use(CorsConfig);

app.use('/api/health', healthRouter);

app.use(cookieParser(ServerConfig.SESSION_COOKIE_SECRET));
app.use(sessionLoader);
app.use(csrfProtection);

app.use(appRoutes);

app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new CustomError(
        `Route ${req.method} ${req.originalUrl} not found`,
        StatusCodes.NOT_FOUND
    ));
});

app.use(ErrorHandler);

export default app;