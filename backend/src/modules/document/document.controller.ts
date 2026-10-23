import { Request, RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { CustomError, getClientContext, handle } from '@shared';
import { ISessionContext } from '@vault/modules/session';

import { DocumentService } from './document.service';
import type { DocumentIdParams, DocumentVersionParams, ListDocumentsQuery, SignDocumentBody } from './document.schema';

const currentSession = (req: Request): ISessionContext => req.session as ISessionContext;

const pdfBody = (req: Request): Buffer => {
    if (!Buffer.isBuffer(req.body)) {
        throw new CustomError('Invalid PDF request body', StatusCodes.BAD_REQUEST);
    }
    return req.body;
};

const signingContext = (req: Request) => {
    const session = currentSession(req);
    return {
        userId: session.data.userId,
        sessionId: session.id,
        ...getClientContext(req),
    };
};

export const DocumentController: Record<string, RequestHandler> = {
    list: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = currentSession(req);
        const { page, limit } = req.query as unknown as ListDocumentsQuery;
        const result = await DocumentService.list(session.data.userId, page, limit);
        res.status(StatusCodes.OK).json(result);
    }),

    details: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = currentSession(req);
        const { documentId } = req.params as unknown as DocumentIdParams;
        const result = await DocumentService.details(session.data.userId, documentId);
        res.status(StatusCodes.OK).json(result);
    }),

    download: handle(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        const session = currentSession(req);
        const { documentId, versionId } = req.params as unknown as DocumentVersionParams;
        const result = await DocumentService.download(session.data.userId, documentId, versionId);
        const filename = /\.pdf$/i.test(result.name) ? result.name : `${result.name}.pdf`;
        const asciiFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+$/, 'document.pdf') || 'document.pdf';
        const utf8Filename = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
            `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        res.setHeader('Content-Type', result.mediaType);
        res.setHeader('Content-Length', String(result.bytes.length));
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
        res.status(StatusCodes.OK).send(result.bytes);
    }),

    proof: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = currentSession(req);
        const { documentId, versionId } = req.params as unknown as DocumentVersionParams;
        const result = await DocumentService.getProof(session.data.userId, documentId, versionId);
        res.status(StatusCodes.OK).json(result);
    }),

    upload: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = currentSession(req);
        const result = await DocumentService.upload(
            session.data.userId,
            pdfBody(req),
            req.get('x-document-name'),
        );
        res.status(StatusCodes.CREATED).json(result);
    }),

    sign: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const { documentId, versionId } = req.params as unknown as DocumentVersionParams;
        const { profile } = req.body as SignDocumentBody;
        const result = await DocumentService.sign(signingContext(req), documentId, versionId, profile);
        res.status(StatusCodes.OK).json(result);
    }),

    verify: handle(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = currentSession(req);
        const { documentId, versionId } = req.params as unknown as DocumentVersionParams;
        const result = await DocumentService.verify(session.data.userId, documentId, versionId, pdfBody(req));
        res.status(StatusCodes.OK).json(result);
    }),
};
