// Profile names are protocol constants: core/sign owns them, so they can never drift apart.
export { PDF_TEXT_PROFILE, STRICT_PROFILE, TEXT_NORMALIZATION_VERSION } from '@core/sign';

export const PREFLIGHT_POLICY = 'vault-pdf-preflight-v1' as const;

/** Domain prefixes for the text-evidence tree. Distinct from the byte tree's 0x00 / 0x01 / 0x02. */
export const TEXT_LEAF_PREFIX = 0x10;
export const TEXT_NODE_PREFIX = 0x11;
export const TEXT_ROOT_PREFIX = 0x12;

export const PDF_MAGIC = '%PDF-';