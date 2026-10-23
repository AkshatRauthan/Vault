import { uuidv7 } from 'uuidv7';
import { StatusCodes } from 'http-status-codes';

import {
    ChunkFingerprinter,
    computeMerkleRootFromLeaves,
} from '@core/crypto';
import {
    buildManifest,
    buildPdfTextManifest,
    IProof,
    IPdfTextManifest,
    IPinnedPlatformKey,
    ISignedManifest,
    manifestSigningBytes,
    PDF_TEXT_PROFILE,
    STRICT_PROFILE,
    verifyProofChain,
    verifyCandidate,
} from '@core/sign';
import {
    createPdfDocumentHandler,
    diffTextEvidence,
    PreflightUnavailableError,
    TEXT_NORMALIZATION_VERSION,
    textRootFromLeafHashes,
} from '@core/pdf';
import type { IPreflightAcceptance, IDocumentHandler } from '@core/sign';
import { PreflightConfig, loadPinnedPlatformKeys } from '@vault/config';
import { CustomError, Logger, sha256Hex } from '@shared';
import { OpenBaoKeyProvider } from '@vault/infra/openbao';
import { buildDocumentPath, deleteDocument as deleteStoredDocument, downloadDocument, uploadDocument } from '@vault/infra/storage';
import { KeyService } from '@vault/modules/keys';
import { ProofRepository } from '@vault/modules/proof';

import { DocumentRepository } from './document.repository';
import type { DocumentProfile, IDocumentVersionRecord, ISigningContext } from './document.types';

const SIGNING_LEASE_MS = 10 * 60 * 1000;
const pdfHandler = createPdfDocumentHandler(PreflightConfig);
const documentHandlers: IDocumentHandler[] = [pdfHandler];

const requireDocumentHandler = (file: Buffer): IDocumentHandler => {
    const head = file.subarray(0, Math.min(file.length, 1024));
    const handler = documentHandlers.find((candidate) => candidate.sniff(head));
    if (!handler) {
        throw new CustomError('Unsupported document format; this endpoint currently accepts PDF files only', StatusCodes.UNSUPPORTED_MEDIA_TYPE);
    }
    return handler;
};

const getAcceptedPreflight = async (handler: IDocumentHandler, file: Buffer): Promise<IPreflightAcceptance> => {
    let result: Awaited<ReturnType<IDocumentHandler['preflight']>>;
    try {
        result = await handler.preflight(file);
    } catch (error) {
        Logger.error('Document preflight could not complete', {
            stack: error instanceof Error ? error.stack : undefined,
            error: error instanceof Error ? error.message : String(error),
        });
        const unavailable = error instanceof PreflightUnavailableError ||
            (error instanceof Error && /unavailable|qpdf|worker/i.test(error.message));
        throw new CustomError(
            unavailable ? 'PDF preflight is unavailable; the document was not accepted' : 'PDF preflight failed; the document was not accepted',
            StatusCodes.SERVICE_UNAVAILABLE,
        );
    }

    if (!result.accepted) {
        throw new CustomError(
            `PDF rejected by preflight policy: ${result.reason}`,
            StatusCodes.UNPROCESSABLE_ENTITY,
        );
    }

    // Treat handler evidence as an internal trust boundary. Generic invariants apply to
    // every format; the PDF text profile additionally has a known root reconstruction rule.
    if (result.contentEvidence) {
        const evidence = result.contentEvidence;
        const genericEvidenceConsistent =
            typeof evidence.profile === 'string' && evidence.profile.length > 0 &&
            typeof evidence.normalization === 'string' && evidence.normalization.length > 0 &&
            Number.isSafeInteger(evidence.unitCount) &&
            evidence.unitCount > 0 &&
            Array.isArray(evidence.leafHashes) &&
            evidence.unitCount === evidence.leafHashes.length;

        let profileEvidenceConsistent = genericEvidenceConsistent;
        if (genericEvidenceConsistent && evidence.profile === PDF_TEXT_PROFILE) {
            let rebuiltTextRoot: string | null = null;
            try {
                rebuiltTextRoot = textRootFromLeafHashes(evidence.leafHashes);
            } catch {
                // Handled by the consistency check below; malformed evidence must fail closed.
            }
            profileEvidenceConsistent =
                evidence.normalization === TEXT_NORMALIZATION_VERSION &&
                rebuiltTextRoot === evidence.root;
        }

        if (!profileEvidenceConsistent) {
            Logger.error('Document handler returned inconsistent content evidence');
            throw new CustomError(
                'Document handler returned inconsistent content evidence',
                StatusCodes.INTERNAL_SERVER_ERROR,
                false,
            );
        }
    }

    return result;
};

