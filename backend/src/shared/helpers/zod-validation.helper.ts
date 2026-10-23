import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodTypeAny } from 'zod';
import { CustomError } from '../errors';

interface IValidationSchemas {
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: ZodTypeAny;
}

/**
 * Validates req.params / req.query / req.body against zod schemas and replaces
 * each with the parsed (trimmed, lowercased, defaulted) result. Failures become
 * a 400 CustomError listing every issue.
 */
export const validate = (schemas: IValidationSchemas): RequestHandler =>
    (req, _res, next) => {
        for (const part of ['params', 'query', 'body'] as const) {
            const schema = schemas[part];
            if (!schema) continue;

            const result = schema.safeParse(req[part]);
            if (!result.success) {
                const message = result.error.issues
                    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
                    .join('; ');
                return next(new CustomError(message, StatusCodes.BAD_REQUEST));
            }
            // Express exposes some request properties (notably `query`) through prototype getters.
            // Assigning to those properties may fail in strict mode, so shadow them with a validated
            // own data property that downstream controllers can read reliably.
            Object.defineProperty(req, part, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: result.data,
            });
        }
        next();
    };