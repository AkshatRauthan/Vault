import { PDF_TEXT_PROFILE, STRICT_PROFILE } from '@core/sign';

export type DocumentProfile = typeof STRICT_PROFILE | typeof PDF_TEXT_PROFILE;
export type DocumentVersionStatus = 'uploaded' | 'signing' | 'signed';

export interface IDocumentRecord {
    documentId: string;
    ownerUserId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDocumentVersionRecord {
    versionId: string;
    documentId: string;
    ownerUserId: string;
    mediaType: 'application/pdf';
    fileSha256: string;
    fileSize: number;
    storagePath: string;
    preflightPolicy: string;
    preflightParser: string;
    textProfileAvailable: boolean;
    textProfileUnavailableReason?: string;
    status: DocumentVersionStatus;
    signedProfile?: DocumentProfile;
    signedAt?: Date;
    signingStartedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDocumentWithVersion {
    document: IDocumentRecord;
    version: IDocumentVersionRecord;
}

/** Internal repository projection used by the paginated dashboard query. */
export interface IDocumentListRecord {
    document: IDocumentRecord;
    versionCount: number;
    latestVersion: IDocumentVersionRecord | null;
}

export interface ISigningContext {
    userId: string;
    sessionId: string;
    ip: string;
    userAgent: string;
}
