import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';

import { CustomError, Logger } from '@shared';
import { IKeyProvider, IProviderKey, IProviderKeyVersion, issueCertificate } from '@core/sign';
import {
    IKeyAuditInput,
    IKeyContext,
    IKeyRepository,
    IKeyVersionRecord,
    IKeyVersionView,
    IPublicKeyBundle,
    RevokeReason,
} from './key.types';

export interface IKeyServiceDeps {
    repository: IKeyRepository;
    provider: IKeyProvider;
    newId?: () => string;
    now?: () => Date;
}

/** Same derivation the auth module uses for session refs: the raw session ID is never stored. */
const hashSessionId = (sessionId: string): string =>
    createHash('sha256').update(sessionId).digest('base64url').slice(0, 22);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toView = (record: IKeyVersionRecord): IKeyVersionView => ({
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    status: record.status,
    publicKey: record.publicKey,
    createdAt: record.createdAt,
    ...(record.retiredAt ? { retiredAt: record.retiredAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
});

const toBundle = (record: IKeyVersionRecord): IPublicKeyBundle => ({
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    algorithm: 'ed25519',
    publicKey: record.publicKey,
    status: record.status,
    ...(record.retiredAt ? { retiredAt: record.retiredAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    certificate: record.certificate,
});

export const createKeyService = (deps: IKeyServiceDeps) => {
    const { repository, provider } = deps;
    const newId = deps.newId ?? uuidv7;
    const now = deps.now ?? (() => new Date());

    /** Any failure from the signing backend becomes a non-operational 503; details go to the log only. */
    const callProvider = async <T>(operation: string, run: () => Promise<T>): Promise<T> => {
        try {
            return await run();
        } catch (error) {
            Logger.error(`Signing key operation failed: ${operation}`, { error: errorMessage(error) });
            throw new CustomError('Signing service unavailable', StatusCodes.SERVICE_UNAVAILABLE, false);
        }
    };

    const latestVersionOf = (key: IProviderKey): IProviderKeyVersion => {
        const latest = key.versions.find((version) => version.version === key.latestVersion);
        if (!latest) {
            Logger.error('Signing backend returned a key without its latest version', {});
            throw new CustomError('Signing service unavailable', StatusCodes.SERVICE_UNAVAILABLE, false);
        }
        return latest;
    };

    /** Audit failures are logged loudly but never undo an operation that already happened. */
    const audit = async (
        ctx: IKeyContext,
        input: Pick<IKeyAuditInput, 'keyId' | 'keyVersion' | 'action' | 'reason' | 'newKeyVersion'>,
    ): Promise<void> => {
        try {
            await repository.addAuditEvent({
                userId: ctx.userId,
                sessionRef: hashSessionId(ctx.sessionId),
                ip: ctx.ip,
                userAgent: ctx.userAgent,
                ...input,
            });
        } catch (error) {
            Logger.error('Failed to write key audit event', { action: input.action, error: errorMessage(error) });
        }
    };

    const certify = (userId: string, keyId: string, version: IProviderKeyVersion) =>
        callProvider('issueCertificate', () =>
            issueCertificate(provider, {
                certificateId: newId(),
                userId,
                keyId,
                keyVersion: version.version,
                publicKey: version.publicKey,
                createdAt: now(),
            }),
        );

    /**
     * First key for a user: a new key in the backend, its certificate, then the record.
     * If two requests race, the unique "one active key per user" index lets exactly one insert
     * win; the loser returns the winner's key and leaves one unused (harmless) backend key.
     */
    const createFirstKey = async (ctx: IKeyContext): Promise<IKeyVersionRecord> => {
        const keyId = newId();
        const key = await callProvider('ensureUserKey', () => provider.ensureUserKey(keyId));
        const version = latestVersionOf(key);
        const certificate = await certify(ctx.userId, keyId, version);

        const inserted = await repository.insertVersion({
            keyId,
            userId: ctx.userId,
            keyVersion: version.version,
            publicKey: version.publicKey,
            certificate,
        });

        if (!inserted) {
            const winner = await repository.findActiveByUser(ctx.userId);
            if (winner) {
                Logger.warn('Concurrent first-key creation; one unused backend key left behind', {
                    userId: ctx.userId,
                    unusedKeyId: keyId,
                });
                return winner;
            }
            throw new CustomError('Could not create the signing key; try again', StatusCodes.CONFLICT);
        }

        await audit(ctx, { keyId, keyVersion: inserted.keyVersion, action: 'key.created' });
        Logger.info('Signing key created', { userId: ctx.userId, keyId });
        return inserted;
    };

    /**
     * Replaces the active version with a new one (rotation or revocation). Order matters:
     * backend rotation and certificate first, then retire the old version (conditional on it
     * still being active, so only one concurrent caller wins), then insert the new one.
     */
    const replaceActiveVersion = async (
        ctx: IKeyContext,
        active: IKeyVersionRecord,
        mode: 'rotate' | 'revoke',
        reason?: RevokeReason,
    ): Promise<{ old: IKeyVersionRecord; created: IKeyVersionRecord }> => {
        const key = await callProvider('rotateUserKey', () => provider.rotateUserKey(active.keyId));
        const version = latestVersionOf(key);
        const certificate = await certify(ctx.userId, active.keyId, version);

        const old = await repository.transitionFromActive(
            active.keyVersionId,
            mode === 'revoke' ? 'revoked' : 'retired',
            reason,
        );
        if (!old) {
            throw new CustomError('Signing key was changed by another request; try again', StatusCodes.CONFLICT);
        }

        // After a failed insert a rotation is undone (the old key is active again). A revocation is NOT
        // undone: the key stays revoked, and the next signing request creates a fresh key.
        const undoIfRotation = async (): Promise<void> => {
            if (mode !== 'rotate') return;
            try {
                await repository.restoreActive(old.keyVersionId);
            } catch (error) {
                Logger.error('Could not restore the active key after a failed rotation', {
                    userId: ctx.userId,
                    error: errorMessage(error),
                });
            }
        };

        let created: IKeyVersionRecord | null;
        try {
            created = await repository.insertVersion({
                keyId: active.keyId,
                userId: ctx.userId,
                keyVersion: version.version,
                publicKey: version.publicKey,
                certificate,
            });
        } catch (error) {
            await undoIfRotation();
            throw error;
        }
        if (!created) {
            await undoIfRotation();
            throw new CustomError('Signing key was changed by another request; try again', StatusCodes.CONFLICT);
        }

        await audit(ctx, {
            keyId: active.keyId,
            keyVersion: old.keyVersion,
            newKeyVersion: created.keyVersion,
            action: mode === 'revoke' ? 'key.revoked' : 'key.rotated',
            ...(reason ? { reason } : {}),
        });
        Logger.info(mode === 'revoke' ? 'Signing key revoked and replaced' : 'Signing key rotated', {
            userId: ctx.userId,
            keyId: active.keyId,
            newKeyVersion: created.keyVersion,
        });
        return { old, created };
    };

    return {
        /** The user's active signing key (with its certificate), created on first use. For the sign module. */
        async getActiveSigningKey(ctx: IKeyContext): Promise<IKeyVersionRecord> {
            return (await repository.findActiveByUser(ctx.userId)) ?? (await createFirstKey(ctx));
        },

        /** Rotates the user's key. With no key yet, this creates the first one (created: true). */
        async rotateKey(ctx: IKeyContext): Promise<{ key: IKeyVersionView; created: boolean }> {
            const active = await repository.findActiveByUser(ctx.userId);
            if (!active) return { key: toView(await createFirstKey(ctx)), created: true };

            const { created } = await replaceActiveVersion(ctx, active, 'rotate');
            return { key: toView(created), created: false };
        },

        /** Revokes the active version and immediately replaces it, so signing keeps working. */
        async revokeActiveKey(
            ctx: IKeyContext,
            reason: RevokeReason,
        ): Promise<{ revoked: IKeyVersionView; active: IKeyVersionView }> {
            const active = await repository.findActiveByUser(ctx.userId);
            if (!active) throw new CustomError('No signing key to revoke', StatusCodes.NOT_FOUND);

            const { old, created } = await replaceActiveVersion(ctx, active, 'revoke', reason);
            return { revoked: toView(old), active: toView(created) };
        },

        async listKeyVersions(userId: string): Promise<IKeyVersionView[]> {
            return (await repository.listByUser(userId)).map(toView);
        },

        /** Public lookup for external verifiers. Null if the key version doesn't exist. */
        async getPublicKeyBundle(keyId: string, keyVersion: number): Promise<IPublicKeyBundle | null> {
            const record = await repository.findVersion(keyId, keyVersion);
            return record ? toBundle(record) : null;
        },
    };
};

export type IKeyService = ReturnType<typeof createKeyService>;
