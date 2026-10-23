/**
 * The seam between format-neutral signing code and format-specific document code. A handler knows one
 * document type: how to recognise it, whether it may be signed, and what content evidence it can offer.
 * Everything else (hashing, chunking, the Merkle tree, signing, verification) works on bytes and is shared.
 * Adding a format means adding a handler; nothing in core/crypto or core/sign changes.
 */

/** Content evidence beyond raw bytes (for PDFs: the text-evidence tree of vault-pdf-text-v1). */
export interface IContentEvidence {
    /** The profile this evidence belongs to, e.g. "vault-pdf-text-v1". */
    profile: string;
    normalization: string;
    /** Number of leaves (pages, for a PDF). */
    unitCount: number;
    root: string;
    /** Leaf hashes in order (hex). Stored with the proof so a changed unit can be located later. */
    leafHashes: string[];
}

export interface IPreflightAcceptance {
    accepted: true;
    mediaType: string;
    /** Goes into manifest.preflight.policy. */
    policy: string;
    /** Goes into manifest.preflight.parser: the exact tools and versions used. */
    parser: string;
    /** Present when the document can be signed under the handler's content profile. */
    contentEvidence?: IContentEvidence;
    /** Why content evidence is absent. The caller must tell the user: never silently downgrade. */
    contentEvidenceUnavailableReason?: string;
}

export interface IPreflightRefusal {
    accepted: false;
    /** Machine-readable reason, e.g. "encrypted". */
    reason: string;
    detail?: string;
}

export interface IDocumentHandler {
    readonly mediaType: string;
    /** Recognises the format from the first bytes. The client's Content-Type header is never trusted. */
    sniff(head: Buffer): boolean;
    /**
     * Decides whether the document may be signed. Resolves to a refusal for documents that break policy.
     * REJECTS (throws) if the analysis itself could not run (missing tool, crash): callers must treat that
     * as "not signed", never as a pass.
     */
    preflight(file: Buffer): Promise<IPreflightAcceptance | IPreflightRefusal>;
}