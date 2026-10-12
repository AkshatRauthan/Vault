export const HASH_LENGTH = 32; // SHA-256 output, in bytes
export const CHUNK_SIZE = 64 * 1024;
export const SPEC_VERSION = 0x01;

// Domain separation prefixes: a leaf can't be passed off as a node, or either as a root.
export const LEAF_PREFIX = 0x00;
export const NODE_PREFIX = 0x01;
export const ROOT_PREFIX = 0x02;