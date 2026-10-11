import { z } from 'zod';
import { emailSchema, nameSchema, tagSchema } from '@vault/modules/user';

/**
 * Min 8, max 128 (caps argon2 work per request), at least one letter, one number
 * and one special character. Case is not enforced. Passwords are never trimmed.
 */
export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

// Login-side passwords only get a length check, so the composition rules aren't revealed to attackers.
const existingPasswordSchema = z.string().min(1, 'Password is required').max(128, 'Password is too long');

export const registerBodySchema = z.object({
    name: nameSchema,
    tag: tagSchema,
    email: emailSchema,
    password: passwordSchema,
});

export const loginBodySchema = z.object({
    /** Email (contains '@') or user tag. */
    identifier: z.string().trim().min(1, 'Identifier is required').max(254, 'Identifier is too long'),
    password: existingPasswordSchema,
    remember: z.boolean().default(false),
});

export const reauthBodySchema = z.object({ password: existingPasswordSchema });

export const changePasswordBodySchema = z
    .object({
        currentPassword: existingPasswordSchema,
        newPassword: passwordSchema,
    })
    .refine((body) => body.currentPassword !== body.newPassword, {
        message: 'New password must be different from the current password',
        path: ['newPassword'],
    });

export const sessionRefParamsSchema = z.object({
    ref: z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Invalid session reference'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type ReauthBody = z.infer<typeof reauthBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type SessionRefParams = z.infer<typeof sessionRefParamsSchema>;