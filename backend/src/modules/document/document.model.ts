import { Schema, model } from 'mongoose';
import { uuidv7 } from 'uuidv7';

export interface IDocumentDoc {
    _id: string;
    ownerUserId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

const documentSchema = new Schema<IDocumentDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        ownerUserId: { type: String, required: true, immutable: true },
        name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120, immutable: true },
    },
    { timestamps: true, versionKey: false, id: false },
);

documentSchema.index({ ownerUserId: 1, createdAt: -1 });

export const DocumentModel = model<IDocumentDoc>('Document', documentSchema);
