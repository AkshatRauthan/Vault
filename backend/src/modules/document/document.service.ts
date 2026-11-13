import { uuidv7 } from 'uuidv7';
import { CustomError, Logger } from '@shared';
import { StatusCodes } from 'http-status-codes';

import {
    buildManifest,
    buildPdfTextManifest,
    manifestSigningBytes,
    type IDocumentHandler,
    type IPreflightAcceptance,
    type IProof,
} from '@core/sign';
import { ChunkFingerprinter, canonicalBytes, type IFingerprintResult } from '@core/crypto';
import { createDocumentHandlerRegistry, type IDocumentHandlerRegistry } from '@core/documents';

import { uploadDocument } from '@vault/infra/storage';
import { IKeyContext, IKeyService } from '@vault/modules/keys';
import { INewProofInput, IProofRecord, ProofRepository } from '@vault/modules/proof';

import {
    IDocumentRecord,
    IDocumentVersionRecord,
    IUploadRejection,
} from './document.types';
import { DocumentRepository } from './document.repository';

export interface IUploadRequest {
    ownerId: string;
    sessionId: string;
    ip: string;
    userAgent: string;
    fileBuffer: Buffer;
    /** Required when creating a brand new document. */
    displayName?: string;
    /** Present when uploading a new version of an existing document the caller already owns. */
    documentId?: string;
}

export interface IUploadResult {
    accepted: true;
    document: IDocumentRecord;
    version: IDocumentVersionRecord;
    manifest: IProof['manifest'];
    proof: IProofRecord;
}

const PREFLIGHT_HEAD_BYTES = 4096;

const rejection = (reason: IUploadRejection['reason'], detail?: string): IUploadRejection => ({
    accepted: false,
    reason,
    ...(detail ? { detail } : {}),
});

/** Signs bytes with a specific, already-resolved key version. Kept separate from IKeyService so the
 * document service depends only on "can sign", never on how keys are created, rotated or stored. */
export type SignManifestFn = (keyId: string, keyVersion: number, data: Uint8Array) => Promise<Buffer>;

export interface IDocumentServiceDeps {
    registry: IDocumentHandlerRegistry;
    keyService: IKeyService;
    signManifest: SignManifestFn;
    proofRepository: typeof ProofRepository;
    documentRepository: typeof DocumentRepository;
}

/** Registers every supported format's handler. Adding XLSX/DOCX later means one more line here. */
export const createDefaultHandlerRegistry = (pdfHandler: IDocumentHandler): IDocumentHandlerRegistry => {
    const registry = createDocumentHandlerRegistry();
    registry.register(pdfHandler);
    return registry;
};

