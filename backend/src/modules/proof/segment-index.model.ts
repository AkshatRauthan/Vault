import { uuidv7 } from 'uuidv7';
import { Schema, model } from 'mongoose';

interface ISegmentIndexDoc {
    _id: string;
    proofId: string;
    versionId: string;
    chunkCount: number;
    chunkSize: number;
    fileSize: number;
    leaves: Buffer;
    createdAt: Date;
}

const segmentIndexSchema = new Schema<ISegmentIndexDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        proofId: { type: String, required: true, immutable: true },
        versionId: { type: String, required: true, immutable: true },
        chunkCount: { type: Number, required: true, immutable: true },
        chunkSize: { type: Number, required: true, immutable: true },
        fileSize: { type: Number, required: true, immutable: true },
        leaves: { type: Buffer, required: true, immutable: true },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, id: false },
);

segmentIndexSchema.index({ versionId: 1 }, { unique: true });
segmentIndexSchema.index({ proofId: 1 }, { unique: true });

export const SegmentIndexModel = model<ISegmentIndexDoc>('SegmentIndex', segmentIndexSchema);