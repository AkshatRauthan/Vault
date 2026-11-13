import { Router } from 'express';

import { DocumentController } from './document.controller';
import { requireFreshAuth, requireSession } from '@vault/modules/session';

export const documentRouter: Router = Router();

// Authenticated: uploading and signing is a sensitive action (step-up required).
documentRouter.post(
    '/',
    requireSession,
    requireFreshAuth(),
    DocumentController.uploadMiddleware,
    DocumentController.upload,
);

documentRouter.get(
    '/',
    requireSession,
    DocumentController.listMine
);

documentRouter.get(
    '/:documentId/versions',
    requireSession,
    DocumentController.listVersions
);

documentRouter.get(
    '/:documentId/versions/:versionId/download',
    requireSession,
    DocumentController.download
);

// Public: a proof must be inspectable and verifiable by anyone holding it, without a Vault account.
documentRouter.get(
    '/:documentId/versions/:versionId/proof',
    DocumentController.getProof
);

documentRouter.post(
    '/:documentId/versions/:versionId/verify',
    DocumentController.verifyMiddleware,
    DocumentController.verify,
);