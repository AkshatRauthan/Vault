import express, { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';

import { PreflightConfig } from '@vault/config';
import { CustomError } from '@shared';

const parsePdfBody = express.raw({
    type: 'application/pdf',
    limit: PreflightConfig.maxFileSizeBytes,
    inflate: false,
});

/**
 * V1 deliberately accepts a raw application/pdf request body, not multipart form data. This avoids
 * introducing a second multipart parser and keeps the request-size boundary explicit. Compression
 * is rejected so body-parser cannot inflate a request beyond the configured byte limit.
 */
export const requireRawPdfBody: RequestHandler = (req, res, next) => {
    const contentType = (req.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/pdf') {
        return next(new CustomError('Send the PDF as the raw request body with Content-Type: application/pdf', StatusCodes.UNSUPPORTED_MEDIA_TYPE));
    }

    const contentEncoding = (req.get('content-encoding') ?? 'identity').trim().toLowerCase();
    if (contentEncoding !== 'identity') {
        return next(new CustomError('Compressed request bodies are not supported', StatusCodes.UNSUPPORTED_MEDIA_TYPE));
    }

    parsePdfBody(req, res, (error) => {
        if (!error) return next();

        const parseError = error as { type?: string; status?: number };
        if (parseError.type === 'entity.too.large' || parseError.status === StatusCodes.REQUEST_TOO_LONG) {
            return next(new CustomError(
                `PDF exceeds the configured ${PreflightConfig.maxFileSizeBytes} byte upload limit`,
                StatusCodes.REQUEST_TOO_LONG,
            ));
        }
        if (parseError.status === StatusCodes.BAD_REQUEST || parseError.type === 'entity.parse.failed') {
            return next(new CustomError('Invalid PDF request body', StatusCodes.BAD_REQUEST));
        }
        next(error);
    });
};
