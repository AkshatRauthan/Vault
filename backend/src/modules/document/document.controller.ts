import multer from 'multer';
import { Request, RequestHandler, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError, ZodType } from 'zod';

import { CustomError } from '@shared';
import { PreflightConfig } from '@vault/config';

import { ProofRepository } from '@vault/modules/proof';
import { downloadDocument } from '@vault/infra/storage';
import { ISessionContext } from '@vault/modules/session';

import { DocumentRepository } from './document.repository';
import { DocumentService, DocumentVerifyService } from './document.instance';
import {
    documentParamsSchema,
    uploadBodySchema,
    versionParamsSchema,
    type DocumentParams,
    type UploadBody,
    type VersionParams,
} from './document.schema';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

// Express 4 doesn't catch rejected promises, so forward them to the error handler.
const handle =
    (fn: AsyncHandler): RequestHandler =>
        (req, res, next) => {
            fn(req, res).catch(next);
        };

/** Routes using this sit behind requireSession, so req.session is always set. */
const session = (req: Request): ISessionContext => req.session as ISessionContext;

/**
 * The route-level `validate` middleware runs before multer, so req.body is still empty for multipart
 * requests at that point. Multipart fields and params/queries are therefore validated here instead,
 * after multer has populated req.body and req.file.
 */
const parse = <T>(schema: ZodType<T>, value: unknown): T => {
    try {
        return schema.parse(value);
    } catch (error) {
        if (error instanceof ZodError) {
            const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
            throw new CustomError(message, StatusCodes.BAD_REQUEST);
        }
        throw error;
    }
};

const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PreflightConfig.maxFileSizeBytes },
}).single('file');

export const DocumentController = {
    /** Parses the multipart body before DocumentController.upload runs. */
    uploadMiddleware: fileUpload as RequestHandler,

    upload: handle(async (req, res) => {
        if (!req.file) throw new CustomError('A file is required', StatusCodes.BAD_REQUEST);
        const body = parse(uploadBodySchema, req.body) as UploadBody;
        const s = session(req);

        const result = await DocumentService.upload({
            ownerId: s.data.userId,
            sessionId: s.id,
            ip: req.ip ?? 'unknown',
            userAgent: req.get('user-agent') ?? '',
            fileBuffer: req.file.buffer,
            ...(body.displayName ? { displayName: body.displayName } : {}),
            ...(body.documentId ? { documentId: body.documentId } : {}),
        });

        // A rejection is not a server error: the request was well-formed, the document just can't be
        // signed. 422 (not 400) reflects that, and the body always states the reason explicitly.
        res.status(result.accepted ? StatusCodes.CREATED : StatusCodes.UNPROCESSABLE_ENTITY).json(result);
    }),

    listMine: handle(async (req, res) => {
        const documents = await DocumentRepository.listDocumentsByOwner(session(req).data.userId);
        res.status(StatusCodes.OK).json({ documents });
    }),

    listVersions: handle(async (req, res) => {
        const { documentId } = parse(documentParamsSchema, req.params) as DocumentParams;
        const document = await DocumentRepository.findDocumentById(documentId);
        if (!document || document.ownerId !== session(req).data.userId) {
            throw new CustomError('Document not found', StatusCodes.NOT_FOUND);
        }
        const versions = await DocumentRepository.listVersionsByDocument(documentId);
        res.status(StatusCodes.OK).json({ versions });
    }),

    /**
     * Public: anyone holding this URL can retrieve the proof. The proof carries its own key certificate
     * and is self-verifying against the publicly pinned platform key (see /verify) — it needs no
     * session and no trust in this server beyond "this is the manifest and signature that were stored".
     */
    getProof: handle(async (req, res) => {
        const { documentId, versionId } = parse(versionParamsSchema, req.params) as VersionParams;
        const version = await DocumentRepository.findVersionById(documentId, versionId);
        if (!version) throw new CustomError('Document version not found', StatusCodes.NOT_FOUND);

        const proof = await ProofRepository.findProofByVersion(versionId);
        if (!proof) throw new CustomError('Proof not found for this version', StatusCodes.NOT_FOUND);

        res.status(StatusCodes.OK).json({
            manifest: proof.manifest,
            signature: proof.signature,
            certificate: proof.certificate,
        });
    }),

    download: handle(async (req, res) => {
        const { documentId, versionId } = parse(versionParamsSchema, req.params) as VersionParams;
        const version = await DocumentRepository.findVersionById(documentId, versionId);
        if (!version || version.ownerId !== session(req).data.userId) {
            throw new CustomError('Document version not found', StatusCodes.NOT_FOUND);
        }
        if (!version.storageAvailable || !version.storagePath) {
            throw new CustomError('The original file is no longer available for download', StatusCodes.GONE);
        }

        const bytes = await downloadDocument(version.storagePath, version.sha256);
        res.set('Content-Type', version.mediaType);
        res.set('Content-Disposition', `attachment; filename="${documentId}-v${version.versionNumber}.pdf"`);
        res.status(StatusCodes.OK).send(bytes);
    }),

    /** Public: verification must work for anyone holding a copy of the document, not just its owner. */
    verify: handle(async (req, res) => {
        if (!req.file) throw new CustomError('A file is required', StatusCodes.BAD_REQUEST);
        const { documentId, versionId } = parse(versionParamsSchema, req.params) as VersionParams;
        const result = await DocumentVerifyService.verify(documentId, versionId, req.file.buffer);
        res.status(StatusCodes.OK).json(result);
    }),

    verifyMiddleware: fileUpload as RequestHandler,
};