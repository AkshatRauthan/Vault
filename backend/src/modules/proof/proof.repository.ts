import { ProofModel } from './proof.model';
import { SegmentIndexModel } from './segment-index.model';
import {
    INewProofInput,
    INewSegmentIndexInput,
    IProofRecord,
    ISegmentIndexRecord,
} from './proof.types';

// Filters use _id (the stored field). Mongoose doesn't translate aliases in filters.
// doc.toObject() returns Record<string, unknown>, so we cast via unknown.
const toProofRecord = (
    doc: ReturnType<typeof ProofModel.prototype.toObject>,
): IProofRecord => {
    const o = doc as unknown as IProofRecord & {
        _id: string;
        createdAt: Date;
    };

    return {
        proofId: o._id,
        documentId: o.documentId,
        versionId: o.versionId,
        manifestCanonical: o.manifestCanonical,
        manifest: o.manifest,
        signature: o.signature,
        certificate: o.certificate,
        ...(o.textLeafHashes
            ? { textLeafHashes: o.textLeafHashes }
            : {}),
        signedAt: o.createdAt,
        signedByUserId: o.signedByUserId,
        createdAt: o.createdAt,
    };
};

/**
 * Read the hydrated Mongoose document directly. Mongoose's `toObject()`
 * converts Buffer paths into BSON Binary objects; the crypto layer requires
 * a Node Buffer.
 */
const toSegmentRecord = (doc: unknown): ISegmentIndexRecord => {
    const o = doc as {
        _id: string;
        proofId: string;
        versionId: string;
        chunkCount: number;
        chunkSize: number;
        fileSize: number;
        leaves: unknown;
        createdAt: Date;
    };

    if (!Buffer.isBuffer(o.leaves)) {
        throw new TypeError(
            'Segment-index leaves must be a hydrated Mongoose Buffer',
        );
    }

    return {
        segmentIndexId: o._id,
        proofId: o.proofId,
        versionId: o.versionId,
        chunkCount: o.chunkCount,
        chunkSize: o.chunkSize,
        fileSize: o.fileSize,
        // Copy into a plain Node Buffer before passing bytes to Merkle routines.
        leaves: Buffer.from(o.leaves),
        createdAt: o.createdAt,
    };
};

export const ProofRepository = {
    async insertProof(
        input: INewProofInput,
    ): Promise<IProofRecord> {
        return toProofRecord(
            (await ProofModel.create(input)).toObject(),
        );
    },

    async insertSegmentIndex(
        input: INewSegmentIndexInput,
    ): Promise<ISegmentIndexRecord> {
        return toSegmentRecord(
            await SegmentIndexModel.create(input),
        );
    },

    async findProofByVersion(
        versionId: string,
    ): Promise<IProofRecord | null> {
        const doc = await ProofModel.findOne({ versionId }).exec();

        return doc ? toProofRecord(doc.toObject()) : null;
    },

    async findSegmentIndexByVersion(
        versionId: string,
    ): Promise<ISegmentIndexRecord | null> {
        const doc = await SegmentIndexModel.findOne({ versionId }).exec();

        return doc ? toSegmentRecord(doc) : null;
    },

    async findProofsByDocument(
        documentId: string,
    ): Promise<IProofRecord[]> {
        const docs = await ProofModel.find({ documentId })
            .sort({ createdAt: -1 })
            .exec();

        return docs.map((doc) => toProofRecord(doc.toObject()));
    },

    async deleteProofByVersion(
        versionId: string,
        proofId?: string,
    ): Promise<void> {
        await ProofModel.deleteOne({
            versionId,
            ...(proofId ? { _id: proofId } : {}),
        }).exec();
    },

    async deleteSegmentIndexByVersion(
        versionId: string,
        proofId?: string,
    ): Promise<void> {
        await SegmentIndexModel.deleteOne({
            versionId,
            ...(proofId ? { proofId } : {}),
        }).exec();
    },
};