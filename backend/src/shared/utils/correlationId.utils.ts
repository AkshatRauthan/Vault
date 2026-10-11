import { uuidv7 } from 'uuidv7';
import type { Request, Response, NextFunction } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Express middleware — generates a new x-request-id at the Gateway
 * if one doesn't exist, then propagates it on every response.
 * All downstream services read this header and include it in logs
 * so a full request trace can be reconstructed across services.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) ?? uuidv7();
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
};

export const getRequestId = (req: Request): string =>
    req.headers[REQUEST_ID_HEADER] as string;