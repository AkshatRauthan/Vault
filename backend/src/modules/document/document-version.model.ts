import { Schema, model } from 'mongoose';
import { uuidv7 } from 'uuidv7';

import { PDF_TEXT_PROFILE, STRICT_PROFILE } from '@core/sign';
import type { DocumentVersionStatus } from './document.types';

export interface IDocumentVersionDoc {
    _id: string;
    documentId: string;
    ownerUserId: string;
    mediaType: 'application/pdf';
    fileSha256: string;
    fileSize: number;
    storagePath: string;
    preflightPolicy: string;
    preflightParser: string;
    textProfileAvailable: boolean;
    textProfileUnavailableReason?: string;
    status: DocumentVersionStatus;
    signedProfile?: typeof STRICT_PROFILE | typeof PDF_TEXT_PROFILE;
    signedAt?: Date;
    signingStartedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const documentVersionSchema = new Schema<IDocumentVersionDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        documentId: { type: String, required: true, immutable: true },
        ownerUserId: { type: String, required: true, immutable: true },
        mediaType: { type: String, enum: ['application/pdf'], required: true, immutable: true },
        fileSha256: {
            type: String,
            required: true,
            immutable: true,
            match: /^[0-9a-f]{64}$/,
        },
        fileSize: { type: Number, required: true, min: 1, immutable: true },
        storagePath: { type: String, required: true, immutable: true },
        preflightPolicy: { type: String, required: true, immutable: true },
        preflightParser: { type: String, required: true, immutable: true },
        textProfileAvailable: { type: Boolean, required: true, immutable: true },
        textProfileUnavailableReason: { type: String, immutable: true },
        status: { type: String, enum: ['uploaded', 'signing', 'signed'], required: true, default: 'uploaded' },
        signedProfile: { type: String, enum: [STRICT_PROFILE, PDF_TEXT_PROFILE] },
        signedAt: { type: Date },
        signingStartedAt: { type: Date },
    },
    { timestamps: true, versionKey: false, id: false },
);

documentVersionSchema.index({ documentId: 1, createdAt: 1 });
documentVersionSchema.index({ ownerUserId: 1, createdAt: -1 });
documentVersionSchema.index({ ownerUserId: 1, documentId: 1, createdAt: -1, _id: -1 });
documentVersionSchema.index({ documentId: 1, ownerUserId: 1, status: 1 });

export const DocumentVersionModel = model<IDocumentVersionDoc>('DocumentVersion', documentVersionSchema);
