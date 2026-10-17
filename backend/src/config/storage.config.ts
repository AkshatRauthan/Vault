import { getEnv, getPositiveInteger } from '@shared';

export const StorageConfig = {
    SUPABASE_URL: getEnv('SUPABASE_URL'),

    /** Service role key bypasses RLS. Server-side only, no fallback. */
    SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

    /** Private bucket, no public policies. */
    SUPABASE_BUCKET: getEnv('SUPABASE_BUCKET'),

    SIGNED_URL_TTL_SECONDS: getPositiveInteger('STORAGE_SIGNED_URL_TTL_SECONDS', '300'),
};