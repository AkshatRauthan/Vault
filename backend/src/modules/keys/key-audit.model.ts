import { uuidv7 } from 'uuidv7';
import { Schema, model } from 'mongoose';

import { KeyAuditAction, RevokeReason } from './key.types';

export interface IKeyAuditDoc {
    /** Stored in _id, exposed as eventId. */
    _id: string;
    eventId: string;
    userId: string;
    keyId: string;
    keyVersion: number;
    action: KeyAuditAction;
    reason?: RevokeReason;
    newKeyVersion?: number;
    /** Opaque reference derived from the session ID (never the ID itself). */
    sessionRef: string;
    ip: string;
    userAgent: string;
    createdAt: Date;
}

/** Append-only by convention: the repository only ever creates events, never updates or deletes them. */
const keyAuditSchema = new Schema<IKeyAuditDoc>(
    {
        _id: { type: String, default: () => uuidv7(), alias: 'eventId' },
        userId: { type: String, required: true, immutable: true },
        keyId: { type: String, required: true, immutable: true },
        keyVersion: { type: Number, required: true, immutable: true },
        action: { type: String, enum: ['key.created', 'key.rotated', 'key.revoked'], required: true, immutable: true },
        reason: { type: String, enum: ['suspected_compromise', 'other'], immutable: true },
        newKeyVersion: { type: Number, immutable: true },
        sessionRef: { type: String, required: true, immutable: true },
        ip: { type: String, required: true, immutable: true },
        userAgent: { type: String, required: true, maxlength: 512, immutable: true },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, id: false },
);

keyAuditSchema.index({ userId: 1, createdAt: -1 });

export const KeyAuditModel = model<IKeyAuditDoc>('KeyAuditEvent', keyAuditSchema);