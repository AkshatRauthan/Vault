/** Specs: vault-strict-v1, vault-pdf-text-v1, vault-pdf-preflight-v1. */

export type PageTextOutcome = 'text-extracted' | 'no-text-detected' | 'extraction-error';

export interface ITextRecord {
    /** [x1, y1, x2, y2] in PDF user space, quantized to 2 decimals. */
    bounds: [number, number, number, number];
    /** UTF-8, Unicode NFC. Meaningful spaces preserved, runs of blanks collapsed to one space. */
    text: string;
}

export interface IPageTextResult {
    page: number;
    outcome: PageTextOutcome;
    /** Non-empty only for 'text-extracted'. Sorted top-to-bottom, left-to-right. */
    records: ITextRecord[];
}

export type PreflightRejectionReason =
    | 'encrypted'
    | 'xfa-form'
    | 'javascript-or-launch-action'
    | 'existing-signature'
    | 'malformed-or-unrecoverable'
    | 'limits-exceeded';

export interface IPdfPreflightRejection {
    preflightPassed: false;
    reason: PreflightRejectionReason;
    detail?: string;
}

export interface IPdfWorkerSuccess {
    preflightPassed: true;
    pageCount: number;
    pages: IPageTextResult[];
    pdfjsVersion: string;
    pdfLibVersion: string;
}

/** What the worker thread posts back. */
export type IPdfWorkerOutput = IPdfWorkerSuccess | IPdfPreflightRejection;

export interface IPreflightTools {
    pdfjs: string;
    pdfLib: string;
    qpdf: string;
}

export interface IPdfPreflightResult {
    preflightPassed: true;
    pageCount: number;
    pages: IPageTextResult[];
    tools: IPreflightTools;
    /** For the manifest's preflight.parser field, e.g. "pdfjs-dist@4.10.38+pdf-lib@1.17.1+qpdf@11.9.0". */
    parser: string;
}

/** What runPdfPreflight returns. A rejection means "do not sign this document". */
export type IPdfPreflightOutput = IPdfPreflightResult | IPdfPreflightRejection;

export interface IPreflightLimits {
    maxFileSizeBytes: number;
    maxPages: number;
    maxWorkerMemoryMb: number;
    /** Applies to the qpdf check and to the worker separately. */
    workerTimeoutMs: number;
    /** Path to the qpdf executable. */
    qpdfPath: string;
}