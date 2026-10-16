import { ProofModel } from './proof.model';
import { SegmentIndexModel } from './segment-index.model';
import { INewProofInput, INewSegmentIndexInput, IProofRecord, ISegmentIndexRecord } from './proof.types';

// Filters use _id (the stored field). Mongoose doesn't translate aliases in filters.
// doc.toObject() returns Record<string,unknown>, so we cast via unknown.
const toProofRecord = (doc: ReturnType<typeof ProofModel.prototype.toObject>): IProofRecord => {
    const o = doc as unknown as IProofRecord & { _id: string; createdAt: Date };
    return {
        proofId: o._id,
        documentId: o.documentId,
        versionId: o.versionId,
        manifestCanonical: o.manifestCanonical,
        manifest: o.manifest,
        signature: o.signature,
        certificate: o.certificate,
        signedAt: o.createdAt,
        signedByUserId: o.signedByUserId,
        createdAt: o.createdAt,
    };
};

const toSegmentRecord = (doc: ReturnType<typeof SegmentIndexModel.prototype.toObject>): ISegmentIndexRecord => {
    const o = doc as unknown as ISegmentIndexRecord & { _id: string };
    return {
        segmentIndexId: o._id,
        proofId: o.proofId,
        versionId: o.versionId,
        chunkCount: o.chunkCount,
        chunkSize: o.chunkSize,
        fileSize: o.fileSize,
        leaves: o.leaves,
        createdAt: o.createdAt,
    };
};

export const ProofRepository = {
    async insertProof(input: INewProofInput): Promise<IProofRecord> {
        return toProofRecord((await ProofModel.create(input)).toObject());
    },

    async insertSegmentIndex(input: INewSegmentIndexInput): Promise<ISegmentIndexRecord> {
        return toSegmentRecord((await SegmentIndexModel.create(input)).toObject());
    },

    async findProofByVersion(versionId: string): Promise<IProofRecord | null> {
        const doc = await ProofModel.findOne({ versionId }).exec();
        return doc ? toProofRecord(doc.toObject()) : null;
    },

    async findSegmentIndexByVersion(versionId: string): Promise<ISegmentIndexRecord | null> {
        const doc = await SegmentIndexModel.findOne({ versionId }).exec();
        return doc ? toSegmentRecord(doc.toObject()) : null;
    },

    async findProofsByDocument(documentId: string): Promise<IProofRecord[]> {
        const docs = await ProofModel.find({ documentId }).sort({ createdAt: -1 }).exec();
        return docs.map((d) => toProofRecord(d.toObject()));
    },
};