import { IFingerprintResult } from '@core/crypto';
import {
    CERTIFICATE_PURPOSE, CERTIFICATE_SCHEMA, MANIFEST_SCHEMA, MERKLE_SPEC,
    SIGNING_ALGORITHM, STRICT_PROFILE,
} from './sign.constants';

/** The signed manifest (docs/spec/vault-strict-v1.md, section 3). Format-neutral. */
export interface IManifest {
    schema: typeof MANIFEST_SCHEMA;
    profile: typeof STRICT_PROFILE;
    documentId: string;
    versionId: string;
    file: { sha256: string; size: number; mediaType: string };
    merkle: {
        algorithm: 'sha256';
        spec: typeof MERKLE_SPEC;
        chunkSize: number;
        chunkCount: number;
        root: string;
    };
    preflight: { policy: string; parser: string; result: 'accepted' };
    signer: { type: 'user'; userId: string };
    key: { keyId: string; keyVersion: number; algorithm: typeof SIGNING_ALGORITHM };
    /** Vault's own assertion of time, not an independent timestamp. */
    signedAt: string;
}

export interface IManifestInput {
    documentId: string;
    versionId: string;
    fingerprint: IFingerprintResult;
    mediaType: string;
    preflight: { policy: string; parser: string };
    signerUserId: string;
    key: { keyId: string; keyVersion: number };
    signedAt?: Date;
}

/** Key certificate (spec section 3.1). `publicKey` is base64 of the raw 32-byte key. */
export interface IKeyCertificatePayload {
    schema: typeof CERTIFICATE_SCHEMA;
    certificateId: string;
    issuer: { keyId: string; keyVersion: number };
    userId: string;
    keyId: string;
    keyVersion: number;
    algorithm: typeof SIGNING_ALGORITHM;
    purpose: typeof CERTIFICATE_PURPOSE;
    publicKey: string;
    createdAt: string;
}

export interface IKeyCertificate {
    payload: IKeyCertificatePayload;
    /** Base64 Ed25519 signature over the RFC 8785 canonical bytes of `payload`. */
    signature: string;
}

export interface IProof {
    manifest: IManifest;
    /** Base64 Ed25519 signature over the RFC 8785 canonical bytes of `manifest`. */
    signature: string;
    certificate: IKeyCertificate;
}

/** A platform certification key the verifier trusts, pinned outside MongoDB. */
export interface IPinnedPlatformKey {
    keyId: string;
    keyVersion: number;
    /** Base64 of the raw 32-byte public key. */
    publicKey: string;
}

export interface ICertificateCheck {
    valid: boolean;
    reason?: string;
}

/** Spec section 5, steps 1-3. Reported as separate facts, never one boolean. */
export interface IChainVerification {
    certificateValid: boolean;
    signerBinding: boolean;
    signatureValid: boolean;
    reasons: string[];
}