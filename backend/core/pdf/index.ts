export { isTextProfileEligible, PdfPreflightUnavailableError, PreflightUnavailableError, runPdfPreflight } from './pdf.handler';
export { createPdfDocumentHandler } from './pdf.document-handler';
export { buildTextTree, hashPageLeaf, textRootFromLeafHashes } from './pdf.text-tree';
export type { ITextTree } from './pdf.text-tree';
export { diffTextEvidence } from './pdf.text-verify';
export type { ITextEvidenceDiff, ITextEvidenceDiffInput } from './pdf.text-verify';
export {
    PDF_TEXT_PROFILE,
    PREFLIGHT_POLICY,
    STRICT_PROFILE,
    TEXT_NORMALIZATION_VERSION,
} from './pdf.constants';
export type {
    IPageTextResult,
    IPdfPreflightOutput,
    IPdfPreflightRejection,
    IPdfPreflightResult,
    IPreflightLimits,
    IPreflightTools,
    ITextRecord,
    PageTextOutcome,
    PreflightRejectionReason,
    IPdfWorkerOutput,
    IPdfWorkerSuccess,
} from './pdf.types';