export const createDocumentService = (deps: IDocumentServiceDeps) => {
    const { registry, keyService, signManifest, proofRepository, documentRepository } = deps;

    const resolveOrCreateDocument = async (
        req: Pick<IUploadRequest, 'ownerId' | 'documentId' | 'displayName'>,
    ): Promise<IDocumentRecord> => {
        if (!req.documentId) {
            if (!req.displayName) {
                throw new CustomError('displayName is required when creating a new document', StatusCodes.BAD_REQUEST);
            }
            return documentRepository.createDocument({ ownerId: req.ownerId, displayName: req.displayName });
        }

        const existing = await documentRepository.findDocumentById(req.documentId);
        if (!existing) throw new CustomError('Document not found', StatusCodes.NOT_FOUND);
        if (existing.ownerId !== req.ownerId) throw new CustomError('Document not found', StatusCodes.NOT_FOUND);
        return existing;
    };

    /** Builds and signs the manifest. Never silently downgrades: the caller always learns the profile used. */
    const buildAndSign = async (params: {
        documentId: string;
        versionId: string;
        fingerprint: IFingerprintResult;
        acceptance: IPreflightAcceptance;
        keyCtx: IKeyContext;
    }): Promise<{ proof: IProof; profile: string; downgraded: boolean; downgradeReason?: string; textLeafHashes?: string[] }> => {
        const { documentId, versionId, fingerprint, acceptance, keyCtx } = params;

        const keyRecord = await keyService.getActiveSigningKey(keyCtx);
        const sharedInput = {
            documentId,
            versionId,
            fingerprint,
            mediaType: acceptance.mediaType,
            preflight: { policy: acceptance.policy, parser: acceptance.parser },
            signerUserId: keyCtx.userId,
            key: { keyId: keyRecord.keyId, keyVersion: keyRecord.keyVersion },
        };

        const manifest = acceptance.contentEvidence
            ? buildPdfTextManifest({
                ...sharedInput,
                textEvidence: { pageCount: acceptance.contentEvidence.unitCount, root: acceptance.contentEvidence.root },
            })
            : buildManifest(sharedInput);

        let signature: Buffer;
        try {
            signature = await signManifest(keyRecord.keyId, keyRecord.keyVersion, manifestSigningBytes(manifest));
        } catch (error) {
            Logger.error('Signing failed', { error: error instanceof Error ? error.message : String(error) });
            throw new CustomError('Signing service unavailable', StatusCodes.SERVICE_UNAVAILABLE, false);
        }

        return {
            proof: { manifest, signature: signature.toString('base64'), certificate: keyRecord.certificate },
            profile: manifest.profile,
            downgraded: !acceptance.contentEvidence,
            ...(acceptance.contentEvidenceUnavailableReason ? { downgradeReason: acceptance.contentEvidenceUnavailableReason } : {}),
            ...(acceptance.contentEvidence ? { textLeafHashes: acceptance.contentEvidence.leafHashes } : {}),
        };
    };

    return {
        /**
         * Upload + preflight + fingerprint + sign, as one request. Rejections (encrypted, malformed,
         * unsupported type, ...) persist nothing. A text-eligible document is signed under
         * vault-pdf-text-v1; otherwise it is signed under vault-strict-v1 and the response says so
         * explicitly via `downgraded`/`downgradeReason` — never silently.
         */
        async upload(req: IUploadRequest): Promise<IUploadResult | IUploadRejection> {
            const handler = registry.resolve(req.fileBuffer.subarray(0, PREFLIGHT_HEAD_BYTES));
            if (!handler) {
                return rejection('unsupported-media-type', `Supported types: ${registry.supportedMediaTypes().join(', ')}`);
            }

            const acceptance = await handler.preflight(req.fileBuffer);
            if (!acceptance.accepted) return rejection(acceptance.reason, acceptance.detail);

            const document = await resolveOrCreateDocument(req);
            const versionNumber = await documentRepository.nextVersionNumber(document.documentId);
            if (versionNumber === null) throw new CustomError('Document not found', StatusCodes.NOT_FOUND);
            const versionId = uuidv7();

            const fp = new ChunkFingerprinter();
            fp.update(req.fileBuffer);
            const fingerprint = fp.finalize();

            const keyCtx: IKeyContext = { userId: req.ownerId, sessionId: req.sessionId, ip: req.ip, userAgent: req.userAgent };
            const signed = await buildAndSign({ documentId: document.documentId, versionId, fingerprint, acceptance, keyCtx });

            const proof = await proofRepository.insertProof({
                documentId: document.documentId,
                versionId,
                manifestCanonical: canonicalBytes(signed.proof.manifest).toString('base64'),
                manifest: signed.proof.manifest,
                signature: signed.proof.signature,
                certificate: signed.proof.certificate,
                signedByUserId: req.ownerId,
                ...(signed.textLeafHashes ? { textLeafHashes: signed.textLeafHashes } : {}),
            } satisfies INewProofInput);

            await proofRepository.insertSegmentIndex({
                proofId: proof.proofId,
                versionId,
                chunkCount: fingerprint.chunkCount,
                chunkSize: fingerprint.chunkSize,
                fileSize: fingerprint.fileSize,
                leaves: fingerprint.leaves,
            });

            // Storage is for download/history only; its failure never invalidates the signature already made.
            let storageAvailable = true;
            let storagePath: string | undefined;
            try {
                const stored = await uploadDocument(
                    { userId: req.ownerId, documentId: document.documentId, versionId },
                    req.fileBuffer,
                );
                storagePath = stored.path;
            } catch (error) {
                if (error instanceof CustomError && error.errorCode === StatusCodes.CONFLICT) throw error; // a path collision is a real bug
                Logger.error('Document stored signature succeeded but file storage failed', {
                    documentId: document.documentId,
                    versionId,
                    error: error instanceof Error ? error.message : String(error),
                });
                storageAvailable = false;
            }

            const version = await documentRepository.insertVersion({
                versionId,
                documentId: document.documentId,
                versionNumber,
                ownerId: req.ownerId,
                mediaType: acceptance.mediaType,
                sizeBytes: fingerprint.fileSize,
                sha256: fingerprint.fileSha256,
                profile: signed.profile,
                profileDowngraded: signed.downgraded,
                ...(signed.downgradeReason ? { downgradeReason: signed.downgradeReason } : {}),
                proofId: proof.proofId,
                storageAvailable,
                ...(storagePath ? { storagePath } : {}),
            });

            await documentRepository.advanceLatestVersion(document.documentId, versionNumber, versionId);

            return { accepted: true, document, version, manifest: signed.proof.manifest, proof };
        },
    };
};

export type IDocumentService = ReturnType<typeof createDocumentService>;