import { Schema, model } from 'mongoose';
import { uuidv7 } from 'uuidv7';

/** Internal Mongoose shape. versionCounter is incremented atomically to hand out version numbers. */
interface IDocumentDoc {
    _id: string;
    ownerId: string;
    displayName: string;
    versionCounter: number;
    latestVersionNumber: number;
    latestVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const documentSchema = new Schema<IDocumentDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        ownerId: { type: String, required: true, immutable: true },
        displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
        versionCounter: { type: Number, required: true, default: 0 },
        latestVersionNumber: { type: Number, required: true, default: 0 },
        latestVersionId: { type: String, default: null },
    },
    { timestamps: true, versionKey: false, id: false },
);

documentSchema.index({ ownerId: 1, createdAt: -1 });

export const DocumentModel = model<IDocumentDoc>('Document', documentSchema);
export type { IDocumentDoc };