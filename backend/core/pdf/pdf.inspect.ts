import { ParseSpeeds, PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import type { IPdfPreflightRejection } from './pdf.types';

/**
 * Structural inspection with pdf-lib: walks EVERY indirect object (including those inside compressed
 * object streams) and looks for the dictionary keys and action names the policy prohibits. pdf-lib decodes
 * escaped names, so "/J#61vaScript" is seen as "/JavaScript". No bytes are scanned.
 *
 * pdf-lib ignores the xref table, so it can't detect damaged files; that is qpdf's job (pdf.qpdf.ts).
 */

const JAVASCRIPT_OR_LAUNCH = new Set(['/JS', '/JavaScript', '/Launch']);
const XFA = new Set(['/XFA']);
const SIGNATURE = new Set(['/ByteRange']);

const rejection = (
    reason: IPdfPreflightRejection['reason'],
    detail: string,
): IPdfPreflightRejection => ({ preflightPassed: false, reason, detail });

/** Returns null when the structure is acceptable. Precedence: encrypted, xfa, javascript/launch, signature. */
export const inspectPdfStructure = async (bytes: Uint8Array): Promise<IPdfPreflightRejection | null> => {
    // ignoreEncryption: load anyway and ask the document, instead of catching pdf-lib's EncryptedPDFError
    // (its error classes are compiled to ES5, so instanceof checks against them don't work).
    let doc: PDFDocument;
    try {
        doc = await PDFDocument.load(bytes, {
            ignoreEncryption: true,
            throwOnInvalidObject: true,
            updateMetadata: false,
            parseSpeed: ParseSpeeds.Fastest,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        if (/encrypted/i.test(message)) return rejection('encrypted', 'Document is encrypted');
        return rejection('malformed-or-unrecoverable', `Structure could not be parsed: ${message.slice(0, 120)}`);
    }
    if (doc.isEncrypted) return rejection('encrypted', 'Document is encrypted');

    const found = new Set<string>();
    const note = (name: PDFName): void => {
        const text = name.toString();
        if (JAVASCRIPT_OR_LAUNCH.has(text) || XFA.has(text) || SIGNATURE.has(text)) found.add(text);
    };

    // Explicit stack, not recursion: hostile files can nest arbitrarily deep.
    const stack: unknown[] = [];
    for (const [, object] of doc.context.enumerateIndirectObjects()) stack.push(object);

    while (stack.length > 0) {
        const value = stack.pop();
        if (value instanceof PDFDict) {
            for (const [key, child] of value.entries()) {
                note(key);
                stack.push(child);
            }
        } else if (value instanceof PDFStream) {
            stack.push(value.dict);
        } else if (value instanceof PDFArray) {
            for (let i = 0; i < value.size(); i++) stack.push(value.get(i));
        } else if (value instanceof PDFName) {
            note(value);
        }
    }

    const list = (names: Set<string>): string => [...found].filter((n) => names.has(n)).join(', ');

    if (list(XFA)) return rejection('xfa-form', 'XFA forms are not supported');
    if (list(JAVASCRIPT_OR_LAUNCH)) {
        return rejection('javascript-or-launch-action', `Prohibited action found: ${list(JAVASCRIPT_OR_LAUNCH)}`);
    }
    if (list(SIGNATURE)) return rejection('existing-signature', 'Document already contains a digital signature');
    return null;
};