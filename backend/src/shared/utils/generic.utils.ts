export const toSeconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

import { createHash } from "node:crypto";
export const sha256Hex = (data: Uint8Array): string =>
    createHash('sha256').update(data).digest('hex');