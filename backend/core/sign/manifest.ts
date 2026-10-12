import { canonicalBytes } from '@core/crypto';

import { IManifest, IManifestInput } from './sign.types';
import { MANIFEST_SCHEMA, MERKLE_SPEC, SIGNING_ALGORITHM, STRICT_PROFILE } from './sign.constants';

/** Assembles the manifest from a fingerprint. Nothing here depends on the document format. */
export const buildManifest = (input: IManifestInput): IManifest => ({
    schema: MANIFEST_SCHEMA,
    profile: STRICT_PROFILE,
    documentId: input.documentId,
    versionId: input.versionId,
    file: {
        sha256: input.fingerprint.fileSha256,
        size: input.fingerprint.fileSize,
        mediaType: input.mediaType,
    },
    merkle: {
        algorithm: 'sha256',
        spec: MERKLE_SPEC,
        chunkSize: input.fingerprint.chunkSize,
        chunkCount: input.fingerprint.chunkCount,
        root: input.fingerprint.merkleRoot,
    },
    preflight: { policy: input.preflight.policy, parser: input.preflight.parser, result: 'accepted' },
    signer: { type: 'user', userId: input.signerUserId },
    key: { keyId: input.key.keyId, keyVersion: input.key.keyVersion, algorithm: SIGNING_ALGORITHM },
    signedAt: (input.signedAt ?? new Date()).toISOString(),
});

/** The exact bytes sent to the signer and checked by verifiers: RFC 8785 canonical JSON. */
export const manifestSigningBytes = (manifest: IManifest): Buffer => canonicalBytes(manifest);

/** The exact bytes the platform key signs for a key certificate. */
export const certificateSigningBytes = (payload: object): Buffer => canonicalBytes(payload);