export * from './manifest';
export * from './proof.chain';
export * from './verify-candidate';
export * from './document-handler';

export {
    CERTIFICATE_PURPOSE,
    CERTIFICATE_SCHEMA,
    MANIFEST_SCHEMA,
    MERKLE_SPEC,
    SIGNING_ALGORITHM,
    STRICT_PROFILE,
    TEXT_NORMALIZATION_VERSION,
    PDF_TEXT_PROFILE,
} from './sign.constants';

export type {
    ICertificateCheck,
    IChainVerification,
    IKeyCertificate,
    IKeyCertificatePayload,
    IManifest,
    IManifestInput,
    IPinnedPlatformKey,
    IProof,
    IPdfTextManifest,
    IPdfTextManifestInput,
    ISignedManifest,
} from './sign.types';

export type {
    ICertificateInput
} from './certificate';

export {
    buildCertificatePayload,
    issueCertificate
} from './certificate';

export type {
    IProviderKey,
    IKeyProvider,
    IPlatformKeyRef,
    IProviderKeyVersion
} from './key-provider';