export { DocumentModel } from './document.model';
export { documentRouter } from './document.routes';
export { DocumentRepository } from './document.repository';
export { DocumentVersionModel } from './document-version.model';
export { createDocumentVerifyService } from './document-verify.service';
export { DocumentService, DocumentVerifyService } from './document.instance';
export { createDefaultHandlerRegistry, createDocumentService } from './document.service';

export type {
    IDocumentRecord,
    IDocumentVersionRecord,
    INewDocumentInput,
    INewDocumentVersionInput,
    IUploadRejection,
} from './document.types';
export type { IDocumentService, IUploadRequest, IUploadResult } from './document.service';
export type { IDocumentVerifyService, IDocumentVerifyResult } from './document-verify.service';