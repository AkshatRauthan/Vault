import { z } from 'zod';

export const uploadBodySchema = z.object({
    /** Omit to create a new document; provide to upload a new version of an existing one. */
    documentId: z.string().uuid('Invalid document id').optional(),
    /** Required only when creating a new document. */
    displayName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long').optional(),
});

export const documentParamsSchema = z.object({
    documentId: z.string().uuid('Invalid document id'),
});

export const versionParamsSchema = documentParamsSchema.extend({
    versionId: z.string().uuid('Invalid version id'),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type DocumentParams = z.infer<typeof documentParamsSchema>;
export type VersionParams = z.infer<typeof versionParamsSchema>;