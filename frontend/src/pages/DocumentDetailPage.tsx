import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, BadgeCheck, CalendarClock, Copy, FileCheck2, FileText, Fingerprint, History, ShieldCheck, ShieldX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { DocumentDetailsResponse, DocumentVersionSummary, SignedProofResponse } from '../lib/types';
import { ErrorBanner, LoadingBlock, SuccessBanner } from '../components/Feedback';
import { PageHeader } from '../components/AppShell';
import { StatusBadge } from '../components/StatusBadge';
import { SignFlow } from '../components/SignFlow';
import { Modal } from '../components/Modal';
import { formatBytes, formatDateTime, shortHash } from '../lib/format';

function ProofViewer({ proof, onClose }: { proof: SignedProofResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const manifestJson = JSON.stringify(proof.proof.manifest, null, 2);
  async function copyManifest() {
    try { await navigator.clipboard.writeText(manifestJson); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return <Modal title="Signed proof" description="The manifest and signature chain returned by Vault." onClose={onClose} size="wide">
    <div className="proof-viewer-summary"><span className="proof-viewer-icon"><ShieldCheck size={22} /></span><div><strong>{proof.profile}</strong><small>Signed {formatDateTime(proof.signedAt)} · Proof ID {proof.proofId.slice(0, 12)}…</small></div><button className="button button-subtle button-small" onClick={() => void copyManifest()}><Copy size={14} /> {copied ? 'Copied' : 'Copy manifest'}</button></div>
    <div className="proof-index-grid"><div><span>File size</span><strong>{formatBytes(proof.byteSegmentIndex.fileSize)}</strong></div><div><span>Chunk size</span><strong>{formatBytes(proof.byteSegmentIndex.chunkSize)}</strong></div><div><span>Chunk count</span><strong>{proof.byteSegmentIndex.chunkCount.toLocaleString()}</strong></div><div><span>Text page leaves</span><strong>{proof.textEvidenceLeafHashes?.length ?? 'Not included'}</strong></div></div>
    <div className="proof-json-label">CANONICAL SIGNED MANIFEST</div><pre className="proof-json">{manifestJson}</pre>
    <div className="proof-signature-grid"><div><span>Manifest signature</span><code>{shortHash(proof.proof.signature)}</code></div><div><span>Certified public key</span><code>{shortHash(String(proof.proof.certificate.payload.publicKey || ''))}</code></div><div><span>Manifest Merkle root</span><code>{proof.proof.manifest.merkle.root}</code></div>{proof.proof.manifest.textEvidence && <div><span>Text evidence root</span><code>{proof.proof.manifest.textEvidence.root}</code></div>}</div>
    <p className="quiet-copy">The complete proof response remains available from the authenticated proof endpoint. This view intentionally summarizes the large auxiliary leaf index.</p>
  </Modal>;
}

function VersionCard({ version, selected, onClick }: { version: DocumentVersionSummary; selected: boolean; onClick: () => void }) {
  return <button className={`version-card ${selected ? 'version-card-active' : ''}`} onClick={onClick}>
    <span className={`version-card-icon ${version.status === 'signed' ? 'version-card-icon-signed' : ''}`}>{version.status === 'signed' ? <FileCheck2 size={18} /> : <FileText size={18} />}</span>
    <span className="version-card-copy"><strong>Version <code>{version.versionId.slice(0, 8)}</code></strong><small>{formatDateTime(version.createdAt)}</small><small>{version.signedProfile ? version.signedProfile : 'No signature yet'}</small></span>
    <StatusBadge status={version.status} />
  </button>;
}

export function DocumentDetailPage() {
  const { documentId = '' } = useParams();
  const [data, setData] = useState<DocumentDetailsResponse | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [proof, setProof] = useState<SignedProofResponse | null>(null);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true); setError('');
    try {
      const result = await api.documents.details(documentId);
      setData(result);
      setSelectedVersionId((current) => result.versions.some((version) => version.versionId === current) ? current : result.versions[0]?.versionId || '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load document details.'); }
    finally { setLoading(false); }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  const selected = data?.versions.find((version) => version.versionId === selectedVersionId) || data?.versions[0];

  async function download(version: DocumentVersionSummary) {
    setBusy(true); setError(''); setSuccess('');
    try { await api.documents.download(documentId, version.versionId, data?.document.name || 'document.pdf'); setSuccess('Download prepared after stored-file integrity verification.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Download failed.'); }
    finally { setBusy(false); }
  }

  async function openProof(version: DocumentVersionSummary) {
    setBusy(true); setError('');
    try { setProof(await api.documents.proof(documentId, version.versionId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Proof could not be retrieved.'); }
    finally { setBusy(false); }
  }

  function onSigned(signed: SignedProofResponse) {
    setProof(signed);
    setSuccess('Signature created and proof validated.');
    void load();
  }

  if (loading) return <><PageHeader eyebrow="DOCUMENT" title="Document details" description="Metadata, versions, and signed evidence." /><div className="panel"><LoadingBlock label="Loading document and version history…" /></div></>;
  if (!data) return <><PageHeader eyebrow="DOCUMENT" title="Document unavailable" description="We could not retrieve this document." actions={<Link className="button button-subtle" to="/documents"><ArrowLeft size={16} /> Back to documents</Link>} /><ErrorBanner message={error || 'Document not found.'} /></>;

  return <>
    <PageHeader eyebrow="DOCUMENT RECORD" title={data.document.name} description={`Document ID ${data.document.documentId}`} actions={<><Link to="/documents" className="button button-subtle"><ArrowLeft size={16} /> Library</Link><Link to={`/verify?documentId=${encodeURIComponent(documentId)}${selected ? `&versionId=${encodeURIComponent(selected.versionId)}` : ''}`} className="button button-primary"><ShieldCheck size={16} /> Verify candidate</Link></>} />
    <ErrorBanner message={error} />{success && <SuccessBanner message={success} />}
    <div className="detail-summary-grid"><div className="detail-summary-card"><span className="detail-summary-icon"><FileText size={18} /></span><div><span>Created</span><strong>{formatDateTime(data.document.createdAt)}</strong></div></div><div className="detail-summary-card"><span className="detail-summary-icon detail-icon-green"><History size={18} /></span><div><span>Versions</span><strong>{data.versions.length}</strong></div></div><div className="detail-summary-card"><span className="detail-summary-icon detail-icon-purple"><Fingerprint size={18} /></span><div><span>Signed versions</span><strong>{data.versions.filter((version) => version.status === 'signed').length}</strong></div></div></div>
    <div className="detail-layout">
      <section className="panel version-history-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><History size={14} /> VERSION HISTORY</div><h2>Document versions</h2><p>Newest version first.</p></div><span className="small-count">{data.versions.length} total</span></div>
        {data.versions.map((version) => <VersionCard key={version.versionId} version={version} selected={selected?.versionId === version.versionId} onClick={() => { setSelectedVersionId(version.versionId); setSuccess(''); setProof(null); }} />)}
      </section>
      {selected && <section className="detail-right-column">
        <div className="panel selected-version-panel"><div className="selected-version-heading"><div><div className="section-kicker"><FileCheck2 size={14} /> SELECTED VERSION</div><h2>{selected.status === 'signed' ? 'Proof & integrity' : 'Ready to sign'}</h2></div><StatusBadge status={selected.status} /></div>
          <div className="version-file-overview"><div className="version-file-icon"><FileText size={21} /></div><div><strong>PDF document</strong><span>{formatBytes(selected.file.size)} · Updated {formatDateTime(selected.updatedAt)}</span><code>SHA-256 {shortHash(selected.file.sha256)}</code></div></div>
          <div className="version-meta-list"><div><span>Preflight policy</span><code>{selected.preflight.policy}</code></div><div><span>Parser identity</span><code>{selected.preflight.parser}</code></div>{selected.signedAt && <div><span>Signed at</span><strong>{formatDateTime(selected.signedAt)}</strong></div>}</div>
          {selected.status === 'signed' ? <div className="signed-profile-summary"><div className="signed-profile-check"><BadgeCheck size={18} /></div><div><strong>{selected.signedProfile === 'vault-pdf-text-v1' ? 'Text-evidence profile' : 'Strict integrity profile'}</strong><small>{selected.signedProfile}</small><p>{selected.signedProfile === 'vault-pdf-text-v1' ? 'The signature commits to exact bytes and normalized extracted text by page.' : 'The signature commits to the exact file bytes and chunked integrity root.'}</p></div></div> : <SignFlow documentId={documentId} versionId={selected.versionId} profiles={selected.profiles} onSigned={onSigned} compact />}
          <div className="version-action-row"><button className="button button-subtle button-small" onClick={() => void download(selected)} disabled={busy}><ArrowDownToLine size={15} /> Download</button><button className="button button-subtle button-small" onClick={() => void openProof(selected)} disabled={busy || selected.status !== 'signed'}><ShieldCheck size={15} /> View proof</button><Link className="button button-subtle button-small" to={`/verify?documentId=${encodeURIComponent(documentId)}&versionId=${encodeURIComponent(selected.versionId)}`}><ShieldX size={15} /> Verify</Link></div>
        </div>
        <div className="mini-notice"><CalendarClock size={17} /><div><strong>Immutable version history</strong><p>Each upload creates a version. A signed version cannot be silently replaced with new file bytes.</p></div></div>
      </section>}
    </div>
    {proof && <ProofViewer proof={proof} onClose={() => setProof(null)} />}
  </>;
}
