import { getEnv, getPositiveInteger } from '@shared';
import type { IPinnedPlatformKey } from '../../core/sign';

/**
 * The platform certification key(s) this server trusts, pinned OUTSIDE MongoDB — exactly the point of
 * the certificate design: if the database were compromised, an attacker inserting a fake platform key
 * record must not be trusted by this server's own verification endpoint either.
 *
 * Values come from `pnpm openbao:bootstrap`'s printed output ("Pin this platform public key for
 * verifiers"). Rotating the platform key means adding a second entry here (old key stays pinned for old
 * proofs) before removing the old one — never replace this value as a single in-place edit.
 */
export const PlatformTrustConfig = {
    PINNED_PLATFORM_KEYS: [
        {
            keyId: getEnv('PLATFORM_KEY_ID', 'platform-certification'),
            keyVersion: getPositiveInteger('PLATFORM_KEY_VERSION', '1'),
            publicKey: getEnv('PLATFORM_PUBLIC_KEY'),
        },
    ] as IPinnedPlatformKey[],
};