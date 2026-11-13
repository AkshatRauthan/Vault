import type { IDocumentHandler } from '../sign';

/**
 * Maps a sniffed byte signature to its IDocumentHandler. Content-Type from the client is NEVER
 * trusted; only sniff() on the actual uploaded bytes decides which handler (and therefore which
 * signing profile) applies. Adding XLSX/DOCX later means registering a new handler here — nothing
 * else in core/sign or core/crypto changes.
 */
export interface IDocumentHandlerRegistry {
    register(handler: IDocumentHandler): void;
    /** First registered handler whose sniff() matches, or null if none does. */
    resolve(head: Buffer): IDocumentHandler | null;
    /** All registered handlers' media types, for error messages and docs. */
    supportedMediaTypes(): string[];
}

export const createDocumentHandlerRegistry = (): IDocumentHandlerRegistry => {
    const handlers: IDocumentHandler[] = [];

    return {
        register(handler: IDocumentHandler): void {
            if (handlers.some((h) => h.mediaType === handler.mediaType)) {
                throw new Error(`A handler for "${handler.mediaType}" is already registered`);
            }
            handlers.push(handler);
        },
        resolve(head: Buffer): IDocumentHandler | null {
            return handlers.find((handler) => handler.sniff(head)) ?? null;
        },
        supportedMediaTypes(): string[] {
            return handlers.map((h) => h.mediaType);
        },
    };
};