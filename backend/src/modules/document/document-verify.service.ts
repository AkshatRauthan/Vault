import { Readable } from 'node:stream';
import { CustomError, Logger } from '@shared';
import { StatusCodes } from 'http-status-codes';

import { PlatformTrustConfig, PreflightConfig } from '@vault/config';

import { IKeyService } from '@vault/modules/keys';
import { ProofRepository } from '@vault/modules/proof';
import { diffTextEvidence, runPdfPreflight, type ITextEvidenceDiff } from '@core/pdf';
import { PDF_TEXT_PROFILE, verifyCandidate, type IVerificationResult } from '@core/sign';

import { DocumentRepository } from './document.repository';

export interface IDocumentVerifyResult {
    byteEvidence: IVerificationResult;
    /** Present only when the proof was signed under a content (e.g. text) evidence profile. */
    textEvidence?: ITextEvidenceDiff;
}

export interface IDocumentVerifyDeps {
    keyService: IKeyService;
    proofRepository: typeof ProofRepository;
    documentRepository: typeof DocumentRepository;
}

/**
 * Verifies a candidate file against the proof stored for one document version. Works whether or not
 * Redis/OpenBao are reachable: the trust chain checks against the pinned platform key, never a database
 * lookup, and key status is fetched only to report it — never to decide whether the proof is trusted.
 *
 * Byte evidence (verifyCandidate) is format-agnostic. Text evidence is inherently PDF-specific (the
 * profile is literally named vault-pdf-text-v1), so this module — the integration layer allowed to know
 * about formats — dispatches to core/pdfs directly for it, rather than pretending it is generic.
 */
export const createDocumentVerifyService = (deps: IDocumentVerifyDeps) => ({
    async verify(documentId: string, versionId: string, candidate: Buffer): Promise<IDocumentVerifyResult> {
        const version = await deps.documentRepository.findVersionById(documentId, versionId);
        if (!version) throw new CustomError('Document version not found', StatusCodes.NOT_FOUND);

        const proof = await deps.proofRepository.findProofByVersion(versionId);
        const segmentIndex = await deps.proofRepository.findSegmentIndexByVersion(versionId);
        if (!proof || !segmentIndex) throw new CustomError('Proof not found for this version', StatusCodes.NOT_FOUND);

        // verifyCandidate's keyStatus is 'active' | 'retired' | 'revoked' | undefined (it reports
        // 'unknown' internally when omitted); there is no 'unknown' literal to pass in directly.
        let keyStatus: 'active' | 'retired' | 'revoked' | undefined;
        try {
            const bundle = await deps.keyService.getPublicKeyBundle(proof.manifest.key.keyId, proof.manifest.key.keyVersion);
            if (bundle) keyStatus = bundle.status;
        } catch (error) {
            Logger.warn('Could not look up key status during verification; reporting unknown', {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const byteEvidence = await verifyCandidate({
            proof: { manifest: proof.manifest, signature: proof.signature, certificate: proof.certificate },
            pinnedKeys: PlatformTrustConfig.PINNED_PLATFORM_KEYS,
            keyStatus,
            leaves: segmentIndex.leaves,
            chunkCount: segmentIndex.chunkCount,
            chunkSize: segmentIndex.chunkSize,
            fileSize: segmentIndex.fileSize,
            candidate: Readable.from([candidate]),
        });

        if (proof.manifest.profile !== PDF_TEXT_PROFILE || !('textEvidence' in proof.manifest)) {
            return { byteEvidence };
        }
        if (!proof.textLeafHashes) {
            Logger.error('Text-profile proof is missing its stored leaf hashes', { versionId });
            return { byteEvidence };
        }

        const candidatePreflight = await runPdfPreflight(candidate, PreflightConfig);
        if (!candidatePreflight.preflightPassed) {
            // The candidate itself now fails preflight (e.g. became encrypted): the byte evidence above
            // already shows it as modified; there is nothing further to say about its text.
            return { byteEvidence };
        }

        const textEvidence = diffTextEvidence({
            signedRoot: proof.manifest.textEvidence.root,
            signedPageCount: proof.manifest.textEvidence.pageCount,
            storedLeafHashes: proof.textLeafHashes,
            candidatePages: candidatePreflight.pages,
        });
        return { byteEvidence, textEvidence };
    },
});

export type IDocumentVerifyService = ReturnType<typeof createDocumentVerifyService>;