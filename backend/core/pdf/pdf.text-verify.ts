import { hashPageLeaf, textRootFromLeafHashes } from './pdf.text-tree';
import type { IPageTextResult } from './pdf.types';

/**
 * Compares a candidate's extracted text with the signed text evidence (vault-pdf-text-v1).
 * It answers a different question from the byte comparison: a file can differ in bytes yet have identical
 * text (re-saved, content reordered), and identical text can still hide a changed image or colour, which
 * this evidence cannot see. Only page numbers are known to the verifier, because only leaf hashes are stored.
 */

export interface ITextEvidenceDiff {
    /** The stored leaf hashes rebuild exactly the signed root, with the signed page count. */
    indexTrusted: boolean;
    /** Candidate's text root equals the signed root. Needs no stored index. */
    rootMatches: boolean;
    pageCountMatches: boolean;
    originalPageCount: number;
    candidatePageCount: number;
    /** 1-based pages whose text evidence differs, including pages present in only one document. Empty if the index is untrusted. */
    differingPages: number[];
    /** Candidate pages whose text could not be extracted: the comparison is incomplete when this is non-empty. */
    unextractablePages: number[];
    reasons: string[];
}

export interface ITextEvidenceDiffInput {
    signedRoot: string;
    signedPageCount: number;
    storedLeafHashes: string[];
    candidatePages: IPageTextResult[];
}

export const diffTextEvidence = (input: ITextEvidenceDiffInput): ITextEvidenceDiff => {
    const { signedRoot, signedPageCount, storedLeafHashes, candidatePages } = input;
    const result: ITextEvidenceDiff = {
        indexTrusted: false,
        rootMatches: false,
        pageCountMatches: candidatePages.length === signedPageCount,
        originalPageCount: signedPageCount,
        candidatePageCount: candidatePages.length,
        differingPages: [],
        unextractablePages: candidatePages.filter((p) => p.outcome === 'extraction-error').map((p) => p.page),
        reasons: [],
    };

    // Authenticate the stored index against the signed root before using it for localization.
    try {
        result.indexTrusted =
            storedLeafHashes.length === signedPageCount && textRootFromLeafHashes(storedLeafHashes) === signedRoot;
    } catch {
        result.indexTrusted = false;
    }
    if (!result.indexTrusted) result.reasons.push('Stored text index does not match the signed text root');

    if (result.unextractablePages.length > 0) {
        result.reasons.push(`Text could not be extracted from page(s) ${result.unextractablePages.join(', ')}`);
        return result;
    }

    const candidateLeaves = candidatePages.map((page, index) => hashPageLeaf(index, page));
    try {
        result.rootMatches = textRootFromLeafHashes(candidateLeaves) === signedRoot;
    } catch {
        result.rootMatches = false; // an empty candidate
    }

    if (result.indexTrusted && !result.rootMatches) {
        const longest = Math.max(storedLeafHashes.length, candidateLeaves.length);
        for (let i = 0; i < longest; i++) {
            if (storedLeafHashes[i] !== candidateLeaves[i]) result.differingPages.push(i + 1);
        }
    }
    return result;
};