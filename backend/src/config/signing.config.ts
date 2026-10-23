import type { IPinnedPlatformKey } from '@core/sign';
import { StatusCodes } from 'http-status-codes';

import { CustomError } from '@shared';

const PINNED_KEY_ENV = 'VAULT_PLATFORM_PINNED_KEYS_JSON';
const RAW_ED25519_PUBLIC_KEY_BYTES = 32;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCanonicalPublicKey = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === RAW_ED25519_PUBLIC_KEY_BYTES && decoded.toString('base64') === value;
};

/**
 * Loads out-of-band platform trust anchors. Do not populate these dynamically from MongoDB or
 * from the key certificate being verified; the pin must come from a separately trusted channel.
 * Missing pins are allowed during startup, but signing/verification operations fail closed.
 */
export const loadPinnedPlatformKeys = (): IPinnedPlatformKey[] => {
    const raw = process.env[PINNED_KEY_ENV];
    if (!raw?.trim()) {
        throw new CustomError(
            `Verification trust anchors are not configured (${PINNED_KEY_ENV})`,
            StatusCodes.SERVICE_UNAVAILABLE,
        );
    }

    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new CustomError(`Invalid JSON in ${PINNED_KEY_ENV}`, StatusCodes.SERVICE_UNAVAILABLE);
    }

    if (!Array.isArray(value) || value.length === 0) {
        throw new CustomError(`${PINNED_KEY_ENV} must be a non-empty JSON array`, StatusCodes.SERVICE_UNAVAILABLE);
    }

    const pins: IPinnedPlatformKey[] = [];
    const seen = new Set<string>();

    for (const entry of value) {
        if (
            !isRecord(entry) ||
            typeof entry.keyId !== 'string' ||
            !entry.keyId.trim() ||
            !Number.isSafeInteger(entry.keyVersion) ||
            (entry.keyVersion as number) < 1 ||
            !isCanonicalPublicKey(entry.publicKey)
        ) {
            throw new CustomError(
                `Each ${PINNED_KEY_ENV} entry must contain keyId, positive keyVersion, and a canonical base64 32-byte publicKey`,
                StatusCodes.SERVICE_UNAVAILABLE,
            );
        }

        const key = `${entry.keyId}\u0000${entry.keyVersion}`;
        if (seen.has(key)) {
            throw new CustomError(`Duplicate platform key pin in ${PINNED_KEY_ENV}`, StatusCodes.SERVICE_UNAVAILABLE);
        }
        seen.add(key);
        pins.push({
            keyId: entry.keyId,
            keyVersion: entry.keyVersion as number,
            publicKey: entry.publicKey as string,
        });
    }

    return pins;
};
