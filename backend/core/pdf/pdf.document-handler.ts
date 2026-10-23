import { PDF_MAGIC, PDF_TEXT_PROFILE, PREFLIGHT_POLICY, TEXT_NORMALIZATION_VERSION } from './pdf.constants';
import { isTextProfileEligible, runPdfPreflight } from './pdf.handler';
import { buildTextTree } from './pdf.text-tree';
import type { IDocumentHandler } from '../sign/document-handler';
import type { IPreflightLimits } from './pdf.types';

const MEDIA_TYPE = 'application/pdf';

/**
 * The PDF implementation of IDocumentHandler: runs the full preflight and, when every page extracted
 * cleanly, offers text evidence (vault-pdf-text-v1). Otherwise the document is still acceptable for
 * strict-only signing, and the reason is returned so the caller can tell the user instead of downgrading silently.
 */
export const createPdfDocumentHandler = (limits: IPreflightLimits): IDocumentHandler => ({
    mediaType: MEDIA_TYPE,

    sniff: (head: Buffer): boolean => head.subarray(0, 1024).toString('latin1').includes(PDF_MAGIC),

    async preflight(file: Buffer) {
        const outcome = await runPdfPreflight(file, limits);
        if (!outcome.preflightPassed) {
            return { accepted: false as const, reason: outcome.reason, ...(outcome.detail ? { detail: outcome.detail } : {}) };
        }

        const base = { accepted: true as const, mediaType: MEDIA_TYPE, policy: PREFLIGHT_POLICY, parser: outcome.parser };
        if (!isTextProfileEligible(outcome)) {
            return { ...base, contentEvidenceUnavailableReason: 'Text could not be extracted from one or more pages' };
        }

        const tree = buildTextTree(outcome.pages);
        return {
            ...base,
            contentEvidence: {
                profile: PDF_TEXT_PROFILE,
                normalization: TEXT_NORMALIZATION_VERSION,
                unitCount: tree.pageCount,
                root: tree.root,
                leafHashes: tree.leafHashes,
            },
        };
    },
});