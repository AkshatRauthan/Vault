import type { IPageTextResult } from './pdf.types';
import { hashPageLeaf, textRootFromLeafHashes } from './pdf.text-tree';

/**
 * Compares candidate text evidence with the signed text-evidence root (vault-pdf-text-v1).
 * The candidate can be supplied as full page records or as leaf hashes emitted by an
 * IDocumentHandler. Full records are useful to callers that need to compute evidence themselves;
 * leaf hashes avoid returning extracted text from the handler just for localization.
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

interface ITextEvidenceDiffBase {
    signedRoot: string;
    signedPageCount: number;
    storedLeafHashes: string[];
}

export type ITextEvidenceDiffInput = ITextEvidenceDiffBase & (
    | { candidatePages: IPageTextResult[] }
    | { candidateLeafHashes: string[]; candidatePageCount: number; unextractablePages?: number[] }
);

export const diffTextEvidence = (input: ITextEvidenceDiffInput): ITextEvidenceDiff => {
    const candidateLeaves = 'candidatePages' in input
        ? input.candidatePages.map((page, index) => hashPageLeaf(index, page))
        : input.candidateLeafHashes;
    const candidatePageCount = 'candidatePages' in input ? input.candidatePages.length : input.candidatePageCount;
    // For precomputed evidence, the declared page count must describe the supplied leaves exactly.
    // Do not trust caller metadata independently from the content-derived hashes.
    const candidatePageCountConsistent = candidatePageCount === candidateLeaves.length;
    const unextractablePages = 'candidatePages' in input
        ? input.candidatePages.filter((page) => page.outcome === 'extraction-error').map((page) => page.page)
        : (input.unextractablePages ?? []);

    const result: ITextEvidenceDiff = {
        indexTrusted: false,
        rootMatches: false,
        pageCountMatches: candidatePageCountConsistent && candidatePageCount === input.signedPageCount,
        originalPageCount: input.signedPageCount,
        candidatePageCount,
        differingPages: [],
        unextractablePages,
        reasons: [],
    };

    // Authenticate the stored index against the signed root before using it for localization.
    try {
        result.indexTrusted =
            input.storedLeafHashes.length === input.signedPageCount &&
            textRootFromLeafHashes(input.storedLeafHashes) === input.signedRoot;
    } catch {
        result.indexTrusted = false;
    }
    if (!result.indexTrusted) result.reasons.push('Stored text index does not match the signed text root');

    if (!candidatePageCountConsistent) {
        result.reasons.push('Candidate page count does not match the number of candidate leaf hashes');
        return result;
    }

    if (result.unextractablePages.length > 0) {
        result.reasons.push(`Text could not be extracted from page(s) ${result.unextractablePages.join(', ')}`);
        return result;
    }

    try {
        result.rootMatches = textRootFromLeafHashes(candidateLeaves) === input.signedRoot;
    } catch {
        result.rootMatches = false;
    }

    if (result.indexTrusted && !result.rootMatches) {
        const longest = Math.max(input.storedLeafHashes.length, candidateLeaves.length);
        for (let i = 0; i < longest; i++) {
            if (input.storedLeafHashes[i] !== candidateLeaves[i]) result.differingPages.push(i + 1);
        }
    }
    return result;
};
