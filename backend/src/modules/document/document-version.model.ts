import { Schema, model } from 'mongoose';
import { uuidv7 } from 'uuidv7';

interface IDocumentVersionDoc {
    _id: string;
    documentId: string;
    versionNumber: number;
    ownerId: string;
    mediaType: string;
    sizeBytes: number;
    sha256: string;
    profile: string;
    profileDowngraded: boolean;
    downgradeReason?: string;
    proofId: string;
    storageAvailable: boolean;
    storagePath?: string;
    createdAt: Date;
}

const documentVersionSchema = new Schema<IDocumentVersionDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        documentId: { type: String, required: true, immutable: true },
        versionNumber: { type: Number, required: true, immutable: true },
        // Denormalized from the owning Document so authorization checks need no join.
        ownerId: { type: String, required: true, immutable: true },
        mediaType: { type: String, required: true, immutable: true },
        sizeBytes: { type: Number, required: true, immutable: true },
        sha256: { type: String, required: true, immutable: true },
        profile: { type: String, required: true, immutable: true },
        profileDowngraded: { type: Boolean, required: true, immutable: true },
        downgradeReason: { type: String, immutable: true },
        proofId: { type: String, required: true, immutable: true },
        // Not immutable: storageAvailable can flip to false later if the object is deleted under retention.
        storageAvailable: { type: Boolean, required: true, default: true },
        storagePath: { type: String },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, id: false },
);

documentVersionSchema.index({ documentId: 1, versionNumber: 1 }, { unique: true });
documentVersionSchema.index({ proofId: 1 }, { unique: true });
documentVersionSchema.index({ ownerId: 1, createdAt: -1 });

export const DocumentVersionModel = model<IDocumentVersionDoc>('DocumentVersion', documentVersionSchema);
export type { IDocumentVersionDoc };