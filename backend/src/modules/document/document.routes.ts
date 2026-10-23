import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { validate } from '@shared';
import { requireFreshAuth, requireSession } from '@vault/modules/session';

import { DocumentController } from './document.controller';
import { documentIdParamsSchema, documentVersionParamsSchema, listDocumentsQuerySchema, signDocumentBodySchema } from './document.schema';
import { requireRawPdfBody } from './document.middleware';

export const documentRouter: Router = Router();

// Applies to successful and middleware-generated error responses, including rate-limit and validation errors.
documentRouter.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

const signLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

const downloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

documentRouter.get(
    '/',
    requireSession,
    readLimiter,
    validate({ query: listDocumentsQuerySchema }),
    DocumentController.list,
);

documentRouter.get(
    '/:documentId',
    requireSession,
    readLimiter,
    validate({ params: documentIdParamsSchema }),
    DocumentController.details,
);

documentRouter.get(
    '/:documentId/versions/:versionId/download',
    requireSession,
    downloadLimiter,
    validate({ params: documentVersionParamsSchema }),
    DocumentController.download,
);

documentRouter.get(
    '/:documentId/versions/:versionId/proof',
    requireSession,
    readLimiter,
    validate({ params: documentVersionParamsSchema }),
    DocumentController.proof,
);

documentRouter.post(
    '/',
    requireSession,
    uploadLimiter,
    requireRawPdfBody,
    DocumentController.upload,
);

documentRouter.post(
    '/:documentId/versions/:versionId/sign',
    requireSession,
    signLimiter,
    requireFreshAuth(),
    validate({ params: documentVersionParamsSchema, body: signDocumentBodySchema }),
    DocumentController.sign,
);

documentRouter.post(
    '/:documentId/versions/:versionId/verify',
    requireSession,
    verifyLimiter,
    validate({ params: documentVersionParamsSchema }),
    requireRawPdfBody,
    DocumentController.verify,
);
