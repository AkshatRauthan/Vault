export interface IDocumentLocation {
    userId: string;
    documentId: string;
    versionId: string;
}

export interface IUploadResult {
    path: string;
    sha256: string;
    size: number;
}