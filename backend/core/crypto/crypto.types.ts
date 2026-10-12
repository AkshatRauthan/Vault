export interface IFingerprintOptions {
    /** Abort with SIZE_LIMIT_EXCEEDED as soon as more than this many bytes have been seen. */
    maxBytes?: number;
}

export interface IFingerprintResult {
    /** SHA-256 of the whole file, hex. */
    fileSha256: string;
    fileSize: number;
    chunkSize: number;
    chunkCount: number;
    /** Root of the chunk tree before the root commitment, hex. */
    treeRoot: string;
    /** Signed root: commits to the tree root, file size, chunk size and spec version, hex. */
    merkleRoot: string;
    /** Leaf hashes concatenated in index order (32 bytes each): the segment index payload. */
    leaves: Buffer;
}