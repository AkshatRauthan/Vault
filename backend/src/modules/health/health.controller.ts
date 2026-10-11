import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { HealthService } from './health.service';

export const HealthController = {
    getHealth: (async (_req, res, next) => {
        try {
            const report = await HealthService.getReport();
            res.set('Cache-Control', 'no-store');
            // 503 only when the database is down; a degraded API (cache down) still answers 200.
            res.status(report.status === 'down' ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.OK).json(report);
        } catch (err) {
            next(err);
        }
    }) as RequestHandler,
};