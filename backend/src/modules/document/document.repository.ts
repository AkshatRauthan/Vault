import { DocumentModel, type IDocumentDoc } from './document.model';
import { DocumentVersionModel, type IDocumentVersionDoc } from './document-version.model';
import {
    IDocumentRecord,
    IDocumentVersionRecord,
    INewDocumentInput,
    INewDocumentVersionInput,
} from './document.types';

const toDocumentRecord = (doc: IDocumentDoc): IDocumentRecord => ({
    documentId: doc._id,
    ownerId: doc.ownerId,
    displayName: doc.displayName,
    latestVersionNumber: doc.latestVersionNumber,
    latestVersionId: doc.latestVersionId ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

const toVersionRecord = (doc: IDocumentVersionDoc): IDocumentVersionRecord => ({
    versionId: doc._id,
    documentId: doc.documentId,
    versionNumber: doc.versionNumber,
    ownerId: doc.ownerId,
    mediaType: doc.mediaType,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    profile: doc.profile,
    profileDowngraded: doc.profileDowngraded,
    ...(doc.downgradeReason ? { downgradeReason: doc.downgradeReason } : {}),
    proofId: doc.proofId,
    storageAvailable: doc.storageAvailable,
    ...(doc.storagePath ? { storagePath: doc.storagePath } : {}),
    createdAt: doc.createdAt,
});

export const DocumentRepository = {
    async createDocument(input: INewDocumentInput): Promise<IDocumentRecord> {
        const doc = await DocumentModel.create({ ...input, versionCounter: 0, latestVersionNumber: 0, latestVersionId: null });
        return toDocumentRecord(doc.toObject());
    },

    async findDocumentById(documentId: string): Promise<IDocumentRecord | null> {
        const doc = await DocumentModel.findById(documentId).exec();
        return doc ? toDocumentRecord(doc.toObject()) : null;
    },

    async listDocumentsByOwner(ownerId: string): Promise<IDocumentRecord[]> {
        const docs = await DocumentModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
        return docs.map((d) => toDocumentRecord(d.toObject()));
    },

    /** Atomically assigns the next version number for a document (1, 2, 3, ...). */
    async nextVersionNumber(documentId: string): Promise<number | null> {
        const doc = await DocumentModel.findOneAndUpdate(
            { _id: documentId },
            { $inc: { versionCounter: 1 } },
            { new: true },
        ).exec();
        return doc ? doc.versionCounter : null;
    },

    async insertVersion(
        input: INewDocumentVersionInput & { versionNumber: number },
    ): Promise<IDocumentVersionRecord> {
        // The versionId was already used for the proof and segment index records, so it must become this
        // document's _id rather than letting Mongoose generate a different one.
        const { versionId, ...rest } = input;
        const doc = await DocumentVersionModel.create({ _id: versionId, ...rest });
        return toVersionRecord(doc.toObject());
    },

    /**
     * Advances Document.latestVersionNumber/latestVersionId only if versionNumber is newer than what's
     * stored, so concurrent uploads that finish out of order never move "latest" backwards.
     */
    async advanceLatestVersion(documentId: string, versionNumber: number, versionId: string): Promise<void> {
        await DocumentModel.updateOne(
            { _id: documentId, latestVersionNumber: { $lt: versionNumber } },
            { $set: { latestVersionNumber: versionNumber, latestVersionId: versionId } },
        ).exec();
    },

    async listVersionsByDocument(documentId: string): Promise<IDocumentVersionRecord[]> {
        const docs = await DocumentVersionModel.find({ documentId }).sort({ versionNumber: -1 }).exec();
        return docs.map((d) => toVersionRecord(d.toObject()));
    },

    async findVersionById(documentId: string, versionId: string): Promise<IDocumentVersionRecord | null> {
        const doc = await DocumentVersionModel.findOne({ _id: versionId, documentId }).exec();
        return doc ? toVersionRecord(doc.toObject()) : null;
    },

    async findVersionByProofId(proofId: string): Promise<IDocumentVersionRecord | null> {
        const doc = await DocumentVersionModel.findOne({ proofId }).exec();
        return doc ? toVersionRecord(doc.toObject()) : null;
    },
};