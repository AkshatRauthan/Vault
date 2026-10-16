import { KeyAuditModel } from './key-audit.model';
import { IKeyVersionDoc, KeyVersionModel } from './key.model';
import { IKeyAuditInput, IKeyRepository, IKeyVersionRecord, INewKeyVersion, RevokeReason } from './key.types';

const MONGO_DUPLICATE_KEY_CODE = 11000;

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE;

/** Plain objects out, so the service never touches Mongoose documents. */
const toRecord = (doc: IKeyVersionDoc): IKeyVersionRecord => ({
    keyVersionId: doc.keyVersionId,
    keyId: doc.keyId,
    userId: doc.userId,
    keyVersion: doc.keyVersion,
    publicKey: doc.publicKey,
    status: doc.status,
    certificate: doc.certificate,
    createdAt: doc.createdAt,
    ...(doc.retiredAt ? { retiredAt: doc.retiredAt } : {}),
    ...(doc.revokedAt ? { revokedAt: doc.revokedAt } : {}),
    ...(doc.revokeReason ? { revokeReason: doc.revokeReason } : {}),
});

/** Filters use _id (the stored field behind the keyVersionId alias): Mongoose doesn't translate aliases in filters. */
export const KeyRepository: IKeyRepository = {
    async findActiveByUser(userId: string): Promise<IKeyVersionRecord | null> {
        const doc = await KeyVersionModel.findOne({ userId, status: 'active' }).exec();
        return doc ? toRecord(doc) : null;
    },

    async findVersion(keyId: string, keyVersion: number): Promise<IKeyVersionRecord | null> {
        const doc = await KeyVersionModel.findOne({ keyId, keyVersion }).exec();
        return doc ? toRecord(doc) : null;
    },

    async listByUser(userId: string): Promise<IKeyVersionRecord[]> {
        const docs = await KeyVersionModel.find({ userId }).sort({ createdAt: -1, keyVersion: -1 }).exec();
        return docs.map(toRecord);
    },

    async insertVersion(input: INewKeyVersion): Promise<IKeyVersionRecord | null> {
        try {
            return toRecord(await KeyVersionModel.create({ ...input, status: 'active' }));
        } catch (error) {
            if (isDuplicateKeyError(error)) return null;
            throw error;
        }
    },

    async transitionFromActive(
        keyVersionId: string,
        to: 'retired' | 'revoked',
        reason?: RevokeReason,
    ): Promise<IKeyVersionRecord | null> {
        const changes =
            to === 'retired'
                ? { status: 'retired' as const, retiredAt: new Date() }
                : { status: 'revoked' as const, revokedAt: new Date(), ...(reason ? { revokeReason: reason } : {}) };

        // Conditional on status: only one of several concurrent callers can move it.
        const doc = await KeyVersionModel.findOneAndUpdate(
            { _id: keyVersionId, status: 'active' },
            { $set: changes },
            { new: true },
        ).exec();
        return doc ? toRecord(doc) : null;
    },

    async restoreActive(keyVersionId: string): Promise<boolean> {
        const result = await KeyVersionModel.updateOne(
            { _id: keyVersionId, status: 'retired' },
            { $set: { status: 'active' }, $unset: { retiredAt: 1 } },
        ).exec();
        return result.matchedCount === 1;
    },

    async addAuditEvent(input: IKeyAuditInput): Promise<void> {
        await KeyAuditModel.create(input);
    },
};