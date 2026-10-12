import { createPublicKey, verify } from 'node:crypto';

export const ED25519_PUBLIC_KEY_LENGTH = 32;
export const ED25519_SIGNATURE_LENGTH = 64;

// DER prefix that wraps a raw 32-byte Ed25519 public key into SubjectPublicKeyInfo.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Pure Ed25519 verification (RFC 8032) against a raw 32-byte public key, with no
 * pre-hashing. Never throws: malformed keys, wrong lengths and bad signatures all
 * return false, since the inputs come from untrusted proofs.
 */
export const verifyEd25519 = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean => {
    if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH || signature.length !== ED25519_SIGNATURE_LENGTH) {
        return false;
    }
    try {
        const key = createPublicKey({
            key: Buffer.concat([SPKI_PREFIX, publicKey]),
            format: 'der',
            type: 'spki',
        });
        return verify(null, message, key, signature);
    } catch {
        return false;
    }
};