import { fingerprintStream } from '../crypto';
import { computeMerkleRootFromLeaves } from '../crypto/merkle-trees';
import { IProof } from './sign.types';
import { IPinnedPlatformKey } from './sign.types';
import { verifyProofChain } from './proof.chain';

export interface IDifferingChunk {
    index: number;
    original: { from: number; to: number } | null;
    candidate: { from: number; to: number } | null;
}

/** Spec section 5 result. Every field is a separate fact — never one boolean. */
export interface IVerificationResult {
    /** Certificate signature against a pinned platform key. */
    certificateValid: boolean;
    /** Certificate fields match the manifest's signer and key. */
    signerBinding: boolean;
    /** Manifest signature verified with the certified public key. */
    signatureValid: boolean;
    /** Online lookup of the key's current status (provided by the caller). */
    keyStatus: 'active' | 'retired' | 'revoked' | 'unknown';
    /** Leaf index rebuilt from the stored leaves == the signed merkle root. */
    indexTrusted: boolean;
    /** True when all of the above hold and the candidate bytes are identical. */
    byteIdentical: boolean;
    sizeMatches: boolean;
    originalSize: number;
    candidateSize: number;
    firstDifferingChunk: number | null;
    /** Capped at 100 entries; ranges are positional (see spec). */
    differingChunks: IDifferingChunk[];
    reasons: string[];
    localization: string;
}

export interface IVerifyInput {
    proof: IProof;
    pinnedKeys: IPinnedPlatformKey[];
    keyStatus?: 'active' | 'retired' | 'revoked';
    /** 32 * chunkCount bytes from the segment index record. */
    leaves: Buffer;
    chunkCount: number;
    chunkSize: number;
    fileSize: number;
    /** Readable stream of the candidate file. */
    candidate: AsyncIterable<Uint8Array>;
    maxBytes?: number;
}

const MAX_DIFF_CHUNKS = 100;

const chunkRange = (
    index: number,
    chunkSize: number,
    fileSize: number,
): { from: number; to: number } => ({
    from: index * chunkSize,
    to: Math.min((index + 1) * chunkSize, fileSize),
});

export const verifyCandidate = async (input: IVerifyInput): Promise<IVerificationResult> => {
    const result: IVerificationResult = {
        certificateValid: false,
        signerBinding: false,
        signatureValid: false,
        keyStatus: input.keyStatus ?? 'unknown',
        indexTrusted: false,
        byteIdentical: false,
        sizeMatches: false,
        originalSize: input.fileSize,
        candidateSize: 0,
        firstDifferingChunk: null,
        differingChunks: [],
        reasons: [],
        localization:
            'Positional chunk comparison. Ranges after a size change may be shifted. Not page-level.',
    };

    // --- Chain verification (steps 1-3 in the spec, offline)
    const chain = verifyProofChain(input.proof, input.pinnedKeys);
    result.certificateValid = chain.certificateValid;
    result.signerBinding = chain.signerBinding;
    result.signatureValid = chain.signatureValid;
    if (chain.reasons.length > 0) result.reasons.push(...chain.reasons);

    // --- Index authentication (spec section 5 step 5): rebuild the root from the stored leaves
    // and compare it to the signed manifest root. Only authenticate when the chain is valid,
    // because the manifest's root field comes from that signed manifest.
    if (result.signatureValid) {
        try {
            const rebuilt = computeMerkleRootFromLeaves(input.leaves, input.fileSize, input.chunkSize);
            result.indexTrusted = rebuilt === input.proof.manifest.merkle.root;
            if (!result.indexTrusted) {
                result.reasons.push('Stored segment index does not match the signed Merkle root');
            }
        } catch {
            result.indexTrusted = false;
            result.reasons.push('Segment index is malformed');
        }
    }

    // --- Stream the candidate (step 6-7): compute its fingerprint in one pass
    let fp;
    try {
        fp = await fingerprintStream(input.candidate, { maxBytes: input.maxBytes });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.reasons.push(`Candidate stream error: ${message}`);
        return result;
    }

    result.candidateSize = fp.fileSize;
    result.sizeMatches = fp.fileSize === input.fileSize;
    result.byteIdentical =
        result.signatureValid &&
        fp.fileSize === input.fileSize &&
        fp.fileSha256 === input.proof.manifest.file.sha256;

    // --- Chunk-level diff (spec step 8): only when the index is trusted and sizes are reasonable
    if (!result.byteIdentical && result.indexTrusted) {
        const candidateLeaves = fp.leaves;
        const storedLeaves = input.leaves;
        const origChunks = Math.ceil(input.fileSize / input.chunkSize);
        const candChunks = Math.ceil(fp.fileSize / input.chunkSize);
        const maxIndex = Math.max(origChunks, candChunks);

        for (let i = 0; i < maxIndex && result.differingChunks.length < MAX_DIFF_CHUNKS; i++) {
            const origLeaf = i < origChunks
                ? storedLeaves.subarray(i * 32, i * 32 + 32)
                : null;
            const candLeaf = i < candChunks
                ? candidateLeaves.subarray(i * 32, i * 32 + 32)
                : null;

            const same = origLeaf && candLeaf && origLeaf.equals(candLeaf);
            if (!same) {
                if (result.firstDifferingChunk === null) result.firstDifferingChunk = i;
                result.differingChunks.push({
                    index: i,
                    original: origLeaf ? chunkRange(i, input.chunkSize, input.fileSize) : null,
                    candidate: candLeaf ? chunkRange(i, input.chunkSize, fp.fileSize) : null,
                });
            }
        }
    }

    return result;
};