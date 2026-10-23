import { ED25519_PUBLIC_KEY_LENGTH, ED25519_SIGNATURE_LENGTH, verifyEd25519 } from '@core/crypto';

import { certificateSigningBytes, manifestSigningBytes } from './manifest';
import { ICertificateCheck, IChainVerification, IKeyCertificate, IPinnedPlatformKey, IProof, ISignedManifest } from './sign.types';
import { CERTIFICATE_PURPOSE, CERTIFICATE_SCHEMA, MANIFEST_SCHEMA, SIGNING_ALGORITHM, STRICT_PROFILE, PDF_TEXT_PROFILE, TEXT_NORMALIZATION_VERSION } from './sign.constants';

/**
 * Strict base64: standard alphabet with canonical padding and an exact decoded length.
 * Buffer.from silently skips invalid characters, so the round trip is what rejects them.
 */
export const decodeBase64Strict = (value: unknown, expectedLength: number): Buffer | null => {
    if (typeof value !== 'string') return null;
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === expectedLength && decoded.toString('base64') === value ? decoded : null;
};

const invalid = (reason: string): ICertificateCheck => ({ valid: false, reason });

/** Known schema, and a known profile whose profile-specific block is present and recognised. */
const isSupportedManifest = (manifest: ISignedManifest): boolean => {
    if (manifest.schema !== MANIFEST_SCHEMA) return false;
    if (manifest.profile === STRICT_PROFILE) return true;
    if (manifest.profile === PDF_TEXT_PROFILE) {
        const text = manifest.textEvidence;
        return text?.spec === PDF_TEXT_PROFILE && text.normalization === TEXT_NORMALIZATION_VERSION;
    }
    return false;
};

/** Step 1: the certificate must be signed by a pinned platform key. */
export const verifyCertificate = (
    certificate: IKeyCertificate,
    pinnedKeys: IPinnedPlatformKey[],
): ICertificateCheck => {
    const { payload } = certificate;
    if (payload.schema !== CERTIFICATE_SCHEMA) return invalid('Unsupported certificate schema');

    const pinned = pinnedKeys.find(
        (key) => key.keyId === payload.issuer.keyId && key.keyVersion === payload.issuer.keyVersion,
    );
    if (!pinned) return invalid('Certificate issuer is not a pinned platform key');

    const platformKey = decodeBase64Strict(pinned.publicKey, ED25519_PUBLIC_KEY_LENGTH);
    if (!platformKey) return invalid('Pinned platform key is malformed');

    const signature = decodeBase64Strict(certificate.signature, ED25519_SIGNATURE_LENGTH);
    if (!signature) return invalid('Certificate signature is malformed');

    return verifyEd25519(platformKey, certificateSigningBytes(payload), signature)
        ? { valid: true }
        : invalid('Certificate signature does not verify');
};

/**
 * Spec section 5, steps 1-3. Works offline: it needs only the proof and the pinned
 * platform keys, never the database or OpenBao. Each later step runs only if the
 * earlier ones passed, since nothing below an untrusted certificate is trusted.
 * Never throws: proofs are untrusted input, and a malformed one just fails.
 */
export const verifyProofChain = (proof: IProof, pinnedKeys: IPinnedPlatformKey[]): IChainVerification => {
    const result: IChainVerification = {
        certificateValid: false,
        signerBinding: false,
        signatureValid: false,
        reasons: [],
    };

    try {
        const { manifest, certificate } = proof;

        if (!isSupportedManifest(manifest)) {
            result.reasons.push('Unsupported manifest schema or profile');
            return result;
        }

        // 1. Certificate
        const certificateCheck = verifyCertificate(certificate, pinnedKeys);
        result.certificateValid = certificateCheck.valid;
        if (!certificateCheck.valid) {
            result.reasons.push(certificateCheck.reason ?? 'Certificate is invalid');
            return result;
        }

        // 2. Binding: the certificate must be for exactly this signer and key
        const { payload } = certificate;
        result.signerBinding =
            payload.userId === manifest.signer.userId &&
            payload.keyId === manifest.key.keyId &&
            payload.keyVersion === manifest.key.keyVersion &&
            payload.algorithm === SIGNING_ALGORITHM &&
            manifest.key.algorithm === SIGNING_ALGORITHM &&
            payload.purpose === CERTIFICATE_PURPOSE;
        if (!result.signerBinding) {
            result.reasons.push('Certificate does not match the manifest signer and key');
            return result;
        }

        // 3. Manifest signature, with the certified public key
        const publicKey = decodeBase64Strict(payload.publicKey, ED25519_PUBLIC_KEY_LENGTH);
        const signature = decodeBase64Strict(proof.signature, ED25519_SIGNATURE_LENGTH);
        if (!publicKey || !signature) {
            result.reasons.push('Certified public key or manifest signature is malformed');
            return result;
        }

        result.signatureValid = verifyEd25519(publicKey, manifestSigningBytes(manifest), signature);
        if (!result.signatureValid) result.reasons.push('Manifest signature does not verify');
    } catch {
        result.reasons.push('Malformed proof');
    }

    return result;
};