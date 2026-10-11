import { StatusCodes } from "http-status-codes";
import type { Request, Response, NextFunction } from "express";

import { Logger } from '../utils/logger.utils';
import { CustomError } from './customError.class';

/**
 * Centralized error handler — register this as the LAST middleware in
 * every service's Express app. Operational errors (CustomError instances)
 * return their actual message + code; anything else (unexpected bugs) is
 * masked behind a generic 500 so internals never leak to the client.
 */
export function ErrorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _: NextFunction,
): void {
    // Headers already sent -> No need to respond again.
    if (res.headersSent) {
        return;
    }

    const requestId = req.headers['x-request-id'] as string | undefined;

    // Errors that are either (thrown) or (catched + bundled) by us....
    if (err instanceof CustomError) {
        Logger.error(`${err.message}`, {
            requestId,
            stack: err.stack,
            message: err.message,
            errorCode: err.errorCode,
            isOperational: err.isOperational,
        });

        // isOperational: false => So log everything but don't expose error to client.
        if (err.isOperational === false) {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: "Something went wrong while processing your request",
            });
        }

        // isOperational: true => So log everything and also tell client what went wrong.
        else {
            res.status(err.errorCode).json({
                success: false,
                message: err.message
            });
        }
        return;
    }
    else { // Unhandled errors that missed our all safety checks....

        Logger.error(err instanceof Error ? err.name : "[unhandled-error]", {
            requestId,
            stack: err instanceof Error ? err.stack : null,
            message: err instanceof Error ? err.message : String(err),
            isOperational: null,
        });

        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Something went wrong while processing your request.",
        });
        return;
    }
};