import { createHash } from 'node:crypto';
import { canonicalBytes } from '../crypto';
import { TEXT_LEAF_PREFIX, TEXT_NODE_PREFIX, TEXT_ROOT_PREFIX } from './pdf.constants';
import type { IPageTextResult } from './pdf.types';

/**
 * Text-evidence tree for vault-pdf-text-v1: one leaf per page, independent of the byte-chunk tree
 * (own domain prefixes, own root). It authenticates the EXTRACTED TEXT only: a changed image, text colour
 * or layout can leave the text, and so this root, unchanged.
 *
 * leaf_i = SHA256( 0x10 || uint32(i) || canonicalJSON({ outcome, page, records }) )
 * node   = SHA256( 0x11 || left || right )              odd node promoted unchanged, never duplicated
 * root   = SHA256( 0x12 || uint32(pageCount) || treeRoot )   so a page can't be dropped silently
 *
 * The page leaf is RFC 8785 canonical JSON, so every nested field (bounds, text) is committed.
 */

const hashLeaf = (index: number, page: IPageTextResult): Buffer => {
    const header = Buffer.alloc(5);
    header.writeUInt8(TEXT_LEAF_PREFIX, 0);
    header.writeUInt32BE(index, 1);
    const body = canonicalBytes({ outcome: page.outcome, page: page.page, records: page.records });
    return createHash('sha256').update(header).update(body).digest();
};

const hashNode = (left: Buffer, right: Buffer): Buffer =>
    createHash('sha256').update(Buffer.of(TEXT_NODE_PREFIX)).update(left).update(right).digest();

const treeRootOf = (leaves: Buffer[]): Buffer => {
    let level = leaves;
    while (level.length > 1) {
        const next: Buffer[] = [];
        for (let i = 0; i + 1 < level.length; i += 2) next.push(hashNode(level[i] as Buffer, level[i + 1] as Buffer));
        if (level.length % 2 === 1) next.push(level[level.length - 1] as Buffer);
        level = next;
    }
    return level[0] as Buffer;
};

const commitRoot = (leaves: Buffer[]): Buffer => {
    const header = Buffer.alloc(5);
    header.writeUInt8(TEXT_ROOT_PREFIX, 0);
    header.writeUInt32BE(leaves.length, 1);
    return createHash('sha256').update(header).update(treeRootOf(leaves)).digest();
};

/** Leaf hash of one page (hex), exactly as committed in the tree. */
export const hashPageLeaf = (index: number, page: IPageTextResult): string => hashLeaf(index, page).toString('hex');

/**
 * Rebuilds the signed text root from stored leaf hashes. Used to authenticate a stored text index
 * before trusting it: the result must equal the manifest's textEvidence.root. Throws on malformed input.
 */
export const textRootFromLeafHashes = (leafHashes: string[]): string => {
    if (leafHashes.length === 0 || leafHashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
        throw new Error('Leaf hashes must be a non-empty list of 64-character lowercase hex strings');
    }
    return commitRoot(leafHashes.map((hash) => Buffer.from(hash, 'hex'))).toString('hex');
};

export interface ITextTree {
    /** The signed text-evidence root (hex). */
    root: string;
    pageCount: number;
    /** Leaf hashes in page order (hex): stored with the proof so a changed page can be located later. */
    leafHashes: string[];
}

export const buildTextTree = (pages: IPageTextResult[]): ITextTree => {
    if (pages.length === 0) throw new Error('Text evidence needs at least one page');
    if (pages.some((page) => page.outcome === 'extraction-error')) {
        // Fail closed: a page that could not be extracted must never be committed as if it had been.
        throw new Error('Cannot build text evidence: at least one page failed extraction');
    }

    const leaves = pages.map((page, index) => hashLeaf(index, page));
    return {
        root: commitRoot(leaves).toString('hex'),
        pageCount: pages.length,
        leafHashes: leaves.map((leaf) => leaf.toString('hex')),
    };
};