import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { IPageTextResult, IPdfPreflightRejection, ITextRecord } from './pdf.types';

/**
 * Text evidence with pdfjs-dist, plus a second opinion on the prohibited features. pdfjs is ESM-only,
 * so it is loaded with a real dynamic import (a plain import() would be rewritten to require() in the
 * CommonJS build).
 */

type PdfJs = typeof import('pdfjs-dist/types/src/pdf');
const importPdfJs = (): Promise<PdfJs> =>
    (new Function('specifier', 'return import(specifier)') as (s: string) => Promise<PdfJs>)(
        'pdfjs-dist/legacy/build/pdf.mjs',
    );

export interface IPdfTextExtraction {
    pageCount: number;
    pages: IPageTextResult[];
    pdfjsVersion: string;
}

const rejection = (
    reason: IPdfPreflightRejection['reason'],
    detail: string,
): IPdfPreflightRejection => ({ preflightPassed: false, reason, detail });

/** Quantize to 2 decimals: raw floats differ in the noise between parsers and runs. */
const q = (n: number): number => Math.round(n * 100) / 100;

/** NFC, and runs of blanks collapsed to one space. Leading/trailing blanks and newlines are kept. */
const normalizeText = (raw: string): string => raw.replace(/[ \t\r\f\v]+/g, ' ').normalize('NFC');

/** Top-to-bottom (PDF y grows upward), then left-to-right, then by text: independent of content-stream order. */
const compareRecords = (a: ITextRecord, b: ITextRecord): number =>
    b.bounds[1] - a.bounds[1] || a.bounds[0] - b.bounds[0] || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0);

const extractPage = async (doc: PDFDocumentProxy, pageNumber: number): Promise<IPageTextResult> => {
    try {
        const page = await doc.getPage(pageNumber);
        // disableNormalization: pdfjs would apply NFKC (ligatures to letters, etc). We apply our own pinned NFC.
        const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: true });

        const records: ITextRecord[] = [];
        for (const item of content.items) {
            if (!('str' in item)) continue;
            const text = normalizeText(item.str);
            if (text === '') continue;

            const x1 = q(item.transform[4] ?? 0);
            const y1 = q(item.transform[5] ?? 0);
            records.push({ bounds: [x1, y1, q(x1 + item.width), q(y1 + item.height)], text });
        }
        page.cleanup();

        records.sort(compareRecords);
        return { page: pageNumber, outcome: records.length > 0 ? 'text-extracted' : 'no-text-detected', records };
    } catch {
        return { page: pageNumber, outcome: 'extraction-error', records: [] };
    }
};

/**
 * Loads the document with pdfjs (strict: no recovery where pdfjs allows it), cross-checks encryption,
 * JavaScript, XFA and signatures, then extracts text per page. A page that fails becomes an
 * 'extraction-error' page; the caller decides whether that blocks the text profile.
 */
export const extractPdfText = async (
    bytes: Uint8Array,
    maxPages: number,
): Promise<IPdfTextExtraction | IPdfPreflightRejection> => {
    const pdfjs = await importPdfJs();

    let doc: PDFDocumentProxy;
    const loadingTask = pdfjs.getDocument({
        data: bytes.slice(),
        // Keep isEvalSupported only if supported by your installed version.
        disableFontFace: true,
        stopAtErrors: true,
        enableXfa: true,
        verbosity: 0,
    });
    try {
        doc = await loadingTask.promise;
    } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'PasswordException') return rejection('encrypted', 'Document requires a password');
        return rejection(
            'malformed-or-unrecoverable',
            `Document could not be loaded: ${error instanceof Error ? error.message.slice(0, 120) : 'unknown error'}`,
        );
    }

    try {
        if ((await doc.getPermissions()) !== null) return rejection('encrypted', 'Document is encrypted');
        if (doc.isPureXfa) return rejection('xfa-form', 'XFA forms are not supported');
        if (await doc.hasJSActions()) {
            return rejection('javascript-or-launch-action', 'Document contains JavaScript actions');
        }
        // pdfjs types this as a bare Object; each field group is an array of { type, ... }
        const fields = (await doc.getFieldObjects()) as Record<string, { type?: string }[]> | null;
        if (fields && Object.values(fields).some((group) => group.some((field) => field.type === 'signature'))) {
            return rejection('existing-signature', 'Document contains a signature field');
        }
        if (doc.numPages > maxPages) {
            return rejection('limits-exceeded', `Page count ${doc.numPages} exceeds the limit of ${maxPages}`);
        }

        const pages: IPageTextResult[] = [];
        for (let p = 1; p <= doc.numPages; p++) pages.push(await extractPage(doc, p));
        return { pageCount: doc.numPages, pages, pdfjsVersion: pdfjs.version };
    } finally {
        await loadingTask.destroy();
    }
};