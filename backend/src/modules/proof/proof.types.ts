import { IKeyCertificate, IManifest } from '@core/sign';

/** Shape returned by the repository. proofId is the uuidv7 primary key. */
export interface IProofRecord {
    proofId: string;
    documentId: string;
    versionId: string;
    manifestCanonical: string;
    manifest: IManifest;
    signature: string;
    certificate: IKeyCertificate;
    signedAt: Date;
    signedByUserId: string;
    createdAt: Date;
}

export interface INewProofInput {
    documentId: string;
    versionId: string;
    manifestCanonical: string;
    manifest: IManifest;
    signature: string;
    certificate: IKeyCertificate;
    signedByUserId: string;
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