import { uuidv7 } from 'uuidv7';
import { Schema, model } from 'mongoose';

import { IKeyCertificate } from '@core/sign';
import { KeyStatus, RevokeReason } from './key.types';

export interface IKeyVersionDoc {
    /** Stored in Mongo's _id and exposed as keyVersionId (same convention as userId). */
    _id: string;
    keyVersionId: string;
    keyId: string;
    userId: string;
    keyVersion: number;
    publicKey: string;
    status: KeyStatus;
    certificate: IKeyCertificate;
    retiredAt?: Date;
    revokedAt?: Date;
    revokeReason?: RevokeReason;
    createdAt: Date;
    updatedAt: Date;
}

const keyVersionSchema = new Schema<IKeyVersionDoc>(
    {
        _id: { type: String, default: () => uuidv7(), alias: 'keyVersionId' },

        // Everything that identifies or certifies a key version is immutable: Mongoose drops
        // any later attempt to change it. Only the status fields move.
        keyId: { type: String, required: true, immutable: true },
        userId: { type: String, required: true, immutable: true },
        keyVersion: { type: Number, required: true, min: 1, immutable: true },
        publicKey: { type: String, required: true, immutable: true },
        certificate: { type: Schema.Types.Mixed, required: true, immutable: true },

        status: { type: String, enum: ['active', 'retired', 'revoked'], required: true, default: 'active' },
        retiredAt: { type: Date },
        revokedAt: { type: Date },
        revokeReason: { type: String, enum: ['suspected_compromise', 'other'] },
    },
    { timestamps: true, versionKey: false, id: false },
);

// A version number is used once per key.
keyVersionSchema.index({ keyId: 1, keyVersion: 1 }, { unique: true });

// At most one active version per user. This index is what makes concurrent
// first-key creation and concurrent rotation safe.
keyVersionSchema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_key_per_user' },
);

// "My keys", newest first.
keyVersionSchema.index({ userId: 1, createdAt: -1 });

export const KeyVersionModel = model<IKeyVersionDoc>('KeyVersion', keyVersionSchema);