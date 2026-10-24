export type DocumentProfile = 'vault-strict-v1' | 'vault-pdf-text-v1';
export type DocumentStatus = 'uploaded' | 'signing' | 'signed';
export type KeyStatus = 'active' | 'retired' | 'revoked';

export interface PublicUser {
  userId: string;
  email: string;
  tag: string;
  name: string;
  isVerified: boolean;
  createdAt: string;
}

export interface ProfileAvailability {
  available: boolean;
  description: string;
  reason?: string;
}

export interface DocumentVersionSummary {
  versionId: string;
  documentId: string;
  status: DocumentStatus;
  file: { mediaType: 'application/pdf'; sha256: string; size: number };
  preflight: { policy: string; parser: string };
  profiles: Record<DocumentProfile, ProfileAvailability>;
  signedProfile?: DocumentProfile;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListItem {
  document: DocumentSummary;
  versionCount: number;
  latestVersion: DocumentVersionSummary | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  pagination: Pagination;
}

export interface DocumentDetailsResponse {
  document: DocumentSummary;
  versions: DocumentVersionSummary[];
}

export interface UploadResponse {
  documentId: string;
  versionId: string;
  name: string;
  status: 'uploaded';
  file: { mediaType: 'application/pdf'; sha256: string; size: number };
  preflight: { accepted: true; policy: string; parser: string };
  profiles: Record<DocumentProfile, ProfileAvailability>;
  nextAction: string;
}

export interface SignedProofResponse {
  proofId: string;
  documentId: string;
  versionId: string;
  profile: DocumentProfile;
  signedAt: string;
  proof: {
    manifest: {
      schema: string;
      profile: DocumentProfile;
      documentId: string;
      versionId: string;
      file: { sha256: string; size: number; mediaType: string };
      merkle: { algorithm: 'sha256'; spec: string; chunkSize: number; chunkCount: number; root: string };
      preflight: { policy: string; parser: string; result: 'accepted' };
      signer: { type: 'user'; userId: string };
      key: { keyId: string; keyVersion: number; algorithm: 'ed25519' };
      signedAt: string;
      textEvidence?: { spec: string; normalization: string; pageCount: number; root: string };
    };
    signature: string;
    certificate: { payload: Record<string, unknown>; signature: string };
  };
  byteSegmentIndex: { chunkSize: number; chunkCount: number; fileSize: number; leafHashesBase64: string };
  textEvidenceLeafHashes?: string[];
}

export interface DifferingChunk {
  index: number;
  original: { from: number; to: number } | null;
  candidate: { from: number; to: number } | null;
}

export interface ByteVerification {
  certificateValid: boolean;
  signerBinding: boolean;
  signatureValid: boolean;
  keyStatus: 'active' | 'retired' | 'revoked' | 'unknown';
  indexTrusted: boolean;
  byteIdentical: boolean;
  sizeMatches: boolean;
  originalSize: number;
  candidateSize: number;
  firstDifferingChunk: number | null;
  differingChunks: DifferingChunk[];
  reasons: string[];
  localization: string;
}

export interface VerifyResponse {
  documentId: string;
  versionId: string;
  profile: DocumentProfile;
  byteVerification: ByteVerification;
  textEvidence: {
    available: boolean;
    reason?: string;
    comparable?: boolean;
    indexTrusted?: boolean;
    rootMatches?: boolean;
    signedPageCount?: number;
    candidatePageCount?: number;
    pageCountMatches?: boolean;
    differingPages?: number[];
    unextractablePages?: number[];
    reasons?: string[];
  };
}

export interface SessionView {
  ref: string;
  createdAt: number;
  expiresAt: number;
  remember: boolean;
  ip: string;
  userAgent: string;
  suspicious: boolean;
  current: boolean;
}

export interface KeyVersionView {
  keyId: string;
  keyVersion: number;
  status: KeyStatus;
  publicKey: string;
  createdAt: string;
  retiredAt?: string;
  revokedAt?: string;
}

export interface ApiErrorShape {
  success?: false;
  message?: string;
}
