import { uuidv7 } from 'uuidv7';
import { Schema, model } from 'mongoose';

// IProofRecord is the external shape (no _id); the model stores _id internally.
interface IProofDoc {
    _id: string;
    documentId: string;
    versionId: string;
    manifestCanonical: string;
    manifest: unknown;
    signature: string;
    certificate: unknown;
    /** Auxiliary page-leaf index; verified against the signed textEvidence.root before localization. */
    textLeafHashes?: string[];
    signedByUserId: string;
    createdAt: Date;
}

const proofSchema = new Schema<IProofDoc>(
    {
        _id: { type: String, default: () => uuidv7() },
        documentId: { type: String, required: true, immutable: true },
        versionId: { type: String, required: true, immutable: true },
        manifestCanonical: { type: String, required: true, immutable: true },
        manifest: { type: Schema.Types.Mixed, required: true, immutable: true },
        signature: { type: String, required: true, immutable: true },
        certificate: { type: Schema.Types.Mixed, required: true, immutable: true },
        textLeafHashes: { type: [String], required: false, default: undefined, immutable: true },
        signedByUserId: { type: String, required: true, immutable: true },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, id: false },
);

proofSchema.index({ versionId: 1 }, { unique: true });
proofSchema.index({ documentId: 1, createdAt: -1 });

export const ProofModel = model<IProofDoc>('Proof', proofSchema);