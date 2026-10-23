/**
 * Runs inside a worker_threads thread (see pdf.handler.ts). Never import this file from the main thread.
 *
 * Input  (workerData): { buffer: ArrayBuffer, limits: IPreflightLimits }
 * Output (postMessage): IPdfWorkerOutput
 *
 * Imports nothing from src/. Memory is capped by the worker's resourceLimits; the handler enforces the timeout.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { extractPdfText } from './pdf.text';
import { inspectPdfStructure } from './pdf.inspect';
import type { IPdfWorkerOutput, IPreflightLimits } from './pdf.types';

const run = async (): Promise<IPdfWorkerOutput> => {
    const { buffer, limits } = workerData as { buffer: ArrayBuffer; limits: IPreflightLimits };
    const bytes = new Uint8Array(buffer);

    // 1. Structure (pdf-lib): encryption, XFA, JavaScript/Launch, existing signatures
    const structural = await inspectPdfStructure(bytes);
    if (structural) return structural;

    // 2. Load + text (pdfjs): second opinion on the same features, then positioned text per page
    const text = await extractPdfText(bytes, limits.maxPages);
    if ('preflightPassed' in text) return text;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfLibVersion = (require('pdf-lib/package.json') as { version: string }).version;
    return {
        preflightPassed: true,
        pageCount: text.pageCount,
        pages: text.pages,
        pdfjsVersion: text.pdfjsVersion,
        pdfLibVersion,
    };
};

if (!parentPort) throw new Error('pdf.worker must run inside a worker thread');
const port = parentPort;

run()
    .then((result) => port.postMessage(result))
    .catch((error: unknown) =>
        port.postMessage({
            preflightPassed: false,
            reason: 'malformed-or-unrecoverable',
            detail: error instanceof Error ? error.message.slice(0, 160) : 'Unexpected worker error',
        } satisfies IPdfWorkerOutput),
    );