const fingerprint = (file: Buffer) => {
    const fingerprinter = new ChunkFingerprinter({ maxBytes: PreflightConfig.maxFileSizeBytes });
    fingerprinter.update(file);
    return fingerprinter.finalize();
};

const sanitizeDocumentName = (raw?: string): string => {
    if (raw === undefined || raw.trim() === '') return 'Untitled PDF';
    const normalized = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!normalized) return 'Untitled PDF';
    if (normalized.length > 120) {
        throw new CustomError('X-Document-Name must be 120 characters or fewer', StatusCodes.BAD_REQUEST);
    }
    return normalized;
};

const cleanupStoredDocument = async (path: string): Promise<void> => {
    try {
        await deleteStoredDocument(path);
    } catch (error) {
        Logger.error('Failed to clean up an unreferenced uploaded document', {
            path,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

const requireOwnedVersion = async (userId: string, documentId: string, versionId: string) => {
    const owned = await DocumentRepository.findOwnedVersion(userId, documentId, versionId);
    if (!owned) throw new CustomError('Document version not found', StatusCodes.NOT_FOUND);
    return owned;
};

const toProof = (record: Awaited<ReturnType<typeof ProofRepository.findProofByVersion>>): IProof => {
    if (!record) throw new CustomError('Signed proof was not found', StatusCodes.CONFLICT);
    return { manifest: record.manifest, signature: record.signature, certificate: record.certificate };
};

type StoredProofRecord = NonNullable<Awaited<ReturnType<typeof ProofRepository.findProofByVersion>>>;

/** A signed proof must belong to this exact persisted version, not just have a valid signature. */
const assertProofMatchesVersion = (proofRecord: StoredProofRecord, version: IDocumentVersionRecord): void => {
    const manifest = proofRecord.manifest;
    const mismatch =
        proofRecord.documentId !== version.documentId ||
        proofRecord.versionId !== version.versionId ||
        manifest.documentId !== version.documentId ||
        manifest.versionId !== version.versionId ||
        manifest.file.sha256 !== version.fileSha256 ||
        manifest.file.size !== version.fileSize ||
        manifest.file.mediaType !== version.mediaType ||
        manifest.preflight.policy !== version.preflightPolicy ||
        manifest.preflight.parser !== version.preflightParser ||
        manifest.signer.userId !== version.ownerUserId ||
        proofRecord.signedByUserId !== manifest.signer.userId ||
        (version.signedProfile !== undefined && version.signedProfile !== manifest.profile) ||
        (version.status === 'signed' && version.signedProfile !== manifest.profile);

    if (mismatch) {
        throw new CustomError('Stored proof does not match its document version metadata', StatusCodes.INTERNAL_SERVER_ERROR, false);
    }
};

const assertProofChain = (proof: IProof, pinnedKeys: IPinnedPlatformKey[]): void => {
    const chain = verifyProofChain(proof, pinnedKeys);
    if (!chain.certificateValid || !chain.signerBinding || !chain.signatureValid) {
        Logger.error('Stored or newly generated proof failed chain verification', { reasons: chain.reasons });
        throw new CustomError('Proof failed cryptographic integrity validation', StatusCodes.INTERNAL_SERVER_ERROR, false);
    }
}

const assertStoredArtifacts = (
    proofRecord: NonNullable<Awaited<ReturnType<typeof ProofRepository.findProofByVersion>>>,
    segmentIndex: NonNullable<Awaited<ReturnType<typeof ProofRepository.findSegmentIndexByVersion>>>,
    pinnedKeys: IPinnedPlatformKey[],
): IProof => {
    const proof = toProof(proofRecord);
    const manifest = proof.manifest;
    if (
        manifest.documentId !== proofRecord.documentId ||
        manifest.versionId !== proofRecord.versionId ||
        segmentIndex.versionId !== proofRecord.versionId ||
        segmentIndex.proofId !== proofRecord.proofId ||
        segmentIndex.chunkCount !== manifest.merkle.chunkCount ||
        segmentIndex.chunkSize !== manifest.merkle.chunkSize ||
        segmentIndex.fileSize !== manifest.file.size
    ) {
        throw new CustomError('Stored proof metadata is inconsistent', StatusCodes.INTERNAL_SERVER_ERROR, false);
    }

    let rebuiltRoot: string;
    try {
        rebuiltRoot = computeMerkleRootFromLeaves(segmentIndex.leaves, segmentIndex.fileSize, segmentIndex.chunkSize);
    } catch {
        throw new CustomError('Stored byte index is malformed', StatusCodes.INTERNAL_SERVER_ERROR, false);
    }
    if (rebuiltRoot !== manifest.merkle.root) {
        throw new CustomError('Stored byte index does not match the signed root', StatusCodes.INTERNAL_SERVER_ERROR, false);
    }

    if (manifest.profile === PDF_TEXT_PROFILE) {
        const textManifest = manifest as IPdfTextManifest;
        const leaves = proofRecord.textLeafHashes;
        if (!leaves || leaves.length !== textManifest.textEvidence.pageCount) {
            throw new CustomError('Stored text index is missing or malformed', StatusCodes.INTERNAL_SERVER_ERROR, false);
        }
        // diffTextEvidence performs this same authenticated-index check before localization.
        const textCheck = diffTextEvidence({
            signedRoot: textManifest.textEvidence.root,
            signedPageCount: textManifest.textEvidence.pageCount,
            storedLeafHashes: leaves,
            candidateLeafHashes: leaves,
            candidatePageCount: leaves.length,
        });
        if (!textCheck.indexTrusted || !textCheck.rootMatches) {
            throw new CustomError('Stored text index does not match the signed root', StatusCodes.INTERNAL_SERVER_ERROR, false);
        }
    }

    assertProofChain(proof, pinnedKeys);
    return proof;
}

const proofResponse = (
    proofRecord: NonNullable<Awaited<ReturnType<typeof ProofRepository.findProofByVersion>>>,
    segmentIndex: NonNullable<Awaited<ReturnType<typeof ProofRepository.findSegmentIndexByVersion>>>,
    pinnedKeys: IPinnedPlatformKey[],
) => {
    const proof = assertStoredArtifacts(proofRecord, segmentIndex, pinnedKeys);
    const manifest = proof.manifest;
    return {
        proofId: proofRecord.proofId,
        documentId: proofRecord.documentId,
        versionId: proofRecord.versionId,
        profile: manifest.profile,
        // This is the timestamp inside the signed manifest (Vault's assertion, not an external TSA).
        signedAt: manifest.signedAt,
        proof,
        /** Transferable auxiliary indexes; each is authenticated against a root in the signed manifest. */
        byteSegmentIndex: {
            chunkSize: segmentIndex.chunkSize,
            chunkCount: segmentIndex.chunkCount,
            fileSize: segmentIndex.fileSize,
            leafHashesBase64: segmentIndex.leaves.toString('base64'),
        },
        ...(manifest.profile === PDF_TEXT_PROFILE
            ? { textEvidenceLeafHashes: proofRecord.textLeafHashes }
            : {}),
    };
};

const recoverOrRejectExistingProof = async (
    ownerUserId: string,
    documentId: string,
    version: IDocumentVersionRecord,
    requestedProfile: DocumentProfile,
    pinnedKeys: IPinnedPlatformKey[],
): Promise<ReturnType<typeof proofResponse> | null> => {
    const [proofRecord, segmentIndex] = await Promise.all([
        ProofRepository.findProofByVersion(version.versionId),
        ProofRepository.findSegmentIndexByVersion(version.versionId),
    ]);

    if (version.status === 'signed') {
        if (!proofRecord || !segmentIndex) {
            throw new CustomError('Signed document is missing its proof index', StatusCodes.SERVICE_UNAVAILABLE);
        }
        assertProofMatchesVersion(proofRecord, version);
        if (proofRecord.manifest.profile !== requestedProfile) {
            throw new CustomError(`This version is already signed under ${proofRecord.manifest.profile}`, StatusCodes.CONFLICT);
        }
        return proofResponse(proofRecord, segmentIndex, pinnedKeys);
    }

    // A previous process may have persisted both artifacts but crashed before updating the version state.
    if (
        version.status === 'signing' &&
        version.signingStartedAt &&
        Date.now() - version.signingStartedAt.getTime() >= SIGNING_LEASE_MS &&
        proofRecord &&
        segmentIndex
    ) {
        const manifest = proofRecord.manifest;
        assertProofMatchesVersion(proofRecord, version);
        const recoveredProfile = manifest.profile;
        const checked = proofResponse(proofRecord, segmentIndex, pinnedKeys);
        const recovered = await DocumentRepository.recoverSignedState(
            ownerUserId,
            documentId,
            version.versionId,
            recoveredProfile,
            new Date(manifest.signedAt),
            version.signingStartedAt,
        );
        if (!recovered) throw new CustomError('Could not recover the existing signature state', StatusCodes.CONFLICT);
        if (recoveredProfile !== requestedProfile) {
            throw new CustomError(`This version is already signed under ${recoveredProfile}`, StatusCodes.CONFLICT);
        }
        return checked;
    }
    return null;
};

const toPublicVersion = (version: IDocumentVersionRecord) => ({
    versionId: version.versionId,
    documentId: version.documentId,
    status: version.status,
    file: {
        mediaType: version.mediaType,
        sha256: version.fileSha256,
        size: version.fileSize,
    },
    preflight: {
        policy: version.preflightPolicy,
        parser: version.preflightParser,
    },
    profiles: {
        [STRICT_PROFILE]: {
            available: true,
            description: 'Commits to the exact file bytes.',
        },
        [PDF_TEXT_PROFILE]: {
            available: version.textProfileAvailable,
            description: 'Adds a commitment to normalized extracted PDF text by page.',
            ...(!version.textProfileAvailable
                ? { reason: version.textProfileUnavailableReason ?? 'Text evidence is unavailable for this PDF.' }
                : {}),
        },
    },
    ...(version.signedProfile ? { signedProfile: version.signedProfile } : {}),
    ...(version.signedAt ? { signedAt: version.signedAt } : {}),
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
});

const toPublicDocument = (document: { documentId: string; name: string; createdAt: Date; updatedAt: Date }) => ({
    documentId: document.documentId,
    name: document.name,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
});

export const DocumentService = {
    async list(userId: string, page: number, limit: number) {
        const { items, total } = await DocumentRepository.listOwnedDocuments(userId, page, limit);
        return {
            items: items.map(({ document, versionCount, latestVersion }) => ({
                document: toPublicDocument(document),
                versionCount,
                latestVersion: latestVersion ? toPublicVersion(latestVersion) : null,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: total === 0 ? 0 : Math.ceil(total / limit),
                hasPreviousPage: page > 1,
                hasNextPage: page * limit < total,
            },
        };
    },

    async details(userId: string, documentId: string) {
        const document = await DocumentRepository.findOwnedDocument(userId, documentId);
        if (!document) throw new CustomError('Document not found', StatusCodes.NOT_FOUND);
        const versions = await DocumentRepository.listOwnedVersions(userId, documentId);
        return {
            document: toPublicDocument(document),
            versions: versions.map(toPublicVersion),
        };
    },

    async download(userId: string, documentId: string, versionId: string) {
        const owned = await requireOwnedVersion(userId, documentId, versionId);
        const bytes = await downloadDocument(owned.version.storagePath, owned.version.fileSha256);
        if (bytes.length !== owned.version.fileSize) {
            Logger.error('Stored document size does not match document metadata', { documentId, versionId });
            throw new CustomError('Stored document metadata failed integrity validation', StatusCodes.CONFLICT);
        }
        return {
            name: owned.document.name,
            mediaType: owned.version.mediaType,
            bytes,
        };
    },

    async getProof(userId: string, documentId: string, versionId: string) {
        const owned = await requireOwnedVersion(userId, documentId, versionId);
        if (owned.version.status !== 'signed') {
            throw new CustomError('This document version has not been signed yet', StatusCodes.CONFLICT);
        }
        const [proofRecord, segmentIndex] = await Promise.all([
            ProofRepository.findProofByVersion(versionId),
            ProofRepository.findSegmentIndexByVersion(versionId),
        ]);
        if (!proofRecord || !segmentIndex) {
            throw new CustomError('Signed proof or its integrity index is unavailable', StatusCodes.SERVICE_UNAVAILABLE);
        }
        assertProofMatchesVersion(proofRecord, owned.version);
        return proofResponse(proofRecord, segmentIndex, loadPinnedPlatformKeys());
    },

    async upload(userId: string, file: Buffer, requestedName?: string) {
        if (!Buffer.isBuffer(file) || file.length === 0) {
            throw new CustomError('Request body must contain a non-empty PDF', StatusCodes.BAD_REQUEST);
        }
        if (file.length > PreflightConfig.maxFileSizeBytes) {
            throw new CustomError('PDF exceeds the configured upload limit', StatusCodes.REQUEST_TOO_LONG);
        }

        // Reject invalid metadata before spending CPU on PDF preflight.
        const name = sanitizeDocumentName(requestedName);
        const handler = requireDocumentHandler(file);
        const accepted = await getAcceptedPreflight(handler, file);
        const fp = fingerprint(file);
        const documentId = uuidv7();
        const versionId = uuidv7();
        const path = buildDocumentPath({ userId, documentId, versionId });

        const stored = await uploadDocument({ userId, documentId, versionId }, file);
        if (stored.sha256 !== fp.fileSha256 || stored.size !== fp.fileSize || stored.path !== path) {
            await cleanupStoredDocument(stored.path);
            throw new CustomError('Stored document did not match the upload fingerprint', StatusCodes.BAD_GATEWAY);
        }

        let documentInserted = false;
        try {
            await DocumentRepository.insertDocument({ documentId, ownerUserId: userId, name });
            documentInserted = true;
            await DocumentRepository.insertVersion({
                versionId,
                documentId,
                ownerUserId: userId,
                mediaType: accepted.mediaType as 'application/pdf',
                fileSha256: fp.fileSha256,
                fileSize: fp.fileSize,
                storagePath: stored.path,
                preflightPolicy: accepted.policy,
                preflightParser: accepted.parser,
                textProfileAvailable: Boolean(accepted.contentEvidence),
                ...(accepted.contentEvidenceUnavailableReason
                    ? { textProfileUnavailableReason: accepted.contentEvidenceUnavailableReason }
                    : {}),
            });
        } catch (error) {
            if (documentInserted) {
                try {
                    await DocumentRepository.deleteVersion(documentId, versionId, userId);
                    await DocumentRepository.deleteDocument(documentId, userId);
                } catch (cleanupError) {
                    Logger.error('Failed to clean up document metadata after upload failure', {
                        documentId,
                        versionId,
                        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    });
                }
            }
            await cleanupStoredDocument(stored.path);
            throw error;
        }

        return {
            documentId,
            versionId,
            name,
            status: 'uploaded' as const,
            file: { mediaType: accepted.mediaType, sha256: fp.fileSha256, size: fp.fileSize },
            preflight: { accepted: true as const, policy: accepted.policy, parser: accepted.parser },
            profiles: {
                [STRICT_PROFILE]: {
                    available: true,
                    description: 'Commits to the exact file bytes and supports positional chunk localization.',
                },
                [PDF_TEXT_PROFILE]: {
                    available: Boolean(accepted.contentEvidence),
                    description: 'Adds a signed commitment to normalized extracted text by page; visual-only changes may not be detected.',
                    ...(!accepted.contentEvidence
                        ? { reason: accepted.contentEvidenceUnavailableReason ?? 'Text evidence is unavailable for this PDF.' }
                        : {}),
                },
            },
            nextAction: 'Choose a profile explicitly when calling the sign endpoint. The server will not silently downgrade a text-profile request.',
        };
    },

    async sign(
        context: ISigningContext,
        documentId: string,
        versionId: string,
        profile: DocumentProfile,
    ) {
        const owned = await requireOwnedVersion(context.userId, documentId, versionId);
        const pinnedKeys = loadPinnedPlatformKeys();

        const existing = await recoverOrRejectExistingProof(
            context.userId,
            documentId,
            owned.version,
            profile,
            pinnedKeys,
        );
        if (existing) return existing;

        const claimedAt = new Date();
        const claimed = await DocumentRepository.claimSigning(
            context.userId,
            documentId,
            versionId,
            claimedAt,
            new Date(claimedAt.getTime() - SIGNING_LEASE_MS),
        );
        if (!claimed) {
            const current = await requireOwnedVersion(context.userId, documentId, versionId);
            const afterRace = await recoverOrRejectExistingProof(
                context.userId,
                documentId,
                current.version,
                profile,
                pinnedKeys,
            );
            if (afterRace) return afterRace;
            throw new CustomError('Signing is already in progress for this document version', StatusCodes.CONFLICT);
        }

        let insertedProofId: string | null = null;
        let signingCommitted = false;
        try {
            // Recheck after acquiring the lease so interrupted earlier attempts can be recovered safely.
            const [priorProof, priorIndex] = await Promise.all([
                ProofRepository.findProofByVersion(versionId),
                ProofRepository.findSegmentIndexByVersion(versionId),
            ]);
            if (priorProof && priorIndex) {
                assertProofMatchesVersion(priorProof, claimed);
                const existingResponse = proofResponse(priorProof, priorIndex, pinnedKeys);
                const recovered = await DocumentRepository.recoverSignedState(
                    context.userId,
                    documentId,
                    versionId,
                    priorProof.manifest.profile,
                    new Date(priorProof.manifest.signedAt),
                    claimedAt,
                );
                if (!recovered) throw new CustomError('Could not recover the existing signature state', StatusCodes.CONFLICT);
                if (priorProof.manifest.profile !== profile) {
                    throw new CustomError(`This version is already signed under ${priorProof.manifest.profile}`, StatusCodes.CONFLICT);
                }
                signingCommitted = true;
                return existingResponse;
            }
            if (priorProof || priorIndex) {
                // This is a partial record from an interrupted sign operation; the stale lease has been reclaimed.
                await ProofRepository.deleteSegmentIndexByVersion(versionId);
                await ProofRepository.deleteProofByVersion(versionId);
            }

            const file = await downloadDocument(claimed.storagePath, claimed.fileSha256);
            if (file.length !== claimed.fileSize || sha256Hex(file) !== claimed.fileSha256) {
                throw new CustomError('Stored document metadata failed integrity validation', StatusCodes.CONFLICT);
            }

            const handler = requireDocumentHandler(file);
            const accepted = await getAcceptedPreflight(handler, file);
            if (accepted.policy !== claimed.preflightPolicy || accepted.parser !== claimed.preflightParser) {
                throw new CustomError(
                    'The preflight policy or parser version changed after upload. Upload the PDF again before signing.',
                    StatusCodes.CONFLICT,
                );
            }

            if (profile === PDF_TEXT_PROFILE && !claimed.textProfileAvailable) {
                throw new CustomError(
                    claimed.textProfileUnavailableReason ?? 'Text evidence was unavailable during upload; upload the PDF again if you want to try the text profile.',
                    StatusCodes.UNPROCESSABLE_ENTITY,
                );
            }

            if (profile === PDF_TEXT_PROFILE && !accepted.contentEvidence) {
                throw new CustomError(
                    accepted.contentEvidenceUnavailableReason ?? 'Text evidence is unavailable; explicitly choose vault-strict-v1 if byte-only signing is acceptable.',
                    StatusCodes.UNPROCESSABLE_ENTITY,
                );
            }

            const fp = fingerprint(file);
            const key = await KeyService.getActiveSigningKey({
                userId: context.userId,
                sessionId: context.sessionId,
                ip: context.ip,
                userAgent: context.userAgent,
            });
            if (key.status !== 'active') {
                throw new CustomError('No active signing key is available', StatusCodes.SERVICE_UNAVAILABLE);
            }

            const contentEvidence = accepted.contentEvidence;
            let manifest: ISignedManifest;
            if (profile === PDF_TEXT_PROFILE) {
                if (!contentEvidence) {
                    throw new CustomError(
                        accepted.contentEvidenceUnavailableReason ?? 'Text evidence is unavailable; explicitly choose vault-strict-v1 if byte-only signing is acceptable.',
                        StatusCodes.UNPROCESSABLE_ENTITY,
                    );
                }
                manifest = buildPdfTextManifest({
                    documentId,
                    versionId,
                    fingerprint: fp,
                    mediaType: claimed.mediaType,
                    preflight: { policy: accepted.policy, parser: accepted.parser },
                    signerUserId: context.userId,
                    key: { keyId: key.keyId, keyVersion: key.keyVersion },
                    textEvidence: { pageCount: contentEvidence.unitCount, root: contentEvidence.root },
                });
            } else {
                manifest = buildManifest({
                    documentId,
                    versionId,
                    fingerprint: fp,
                    mediaType: claimed.mediaType,
                    preflight: { policy: accepted.policy, parser: accepted.parser },
                    signerUserId: context.userId,
                    key: { keyId: key.keyId, keyVersion: key.keyVersion },
                });
            }

            let signature: Buffer;
            try {
                signature = await OpenBaoKeyProvider.signWithUserKey(
                    key.keyId,
                    key.keyVersion,
                    manifestSigningBytes(manifest),
                );
            } catch (error) {
                Logger.error('OpenBao could not sign the document manifest', {
                    documentId,
                    versionId,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw new CustomError('Signing service is unavailable; no new proof was saved', StatusCodes.SERVICE_UNAVAILABLE);
            }
            const proof: IProof = {
                manifest,
                signature: signature.toString('base64'),
                certificate: key.certificate,
            };
            assertProofChain(proof, pinnedKeys);

            const savedProof = await ProofRepository.insertProof({
                documentId,
                versionId,
                manifestCanonical: manifestSigningBytes(manifest).toString('utf8'),
                manifest,
                signature: proof.signature,
                certificate: proof.certificate,
                ...(profile === PDF_TEXT_PROFILE && accepted.contentEvidence
                    ? { textLeafHashes: accepted.contentEvidence.leafHashes }
                    : {}),
                signedByUserId: context.userId,
            });
            insertedProofId = savedProof.proofId;

            const savedIndex = await ProofRepository.insertSegmentIndex({
                proofId: savedProof.proofId,
                versionId,
                chunkCount: fp.chunkCount,
                chunkSize: fp.chunkSize,
                fileSize: fp.fileSize,
                leaves: fp.leaves,
            });

            const response = proofResponse(savedProof, savedIndex, pinnedKeys);
            const marked = await DocumentRepository.markSigned(
                context.userId,
                documentId,
                versionId,
                claimedAt,
                profile,
                new Date(manifest.signedAt),
            );
            if (!marked) {
                throw new CustomError('The document version changed while signing; retry the request', StatusCodes.CONFLICT);
            }

            signingCommitted = true;
            return response;
        } catch (error) {
            if (insertedProofId) {
                const cleanupResults = await Promise.allSettled([
                    ProofRepository.deleteSegmentIndexByVersion(versionId, insertedProofId),
                    ProofRepository.deleteProofByVersion(versionId, insertedProofId),
                ]);
                const failures = cleanupResults.filter((result) => result.status === 'rejected');
                if (failures.length > 0) {
                    Logger.error('Failed to roll back an incomplete proof write', {
                        documentId,
                        versionId,
                        proofId: insertedProofId,
                        failures: failures.map((result) => result.status === 'rejected'
                            ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
                            : 'unknown'),
                    });
                }
            }
            throw error;
        } finally {
            if (!signingCommitted) {
                try {
                    await DocumentRepository.releaseSigning(context.userId, documentId, versionId, claimedAt);
                } catch (cleanupError) {
                    Logger.error('Failed to release a signing lease', {
                        documentId,
                        versionId,
                        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    });
                }
            }
        }
    },

    async verify(userId: string, documentId: string, versionId: string, candidateFile: Buffer) {
        if (!Buffer.isBuffer(candidateFile) || candidateFile.length === 0) {
            throw new CustomError('Request body must contain a non-empty candidate PDF', StatusCodes.BAD_REQUEST);
        }
        if (candidateFile.length > PreflightConfig.maxFileSizeBytes) {
            throw new CustomError('Candidate PDF exceeds the configured upload limit', StatusCodes.REQUEST_TOO_LONG);
        }

        const owned = await requireOwnedVersion(userId, documentId, versionId);
        if (owned.version.status !== 'signed') {
            throw new CustomError('This document version has not been signed yet', StatusCodes.CONFLICT);
        }

        const [proofRecord, segmentIndex] = await Promise.all([
            ProofRepository.findProofByVersion(versionId),
            ProofRepository.findSegmentIndexByVersion(versionId),
        ]);
        if (!proofRecord || !segmentIndex) {
            throw new CustomError('Signed proof or byte index is unavailable', StatusCodes.SERVICE_UNAVAILABLE);
        }

        const pins = loadPinnedPlatformKeys();
        assertProofMatchesVersion(proofRecord, owned.version);
        if (segmentIndex.versionId !== versionId || segmentIndex.proofId !== proofRecord.proofId) {
            throw new CustomError('Stored proof index metadata is inconsistent', StatusCodes.INTERNAL_SERVER_ERROR, false);
        }
        const proof = toProof(proofRecord);
        let keyStatus: 'active' | 'retired' | 'revoked' | 'unknown' = 'unknown';
        try {
            const keyBundle = await KeyService.getPublicKeyBundle(proof.manifest.key.keyId, proof.manifest.key.keyVersion);
            keyStatus = keyBundle?.status ?? 'unknown';
        } catch (error) {
            // Online key status is a separate fact from cryptographic verification. Keep the latter
            // available when the status lookup fails, and report the status as unknown.
            Logger.warn('Could not retrieve current signing-key status during verification', {
                documentId,
                versionId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        const candidate = async function* (): AsyncGenerator<Uint8Array> {
            yield candidateFile;
        };

        const byteVerification = await verifyCandidate({
            proof,
            pinnedKeys: pins,
            keyStatus,
            leaves: segmentIndex.leaves,
            chunkCount: segmentIndex.chunkCount,
            chunkSize: segmentIndex.chunkSize,
            fileSize: segmentIndex.fileSize,
            candidate: candidate(),
            maxBytes: PreflightConfig.maxFileSizeBytes,
        });

        if (proof.manifest.profile !== PDF_TEXT_PROFILE) {
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: {
                    available: false,
                    reason: 'This proof uses vault-strict-v1 and has no signed text-evidence commitment.',
                },
            };
        }

        const manifest = proof.manifest as IPdfTextManifest;
        if (!byteVerification.certificateValid || !byteVerification.signerBinding || !byteVerification.signatureValid) {
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: {
                    available: false,
                    reason: 'The proof chain is invalid; page localization was not trusted.',
                },
            };
        }

        let candidatePreflight: Awaited<ReturnType<IDocumentHandler['preflight']>> | null = null;
        try {
            // The candidate is untrusted. Run the same bounded PDF preflight before relying on its text evidence.
            candidatePreflight = await pdfHandler.preflight(candidateFile);
        } catch (error) {
            Logger.warn('Candidate PDF text preflight could not complete', {
                documentId,
                versionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: { available: false, reason: 'Candidate PDF text preflight was unavailable; byte verification is still reported.' },
            };
        }

        if (!candidatePreflight.accepted) {
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: {
                    available: false,
                    reason: `Candidate PDF did not pass preflight (${candidatePreflight.reason}); byte verification is still reported.`,
                },
            };
        }

        if (
            candidatePreflight.parser !== manifest.preflight.parser ||
            candidatePreflight.policy !== manifest.preflight.policy
        ) {
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: {
                    available: false,
                    reason: 'Candidate preflight parser or policy differs from the signed manifest; text evidence was not compared across parser versions.',
                },
            };
        }

        if (!candidatePreflight.contentEvidence) {
            return {
                documentId,
                versionId,
                profile: proof.manifest.profile,
                byteVerification,
                textEvidence: {
                    available: false,
                    reason: candidatePreflight.contentEvidenceUnavailableReason ?? 'Text could not be extracted from the candidate PDF.',
                },
            };
        }

        const textLeafHashes = proofRecord.textLeafHashes ?? [];
        const textDiff = diffTextEvidence({
            signedRoot: manifest.textEvidence.root,
            signedPageCount: manifest.textEvidence.pageCount,
            storedLeafHashes: textLeafHashes,
            candidateLeafHashes: candidatePreflight.contentEvidence.leafHashes,
            candidatePageCount: candidatePreflight.contentEvidence.unitCount,
        });

        return {
            documentId,
            versionId,
            profile: proof.manifest.profile,
            byteVerification,
            textEvidence: { available: true, ...textDiff },
        };
    },
};
