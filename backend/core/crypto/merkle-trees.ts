import { createHash } from 'node:crypto';

import { CryptoError } from './crypto.errors';
import { CHUNK_SIZE, HASH_LENGTH, LEAF_PREFIX, NODE_PREFIX, ROOT_PREFIX, SPEC_VERSION } from './crypto.constants';

/** leaf_i = SHA256( 0x00 || uint64(i) || uint32(len) || chunk ) */
export const hashLeaf = (index: number, chunk: Uint8Array): Buffer => {
    if (!Number.isSafeInteger(index) || index < 0) {
        throw new CryptoError(`Invalid chunk index: ${index}`, 'INVALID_INDEX');
    }
    const header = Buffer.alloc(13);
    header.writeUInt8(LEAF_PREFIX, 0);
    header.writeBigUInt64BE(BigInt(index), 1);
    header.writeUInt32BE(chunk.length, 9);
    return createHash('sha256').update(header).update(chunk).digest();
};

/** node = SHA256( 0x01 || left || right ) */
export const hashNode = (left: Buffer, right: Buffer): Buffer =>
    createHash('sha256').update(Buffer.of(NODE_PREFIX)).update(left).update(right).digest();

/**
 * Pairs adjacent nodes level by level. An odd node at the end of a level is
 * promoted unchanged to the next level (never duplicated).
 */
export const computeTreeRoot = (leaves: Buffer[]): Buffer => {
    if (leaves.length === 0) {
        throw new CryptoError('Cannot build a Merkle tree without leaves', 'EMPTY_INPUT');
    }

    let level = leaves;
    while (level.length > 1) {
        const next: Buffer[] = [];
        for (let i = 0; i + 1 < level.length; i += 2) {
            next.push(hashNode(level[i] as Buffer, level[i + 1] as Buffer));
        }
        if (level.length % 2 === 1) {
            next.push(level[level.length - 1] as Buffer);
        }
        level = next;
    }
    return level[0] as Buffer;
};

/** merkleRoot = SHA256( 0x02 || specVersion || uint32(chunkSize) || uint64(fileSize) || treeRoot ) */
export const computeMerkleRoot = (treeRoot: Buffer, fileSize: number, chunkSize: number = CHUNK_SIZE): Buffer => {
    const header = Buffer.alloc(14);
    header.writeUInt8(ROOT_PREFIX, 0);
    header.writeUInt8(SPEC_VERSION, 1);
    header.writeUInt32BE(chunkSize, 2);
    header.writeBigUInt64BE(BigInt(fileSize), 6);
    return createHash('sha256').update(header).update(treeRoot).digest();
};

/** Splits the stored segment index payload back into 32-byte leaves. */
export const splitLeaves = (leaves: Buffer): Buffer[] => {
    if (leaves.length === 0 || leaves.length % HASH_LENGTH !== 0) {
        throw new CryptoError(
            `Leaf data must be a non-empty multiple of ${HASH_LENGTH} bytes`,
            'INVALID_INDEX',
        );
    }
    const result: Buffer[] = [];
    for (let offset = 0; offset < leaves.length; offset += HASH_LENGTH) {
        result.push(leaves.subarray(offset, offset + HASH_LENGTH));
    }
    return result;
};

/**
 * Rebuilds the signed root from a stored segment index. Used to authenticate the
 * index before trusting it: the result must equal the manifest's merkle.root.
 * Throws if the leaf count doesn't match the file size and chunk size.
 */
export const computeMerkleRootFromLeaves = (
    leaves: Buffer,
    fileSize: number,
    chunkSize: number = CHUNK_SIZE,
): string => {
    const split = splitLeaves(leaves);
    const expectedCount = Math.ceil(fileSize / chunkSize);
    if (fileSize < 1 || split.length !== expectedCount) {
        throw new CryptoError(
            `Leaf count ${split.length} does not match file size ${fileSize} and chunk size ${chunkSize}`,
            'INVALID_INDEX',
        );
    }
    return computeMerkleRoot(computeTreeRoot(split), fileSize, chunkSize).toString('hex');
};