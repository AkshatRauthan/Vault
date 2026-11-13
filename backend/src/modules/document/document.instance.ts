
import { PreflightConfig } from '@vault/config';
import { createPdfDocumentHandler } from '@core/pdf';

import { KeyService } from '@vault/modules/keys';
import { ProofRepository } from '@vault/modules/proof';
import { OpenBaoKeyProvider } from '@vault/infra/openbao';

import { DocumentRepository } from './document.repository';
import { createDocumentVerifyService } from './document-verify.service';
import { createDefaultHandlerRegistry, createDocumentService } from './document.service';

/** Adding a format later: write its IDocumentHandler, register it here. Nothing else changes. */
export const DocumentService = createDocumentService({
    registry: createDefaultHandlerRegistry(createPdfDocumentHandler(PreflightConfig)),
    keyService: KeyService,
    signManifest: (keyId, keyVersion, data) => OpenBaoKeyProvider.signWithUserKey(keyId, keyVersion, data),
    proofRepository: ProofRepository,
    documentRepository: DocumentRepository,
});

export const DocumentVerifyService = createDocumentVerifyService({
    keyService: KeyService,
    proofRepository: ProofRepository,
    documentRepository: DocumentRepository,
});