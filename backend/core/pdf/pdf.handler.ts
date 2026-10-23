import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { PDF_MAGIC } from './pdf.constants';
import { getQpdfVersion, PreflightUnavailableError, runQpdfCheck } from './pdf.qpdf';
import type {
    IPdfPreflightOutput,
    IPdfPreflightRejection,
    IPdfWorkerOutput,
    IPreflightLimits,
} from './pdf.types';

export { PreflightUnavailableError } from './pdf.qpdf';

const reject = (reason: IPdfPreflightRejection['reason'], detail: string): IPdfPreflightRejection => ({
    preflightPassed: false,
    reason,
    detail,
});

/**
 * Production runs the compiled pdf.worker.js. In development (tsx) the worker is the .ts source, and a
 * worker thread does not inherit tsx's TypeScript support (Node would load the .ts file with its own
 * loader and fail on extensionless imports), so the thread first registers tsx, then loads the file.
 */
const workerEntry = (): { source: string; eval: boolean } => {
    if (!__filename.endsWith('.ts')) return { source: join(__dirname, 'pdf.worker.js'), eval: false };
    const file = JSON.stringify(join(__dirname, 'pdf.worker.ts'));
    return { source: `require('tsx/cjs'); require(${file});`, eval: true };
};

const runWorker = (pdf: Buffer, limits: IPreflightLimits): Promise<IPdfWorkerOutput> =>
    new Promise((resolve, reject_) => {
        // A private copy: the worker gets ownership of it, the caller keeps the original Buffer.
        const copy = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

        const entry = workerEntry();
        const worker = new Worker(entry.source, {
            eval: entry.eval,
            workerData: { buffer: copy, limits },
            transferList: [copy],
            resourceLimits: {
                maxOldGenerationSizeMb: limits.maxWorkerMemoryMb,
                maxYoungGenerationSizeMb: Math.max(16, Math.min(64, Math.floor(limits.maxWorkerMemoryMb / 4))),
            },
        });

        let settled = false;
        const finish = (settle: () => void): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            void worker.terminate();
            settle();
        };

        const timer = setTimeout(
            () => finish(() => resolve(reject('limits-exceeded', `PDF analysis timed out after ${limits.workerTimeoutMs} ms`))),
            limits.workerTimeoutMs,
        );

        worker.on('message', (message: IPdfWorkerOutput) => finish(() => resolve(message)));
        worker.on('error', (error: Error & { code?: string }) =>
            finish(() =>
                error.code === 'ERR_WORKER_OUT_OF_MEMORY'
                    ? resolve(reject('limits-exceeded', 'PDF analysis exceeded the memory limit'))
                    : reject_(error),
            ),
        );
        worker.on('exit', (code) =>
            finish(() => reject_(new Error(`PDF worker exited without a result (code ${code})`))),
        );
    });

/**
 * The full preflight, in order: size and header, qpdf --check, then the worker (pdf-lib + pdfjs).
 * Resolves to a result (all checks passed, with per-page text) or a rejection (do not sign).
 * Throws PreflightUnavailableError or another Error if the analysis itself could not run: callers must
 * treat that as "not signed", never as a pass.
 */
export const runPdfPreflight = async (pdf: Buffer, limits: IPreflightLimits): Promise<IPdfPreflightOutput> => {
    if (pdf.length === 0) return reject('malformed-or-unrecoverable', 'File is empty');
    if (pdf.length > limits.maxFileSizeBytes) {
        return reject('limits-exceeded', `File exceeds the limit of ${limits.maxFileSizeBytes} bytes`);
    }
    if (!pdf.subarray(0, 1024).toString('latin1').includes(PDF_MAGIC)) {
        return reject('malformed-or-unrecoverable', 'Missing %PDF- header');
    }

    const qpdfRejection = await runQpdfCheck(pdf, limits);
    if (qpdfRejection) return qpdfRejection;

    const output = await runWorker(pdf, limits);
    if (!output.preflightPassed) return output;

    const tools = {
        pdfjs: output.pdfjsVersion,
        pdfLib: output.pdfLibVersion,
        qpdf: await getQpdfVersion(limits.qpdfPath),
    };
    return {
        preflightPassed: true,
        pageCount: output.pageCount,
        pages: output.pages,
        tools,
        parser: `pdfjs-dist@${tools.pdfjs}+pdf-lib@${tools.pdfLib}+qpdf@${tools.qpdf}`,
    };
};

/** The text profile needs every page to have extracted cleanly. Strict-only signing is the fallback. */
export const isTextProfileEligible = (result: { pages: { outcome: string }[] }): boolean =>
    result.pages.length > 0 && result.pages.every((page) => page.outcome !== 'extraction-error');

export { PreflightUnavailableError as PdfPreflightUnavailableError };