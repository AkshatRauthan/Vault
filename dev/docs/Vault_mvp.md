# Vault: MVP

## 1. Core Idea

Vault is a document integrity system. A user signs a document, Vault preserves a cryptographic proof of its original state, and later Vault verifies the document and identifies exactly which parts were modified.

Instead of only saying:

> Document tampered

Vault says:

> Tampering detected: Paragraph 17 on Page 4 was modified.

## 2. MVP Scope

**Included**
- PDF documents only
- Paragraph-level segmentation
- SHA-256 hashing
- Merkle tree over paragraph hashes
- Asymmetric digital signature over the Merkle root and proof metadata
- Verification against the signed proof
- Tamper localization (which page and paragraph changed)
- Basic visual indication of modified content

**Roadmap**
- MVP: PDF
- V2: DOCX, embedded proof, standard-compatible (PAdES) signatures, before/after text diff
- V3: XLSX

## 3. Techniques and Technologies

### Techniques
| Technique | Purpose |
|---|---|
| Document segmentation (paragraph-level) | Break the PDF into meaningful units so changes can be localized |
| Deterministic paragraph detection, versioned (`pdf-paragraph-v1`) | Same input + same algorithm version always gives the same segments |
| Canonicalization, versioned (`canonical-v1`) | Ignore whitespace/line-break noise so only content changes alter a hash |
| SHA-256 hashing | Fingerprint each segment |
| Merkle tree with domain separation | Combine segment hashes into one root; distinct prefixes for leaf and internal nodes prevent second-preimage attacks; segment ID is part of each leaf so reordering is detectable |
| Asymmetric digital signature | Sign the root plus proof metadata, so the proof is authentic and its version fields cannot be swapped |
| Segment-hash comparison | Localize exactly which paragraphs changed |
| Sidecar proof file + backend copy | Portable proof, with a recovery copy if the file is lost |
| Proof versioning | Every proof records segmentation, canonicalization, hash and Vault versions, so old proofs stay valid as algorithms improve |

### Technology stack
| Layer | Choice |
|---|---|
| Language | TypeScript on Node.js |
| Backend | Node.js with Express |
| Cryptography | Node.js built-in `crypto` module (SHA-256, asymmetric key generation, signing, verification). Ed25519 is the proposed default signature scheme |
| PDF text extraction | pdf.js (text items with positions) |
| PDF rendering and highlighting | pdf.js in the browser, with overlays on stored paragraph coordinates |
| Frontend | React with TypeScript |
| Database | MongoDB (proof records; optional encrypted paragraph text later) |
| IDE / version control | JetBrains WebStorm, Git/GitHub |


## 4. How the Features Work

### Signing
1. The user uploads a PDF.
2. The backend extracts text items with their positions using pdf.js.
3. Text items are grouped into lines, then into paragraphs using vertical gaps, indentation, alignment and page boundaries. Each paragraph gets a stable ID, page number, position in the page, and bounding box.
4. Each paragraph is canonicalized, then hashed with SHA-256 to give its leaf hash.
5. Leaf hashes are combined into a Merkle tree, producing the Merkle root.
6. A header (proof version, document ID, algorithm versions, hash algorithm, segment count, Merkle root, timestamp) is built and signed with the signer's private key.
7. Vault returns the proof file to download and keeps a copy in the backend.

### Verification
1. The user uploads the PDF and its proof (or Vault retrieves the proof from the backend).
2. Vault re-extracts and re-segments the PDF using the algorithm versions recorded in the proof.
3. Paragraphs are canonicalized and hashed again.
4. The signature on the header is verified with the public key.
5. The Merkle root is rebuilt from the proof's listed hashes and checked against the signed root (the listed hashes are not trusted on their own).
6. The newly computed hashes are compared with the signed ones:
   - Root matches: document is valid.
   - Root differs: signature is still authentic, but the document no longer matches the signed state.

### Tamper localization
- Each new paragraph hash is compared with the signed hash for the same segment ID.
- Mismatching segments are reported by page and paragraph number (e.g. "Page 4, Paragraph 3, modified").
- The MVP handles in-place edits. Insertions and deletions shift positions and are a documented limitation for now.

### Visual indication
- The frontend renders the uploaded PDF with pdf.js.
- Bounding boxes stored at signing time are drawn as highlight overlays on the modified paragraphs.
- The integrity report lists status, signature result, root result, and the modified segments.

### Proof storage
- The portable proof file travels alongside the PDF, which stays untouched.
- The backend keeps a copy so verification still works if the file is lost.
- The backend stores the proof, not the PDF, unless that is later needed.
- Embedding the proof in the PDF is V2.

### Before/after differences (not MVP)
- The MVP shows location only, plus the current text of modified paragraphs.
- Later, as an opt-in feature, the original canonical paragraph text can be stored (encrypted) with each leaf. It is self-authenticating, since re-hashing it must reproduce the signed leaf hash, and it enables a word-level diff on modified paragraphs only.

## 5. What the Proof Contains
- Document identifier and format
- Segmentation method and version
- Canonicalization version
- Hash algorithm
- Segment identifiers, locations (page, order, bounding box) and hashes
- Merkle root
- Signature algorithm, signature and key identifier
- Signing timestamp

## 6. Do

- Start with one format (PDF).
- Use paragraph-level segments.
- Sign the root and metadata, not individual segments.
- Give every segment a stable identity and location.
- Keep canonicalization and segmentation deterministic and versioned.
- Show exactly which paragraphs changed.

## 7. Do Not (in the MVP)

- Support DOCX and XLSX alongside PDF.
- Build blockchain features.
- Build PKI (certificate authorities, X.509, revocation).
- Build multi-user signing workflows.
- Build a document editor.
- Attempt word-level diffing.
- Rely on hashing raw PDF bytes as the primary mechanism.
- Aim for compatibility with third-party PDF signature tools (V2).

## 8. Build Order

1. **Crypto core:** hashing, Merkle tree, signing, verification, fully tested before any UI. Tests cover known SHA-256 vectors, single-leaf change detection, leaf reordering, wrong key, odd leaf counts and single-leaf trees.
2. **PDF:** extraction, paragraph detection, signing, verification, changed-paragraph reporting, visual highlighting. This is the main demonstration format.
3. **UI:** upload, sign, download proof, verify, integrity report with changed segments.
4. Later: DOCX, then XLSX.

## 9. Success Criteria

1. Take a 50-paragraph `contract.pdf` and sign it.
2. Change one paragraph, for example "Payment shall be made within 30 days" to "Payment shall be made within 15 days."
3. Upload the modified PDF with its proof.
4. Vault reports: tampering detected, signature valid, Merkle root changed, modified segment is Page 4, Paragraph 3, highlighted on the PDF.
