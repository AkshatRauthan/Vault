/**
 * The signing backend, as the rest of the code sees it. Nothing here knows about OpenBao:
 * the OpenBao implementation lives in src/infra/openbao and any other backend (a KMS, an HSM,
 * a test double) only has to satisfy this interface.
 *
 * Every signing call names an explicit key version, so callers never depend on "latest".
 * Private keys never cross this boundary; only public keys and signatures do.
 */

export interface IProviderKeyVersion {
    version: number;
    /** Base64 of the raw 32-byte Ed25519 public key. */
    publicKey: string;
    createdAt: string;
}

export interface IProviderKey {
    latestVersion: number;
    versions: IProviderKeyVersion[];
}

export interface IPlatformKeyRef {
    /** Name the platform key is pinned under by verifiers. */
    keyId: string;
    /** Latest version; new certificates are issued under it. */
    keyVersion: number;
    publicKey: string;
}

export interface IKeyProvider {
    /** Creates the user's signing key if it doesn't exist. Idempotent. */
    ensureUserKey(keyId: string): Promise<IProviderKey>;
    /** Adds a new version. Older versions stay available for verification. */
    rotateUserKey(keyId: string): Promise<IProviderKey>;
    /** Raw 64-byte Ed25519 signature over exactly `data`. */
    signWithUserKey(keyId: string, keyVersion: number, data: Uint8Array): Promise<Buffer>;
    getPlatformKey(): Promise<IPlatformKeyRef>;
    /** Signs with the platform certification key. Used for key certificates only. */
    signWithPlatformKey(keyVersion: number, data: Uint8Array): Promise<Buffer>;
}