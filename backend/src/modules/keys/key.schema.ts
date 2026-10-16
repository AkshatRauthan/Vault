import { z } from 'zod';

export const revokeBodySchema = z.object({
    reason: z.enum(['suspected_compromise', 'other']),
});

export const publicKeyParamsSchema = z.object({
    keyId: z.string().uuid('Invalid key id'),
    keyVersion: z.coerce.number().int('Invalid key version').min(1, 'Invalid key version'),
});

export type RevokeBody = z.infer<typeof revokeBodySchema>;
export type PublicKeyParams = z.infer<typeof publicKeyParamsSchema>;