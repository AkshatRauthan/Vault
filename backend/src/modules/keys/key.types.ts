import { IKeyCertificate } from '@core/sign';

export type KeyStatus = 'active' | 'retired' | 'revoked';
export type RevokeReason = 'suspected_compromise' | 'other';
export type KeyAuditAction = 'key.created' | 'key.rotated' | 'key.revoked';

/**
 * One row per (key, version). A user has one key (keyId) that gains versions on rotation;
 * at most one version per user is active. Old versions are never deleted: old proofs need
 * their public key and certificate to keep verifying.
 */
export interface IKeyVersionRecord {
    keyVersionId: string;
    keyId: string;
    userId: string;
    keyVersion: number;
    /** Base64 of the raw 32-byte Ed25519 public key. */
    publicKey: string;
    status: KeyStatus;
    certificate: IKeyCertificate;
    createdAt: Date;
    retiredAt?: Date;
    revokedAt?: Date;
    revokeReason?: RevokeReason;
}

export interface INewKeyVersion {
    keyId: string;
    userId: string;
    keyVersion: number;
    publicKey: string;
    certificate: IKeyCertificate;
}

/** Who did it, from where. The raw session ID is never stored. */
export interface IKeyContext {
    userId: string;
    sessionId: string;
    ip: string;
    userAgent: string;
}

export interface IKeyAuditInput {
    userId: string;
    keyId: string;
    keyVersion: number;
    action: KeyAuditAction;
    reason?: RevokeReason;
    /** Version that replaced this one (rotation and revocation). */
    newKeyVersion?: number;
    sessionRef: string;
    ip: string;
    userAgent: string;
}

/** Storage the service needs. The Mongoose implementation is key.repository.ts. */
export interface IKeyRepository {
    findActiveByUser(userId: string): Promise<IKeyVersionRecord | null>;
    findVersion(keyId: string, keyVersion: number): Promise<IKeyVersionRecord | null>;
    /** Newest first. */
    listByUser(userId: string): Promise<IKeyVersionRecord[]>;
    /** Inserts a new ACTIVE version. Returns null if it violates a uniqueness rule (a concurrent request won). */
    insertVersion(input: INewKeyVersion): Promise<IKeyVersionRecord | null>;
    /** Moves an ACTIVE version to retired or revoked. Returns null if it is no longer active. */
    transitionFromActive(
        keyVersionId: string,
        to: 'retired' | 'revoked',
        reason?: RevokeReason,
    ): Promise<IKeyVersionRecord | null>;
    /** Puts a just-retired version back to active (undo after a failed rotation). */
    restoreActive(keyVersionId: string): Promise<boolean>;
    addAuditEvent(input: IKeyAuditInput): Promise<void>;
}

/** What a user sees about their own keys. */
export interface IKeyVersionView {
    keyId: string;
    keyVersion: number;
    status: KeyStatus;
    publicKey: string;
    createdAt: Date;
    retiredAt?: Date;
    revokedAt?: Date;
}

/** Public: everything an external verifier needs for one key version. */
export interface IPublicKeyBundle {
    keyId: string;
    keyVersion: number;
    algorithm: 'ed25519';
    publicKey: string;
    /** Online fact; a certificate stays cryptographically valid after revocation. */
    status: KeyStatus;
    retiredAt?: Date;
    revokedAt?: Date;
    certificate: IKeyCertificate;
}