import { timingSafeEqual } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { StorageConfig } from '@vault/config';
import { CustomError, Logger, sha256Hex } from '@shared';

import type { IDocumentLocation, IUploadResult } from './storage.types';

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
    client ??= createClient(StorageConfig.SUPABASE_URL, StorageConfig.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
};

const bucket = () => getClient().storage.from(StorageConfig.SUPABASE_BUCKET);

const isAlreadyExists = (error: { message: string; statusCode?: string | number }): boolean =>
    String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message);

export const buildDocumentPath = (loc: IDocumentLocation): string => {
    for (const seg of [loc.userId, loc.documentId, loc.versionId]) {
        if (!SEGMENT_RE.test(seg)) {
            throw new CustomError('Invalid storage path segment', StatusCodes.BAD_REQUEST);
        }
    }
    return `documents/${loc.userId}/${loc.documentId}/${loc.versionId}.pdf`;
};

export const uploadDocument = async (
    loc: IDocumentLocation,
    data: Buffer,
): Promise<IUploadResult> => {
    const path = buildDocumentPath(loc);
    const { error } = await bucket().upload(path, data, {
        contentType: 'application/pdf',
        upsert: false, // paths are immutable; never overwrite a version
    });
    if (error) {
        if (isAlreadyExists(error)) {
            Logger.warn('Storage object already exists', { path });
            throw new CustomError('Document version already stored', StatusCodes.CONFLICT);
        }
        Logger.error('Storage upload failed', { path, error: error.message });
        throw new CustomError('Failed to store document', StatusCodes.BAD_GATEWAY);
    }
    return { path, sha256: sha256Hex(data), size: data.length };
};

/** Stored file is for download only, never for verification. Hash is re-checked on every read. */
export const downloadDocument = async (
    path: string,
    expectedSha256: string,
): Promise<Buffer> => {
    const { data, error } = await bucket().download(path);
    if (error || !data) {
        Logger.error('Storage download failed', { path, error: error?.message });
        throw new CustomError('Failed to retrieve document', StatusCodes.BAD_GATEWAY);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const actual = Buffer.from(sha256Hex(buf), 'hex');
    const expected = Buffer.from(expectedSha256, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        Logger.error('Stored document hash mismatch', { path });
        throw new CustomError('Stored document failed integrity check', StatusCodes.CONFLICT);
    }
    return buf;
};

export const deleteDocument = async (path: string): Promise<void> => {
    const { error } = await bucket().remove([path]);
    if (error) {
        Logger.error('Storage delete failed', { path, error: error.message });
        throw new CustomError('Failed to delete document', StatusCodes.BAD_GATEWAY);
    }
};

/** Only hand this out after the object's hash has been verified; the URL bypasses the re-check. */
export const getSignedDownloadUrl = async (
    path: string,
    ttlSeconds: number = StorageConfig.SIGNED_URL_TTL_SECONDS,
): Promise<string> => {
    const { data, error } = await bucket().createSignedUrl(path, ttlSeconds, { download: true });
    if (error || !data) {
        Logger.error('Signed URL creation failed', { path, error: error?.message });
        throw new CustomError('Failed to create download link', StatusCodes.BAD_GATEWAY);
    }
    return data.signedUrl;
};