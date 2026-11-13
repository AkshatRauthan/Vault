import { IKeyCertificate, ISignedManifest } from '../../../core/sign';

/** Shape returned by the repository. proofId is the uuidv7 primary key. */
export interface IProofRecord {
    proofId: string;
    documentId: string;
    versionId: string;
    manifestCanonical: string;
    /** The strict manifest, or a content-profile manifest that extends it (e.g. vault-pdf-text-v1). */
    manifest: ISignedManifest;
    signature: string;
    certificate: IKeyCertificate;
    signedAt: Date;
    signedByUserId: string;
    /** Page leaf hashes (hex) for vault-pdf-text-v1 proofs only. Undefined for vault-strict-v1. */
    textLeafHashes?: string[];
    createdAt: Date;
}

export interface INewProofInput {
    documentId: string;
    versionId: string;
    manifestCanonical: string;
    manifest: ISignedManifest;
    signature: string;
    certificate: IKeyCertificate;
    signedByUserId: string;
    textLeafHashes?: string[];
}

export interface ISegmentIndexRecord {
    segmentIndexId: string;
    proofId: string;
    versionId: string;
    chunkCount: number;
    chunkSize: number;
    fileSize: number;
    leaves: Buffer;
    createdAt: Date;
}

export interface INewSegmentIndexInput {
    proofId: string;
    versionId: string;
    chunkCount: number;
    chunkSize: number;
    fileSize: number;
    leaves: Buffer;
}