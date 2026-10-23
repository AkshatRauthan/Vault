import { z } from 'zod';
import { PDF_TEXT_PROFILE, STRICT_PROFILE } from '@core/sign';

const uuidLike = z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'must be a UUID identifier',
);

export const documentIdParamsSchema = z.object({
    documentId: uuidLike,
});

export const documentVersionParamsSchema = z.object({
    documentId: uuidLike,
    versionId: uuidLike,
});

export const listDocumentsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const signDocumentBodySchema = z.object({
    /** Explicit by design: the server never silently downgrades a text-profile request. */
    profile: z.enum([STRICT_PROFILE, PDF_TEXT_PROFILE]),
}).strict();

export type SignDocumentBody = z.infer<typeof signDocumentBodySchema>;
export type DocumentVersionParams = z.infer<typeof documentVersionParamsSchema>;
export type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
