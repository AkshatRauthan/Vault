import { createHash } from 'node:crypto';

import { CryptoError } from './crypto.errors';
import { CHUNK_SIZE } from './crypto.constants';
import { IFingerprintOptions, IFingerprintResult } from './crypto.types';
import { computeMerkleRoot, computeTreeRoot, hashLeaf } from './merkle-trees';

/**
 * One-pass fingerprint of a byte stream: whole-file SHA-256, per-chunk leaves and
 * the Merkle roots. Input pieces can be any size and are re-aligned to 64 KiB chunks.
 * Memory use is one chunk buffer plus 32 bytes per chunk, regardless of file size.
 */
export class ChunkFingerprinter {
    private readonly fileHash = createHash('sha256');
    private readonly chunk = Buffer.allocUnsafe(CHUNK_SIZE);
    private readonly leaves: Buffer[] = [];
    private readonly maxBytes: number | undefined;
    private filled = 0;
    private size = 0;
    private finished = false;

    constructor(options: IFingerprintOptions = {}) {
        this.maxBytes = options.maxBytes;
    }

    update(data: Uint8Array): void {
        if (this.finished) {
            throw new CryptoError('Fingerprinter already finalized', 'ALREADY_FINALIZED');
        }
        if (this.maxBytes !== undefined && this.size + data.length > this.maxBytes) {
            throw new CryptoError(`Input exceeds the ${this.maxBytes} byte limit`, 'SIZE_LIMIT_EXCEEDED');
        }

        this.fileHash.update(data);
        this.size += data.length;

        let offset = 0;
        while (offset < data.length) {
            const take = Math.min(CHUNK_SIZE - this.filled, data.length - offset);
            this.chunk.set(data.subarray(offset, offset + take), this.filled);
            this.filled += take;
            offset += take;
            if (this.filled === CHUNK_SIZE) this.flushChunk();
        }
    }

    finalize(): IFingerprintResult {
        if (this.finished) {
            throw new CryptoError('Fingerprinter already finalized', 'ALREADY_FINALIZED');
        }
        this.finished = true;

        if (this.size === 0) {
            throw new CryptoError('Empty input cannot be fingerprinted', 'EMPTY_INPUT');
        }
        if (this.filled > 0) this.flushChunk(); // final partial chunk

        const treeRoot = computeTreeRoot(this.leaves);
        return {
            fileSha256: this.fileHash.digest('hex'),
            fileSize: this.size,
            chunkSize: CHUNK_SIZE,
            chunkCount: this.leaves.length,
            treeRoot: treeRoot.toString('hex'),
            merkleRoot: computeMerkleRoot(treeRoot, this.size, CHUNK_SIZE).toString('hex'),
            leaves: Buffer.concat(this.leaves),
        };
    }

    private flushChunk(): void {
        this.leaves.push(hashLeaf(this.leaves.length, this.chunk.subarray(0, this.filled)));
        this.filled = 0;
    }
}

/** Fingerprints any async byte source, such as a file or upload stream. */
export const fingerprintStream = async (
    source: AsyncIterable<Uint8Array>,
    options: IFingerprintOptions = {},
): Promise<IFingerprintResult> => {
    const fingerprinter = new ChunkFingerprinter(options);
    for await (const part of source) {
        fingerprinter.update(part);
    }
    return fingerprinter.finalize();
};