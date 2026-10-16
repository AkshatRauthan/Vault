import { IKeyProvider } from './key-provider';
import { certificateSigningBytes } from './manifest';
import { IKeyCertificate, IKeyCertificatePayload } from './sign.types';
import { CERTIFICATE_PURPOSE, CERTIFICATE_SCHEMA, SIGNING_ALGORITHM } from './sign.constants';

export interface ICertificateInput {
    certificateId: string;
    userId: string;
    keyId: string;
    keyVersion: number;
    /** Base64 of the raw 32-byte public key being certified. */
    publicKey: string;
    createdAt: Date;
}

export const buildCertificatePayload = (
    input: ICertificateInput,
    issuer: { keyId: string; keyVersion: number },
): IKeyCertificatePayload => ({
    schema: CERTIFICATE_SCHEMA,
    certificateId: input.certificateId,
    issuer: { keyId: issuer.keyId, keyVersion: issuer.keyVersion },
    userId: input.userId,
    keyId: input.keyId,
    keyVersion: input.keyVersion,
    algorithm: SIGNING_ALGORITHM,
    purpose: CERTIFICATE_PURPOSE,
    publicKey: input.publicKey,
    createdAt: input.createdAt.toISOString(),
});

/**
 * Certifies a user key version with the platform certification key (spec section 3.1).
 * The certificate records the exact platform key version that signed it, so verifiers
 * can pick the right pinned key even after the platform key rotates.
 */
export const issueCertificate = async (provider: IKeyProvider, input: ICertificateInput): Promise<IKeyCertificate> => {
    const platform = await provider.getPlatformKey();
    const payload = buildCertificatePayload(input, { keyId: platform.keyId, keyVersion: platform.keyVersion });
    const signature = await provider.signWithPlatformKey(platform.keyVersion, certificateSigningBytes(payload));
    return { payload, signature: signature.toString('base64') };
};