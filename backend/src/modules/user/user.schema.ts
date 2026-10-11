import { z } from 'zod';
import { RESERVED_TAGS, TAG_PATTERN } from './user.constants';

/** Reusable field schemas. Auth composes these into its register schema. */
export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email is too long');

export const tagSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(
        TAG_PATTERN,
        'Tag must be 3-20 characters: lowercase letters, numbers or underscores, starting with a letter',
    )
    .refine((tag) => !RESERVED_TAGS.has(tag), 'This tag is reserved');

export const nameSchema = z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long');

export const updateProfileBodySchema = z.object({ name: nameSchema });
export const tagAvailabilityQuerySchema = z.object({ tag: tagSchema });
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
export type TagAvailabilityQuery = z.infer<typeof tagAvailabilityQuerySchema>;