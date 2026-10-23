import { DocumentModel, IDocumentDoc } from './document.model';
import { DocumentVersionModel, IDocumentVersionDoc } from './document-version.model';
import type {
    DocumentProfile,
    IDocumentListRecord,
    IDocumentRecord,
    IDocumentVersionRecord,
    IDocumentWithVersion,
} from './document.types';

const toDocumentRecord = (doc: IDocumentDoc): IDocumentRecord => ({
    documentId: doc._id,
    ownerUserId: doc.ownerUserId,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

const toVersionRecord = (doc: IDocumentVersionDoc): IDocumentVersionRecord => ({
    versionId: doc._id,
    documentId: doc.documentId,
    ownerUserId: doc.ownerUserId,
    mediaType: doc.mediaType,
    fileSha256: doc.fileSha256,
    fileSize: doc.fileSize,
    storagePath: doc.storagePath,
    preflightPolicy: doc.preflightPolicy,
    preflightParser: doc.preflightParser,
    textProfileAvailable: doc.textProfileAvailable,
    ...(doc.textProfileUnavailableReason ? { textProfileUnavailableReason: doc.textProfileUnavailableReason } : {}),
    status: doc.status,
    ...(doc.signedProfile ? { signedProfile: doc.signedProfile } : {}),
    ...(doc.signedAt ? { signedAt: doc.signedAt } : {}),
    ...(doc.signingStartedAt ? { signingStartedAt: doc.signingStartedAt } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const DocumentRepository = {
    async insertDocument(input: { documentId: string; ownerUserId: string; name: string }): Promise<IDocumentRecord> {
        const { documentId, ...fields } = input;
        return toDocumentRecord(await DocumentModel.create({ _id: documentId, ...fields }));
    },

    async insertVersion(
        input: Omit<IDocumentVersionRecord, 'createdAt' | 'updatedAt' | 'status' | 'signedProfile' | 'signedAt' | 'signingStartedAt'>,
    ): Promise<IDocumentVersionRecord> {
        const { versionId, ...fields } = input;
        return toVersionRecord(await DocumentVersionModel.create({ _id: versionId, ...fields, status: 'uploaded' }));
    },

    async findOwnedDocument(ownerUserId: string, documentId: string): Promise<IDocumentRecord | null> {
        const doc = await DocumentModel.findOne({ _id: documentId, ownerUserId }).exec();
        return doc ? toDocumentRecord(doc) : null;
    },

    async listOwnedDocuments(
        ownerUserId: string,
        page: number,
        limit: number,
    ): Promise<{ items: IDocumentListRecord[]; total: number }> {
        const filter = { ownerUserId };
        const [documents, total] = await Promise.all([
            DocumentModel.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            DocumentModel.countDocuments(filter).exec(),
        ]);

        if (documents.length === 0) return { items: [], total };

        const documentIds = documents.map((document) => document._id);
        const versions = await DocumentVersionModel.find({
            ownerUserId,
            documentId: { $in: documentIds },
        })
            .sort({ createdAt: -1, _id: -1 })
            .exec();

        const versionSummary = new Map<string, { count: number; latestVersion: IDocumentVersionRecord }>();
        for (const version of versions) {
            const existing = versionSummary.get(version.documentId);
            if (existing) {
                existing.count += 1;
            } else {
                // Versions are sorted newest-first, so the first one per document is the latest.
                versionSummary.set(version.documentId, {
                    count: 1,
                    latestVersion: toVersionRecord(version),
                });
            }
        }

        return {
            items: documents.map((document) => {
                const summary = versionSummary.get(document._id);
                return {
                    document: toDocumentRecord(document),
                    versionCount: summary?.count ?? 0,
                    latestVersion: summary?.latestVersion ?? null,
                };
            }),
            total,
        };
    },

    async listOwnedVersions(ownerUserId: string, documentId: string): Promise<IDocumentVersionRecord[]> {
        const versions = await DocumentVersionModel.find({ ownerUserId, documentId })
            .sort({ createdAt: -1, _id: -1 })
            .exec();
        return versions.map(toVersionRecord);
    },

    async findOwnedVersion(
        ownerUserId: string,
        documentId: string,
        versionId: string,
    ): Promise<IDocumentWithVersion | null> {
        const [document, version] = await Promise.all([
            DocumentModel.findOne({ _id: documentId, ownerUserId }).exec(),
            DocumentVersionModel.findOne({ _id: versionId, documentId, ownerUserId }).exec(),
        ]);
        if (!document || !version) return null;
        return { document: toDocumentRecord(document), version: toVersionRecord(version) };
    },

    async claimSigning(
        ownerUserId: string,
        documentId: string,
        versionId: string,
        claimedAt: Date,
        staleBefore: Date,
    ): Promise<IDocumentVersionRecord | null> {
        const version = await DocumentVersionModel.findOneAndUpdate(
            {
                _id: versionId,
                documentId,
                ownerUserId,
                $or: [
                    { status: 'uploaded' },
                    { status: 'signing', signingStartedAt: { $lt: staleBefore } },
                ],
            },
            { $set: { status: 'signing', signingStartedAt: claimedAt } },
            { new: true },
        ).exec();
        return version ? toVersionRecord(version) : null;
    },

    async markSigned(
        ownerUserId: string,
        documentId: string,
        versionId: string,
        claimedAt: Date,
        profile: DocumentProfile,
        signedAt: Date,
    ): Promise<IDocumentVersionRecord | null> {
        const version = await DocumentVersionModel.findOneAndUpdate(
            {
                _id: versionId,
                documentId,
                ownerUserId,
                status: 'signing',
                signingStartedAt: claimedAt,
            },
            {
                $set: { status: 'signed', signedProfile: profile, signedAt },
                $unset: { signingStartedAt: 1 },
            },
            { new: true },
        ).exec();
        return version ? toVersionRecord(version) : null;
    },

    async recoverSignedState(
        ownerUserId: string,
        documentId: string,
        versionId: string,
        profile: DocumentProfile,
        signedAt: Date,
        expectedStartedAt: Date,
    ): Promise<IDocumentVersionRecord | null> {
        const version = await DocumentVersionModel.findOneAndUpdate(
            { _id: versionId, documentId, ownerUserId, status: 'signing', signingStartedAt: expectedStartedAt },
            {
                $set: { status: 'signed', signedProfile: profile, signedAt },
                $unset: { signingStartedAt: 1 },
            },
            { new: true },
        ).exec();
        return version ? toVersionRecord(version) : null;
    },

    async releaseSigning(ownerUserId: string, documentId: string, versionId: string, claimedAt: Date): Promise<void> {
        await DocumentVersionModel.updateOne(
            {
                _id: versionId,
                documentId,
                ownerUserId,
                status: 'signing',
                signingStartedAt: claimedAt,
            },
            { $set: { status: 'uploaded' }, $unset: { signingStartedAt: 1 } },
        ).exec();
    },

    async deleteDocument(documentId: string, ownerUserId: string): Promise<void> {
        await DocumentModel.deleteOne({ _id: documentId, ownerUserId }).exec();
    },

    async deleteVersion(documentId: string, versionId: string, ownerUserId: string): Promise<void> {
        await DocumentVersionModel.deleteOne({ _id: versionId, documentId, ownerUserId }).exec();
    },
};
