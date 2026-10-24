import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileCheck2, FileText, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { SignedProofResponse, UploadResponse } from '../lib/types';
import { ErrorBanner, InfoBanner, SuccessBanner } from '../components/Feedback';
import { PageHeader } from '../components/AppShell';
import { formatBytes, shortHash } from '../lib/format';
import { SignFlow } from '../components/SignFlow';

const MAX_UPLOAD_BYTES = Number(import.meta.env.VITE_MAX_UPLOAD_BYTES || 50_000_000);

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [signedProof, setSignedProof] = useState<SignedProofResponse | null>(null);

  function acceptFile(nextFile?: File) {
    if (!nextFile) return;
    setError(''); setResult(null); setSignedProof(null);
    if (!nextFile.name.toLowerCase().endsWith('.pdf') && nextFile.type !== 'application/pdf') {
      setError('Choose a PDF file. Vault accepts PDF documents only.'); return;
    }
    if (nextFile.size === 0) { setError('This file is empty. Choose a valid PDF.'); return; }
    if (nextFile.size > MAX_UPLOAD_BYTES) { setError(`This file exceeds the configured ${formatBytes(MAX_UPLOAD_BYTES)} upload limit.`); return; }
    setFile(nextFile);
    const withoutExtension = nextFile.name.replace(/\.pdf$/i, '');
    setName(withoutExtension.slice(0, 120));
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const uploaded = await api.documents.upload(file, name.trim() || file.name.replace(/\.pdf$/i, ''));
      setResult(uploaded);
      window.dispatchEvent(new CustomEvent('vault:toast', { detail: { type: 'success', message: 'PDF passed preflight and was stored successfully.' } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally { setBusy(false); }
  }

  function onSigned(proof: SignedProofResponse) {
    setSignedProof(proof);
    window.dispatchEvent(new CustomEvent('vault:toast', { detail: { type: 'success', message: 'Document signed and proof persisted.' } }));
  }

  function reset() { setFile(null); setName(''); setResult(null); setSignedProof(null); setError(''); if (inputRef.current) inputRef.current.value = ''; }

  return <>
    <PageHeader eyebrow="NEW DOCUMENT" title="Upload & sign" description="Run preflight first. Choose an evidence profile explicitly before signing." actions={<Link to="/documents" className="button button-subtle"><ArrowLeft size={16} /> Back to library</Link>} />
    <ErrorBanner message={error} />
    {!result ? <div className="upload-layout">
      <div className="panel upload-main-panel">
        <div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><UploadCloud size={14} /> STEP 01 · SELECT FILE</div><h2>Choose a PDF</h2><p>Your file will be preflighted and stored before it is signed.</p></div><span className="step-counter">01 / 02</span></div>
        <form onSubmit={upload}>
          <button type="button" className={`dropzone ${dragOver ? 'dropzone-active' : ''} ${file ? 'dropzone-has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); acceptFile(event.dataTransfer.files[0]); }}>
            <input ref={inputRef} type="file" hidden accept="application/pdf,.pdf" onClick={(event) => event.stopPropagation()} onChange={(event) => acceptFile(event.target.files?.[0])} />
            {file ? <><span className="dropzone-icon dropzone-icon-file"><FileCheck2 size={25} /></span><strong>{file.name}</strong><span>{formatBytes(file.size)} · Ready to upload</span><span className="dropzone-change">Choose a different file</span></> : <><span className="dropzone-icon"><UploadCloud size={26} /></span><strong>Drop your PDF here</strong><span>or <em>browse files</em> from your computer</span><small>PDF only · Up to {formatBytes(MAX_UPLOAD_BYTES)}</small></>}
          </button>
          <label className="field-label" htmlFor="document-name">Document name <span className="field-optional">OPTIONAL</span></label>
          <input className="text-input" id="document-name" placeholder="e.g. Service agreement — Client A" value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} maxLength={120} />
          <div className="field-bottom-note"><span>{name.length}/120 characters</span><span>The original PDF bytes will be preserved.</span></div>
          <button type="submit" className="button button-primary button-full upload-submit" disabled={!file || busy || name.trim().length > 120}>{busy ? <><span className="button-spinner" /> Preflighting & uploading…</> : <>Run preflight & upload <ArrowRight size={17} /></>}</button>
        </form>
        <div className="upload-safety-note"><LockKeyhole size={15} /><span>Private storage. Vault checks the stored file fingerprint after upload and before download.</span></div>
      </div>
      <aside className="upload-aside">
        <div className="panel aside-panel"><div className="aside-illustration"><div className="illus-document"><div /><div /><div /><div className="illus-seal"><ShieldCheck size={20} /></div></div><div className="illus-orbit illus-orbit-one" /><div className="illus-orbit illus-orbit-two" /></div><h3>From file to proof</h3><p>Every new upload follows the same reviewable sequence.</p><div className="timeline-list"><div className="timeline-item timeline-done"><span className="timeline-node"><CheckCircle2 size={14} /></span><div><strong>Preflight</strong><small>Validate PDF structure and policy.</small></div><span>01</span></div><div className="timeline-item"><span className="timeline-node"><FileText size={14} /></span><div><strong>Fingerprint</strong><small>Build a deterministic byte-integrity tree.</small></div><span>02</span></div><div className="timeline-item"><span className="timeline-node"><ShieldCheck size={14} /></span><div><strong>Choose profile</strong><small>Strict-only or text evidence, when available.</small></div><span>03</span></div></div></div>
        <div className="mini-notice"><ShieldCheck size={18} /><div><strong>No silent downgrade</strong><p>If text evidence is unavailable, Vault explains why. You must explicitly choose strict-only if byte-level integrity is enough for your use case.</p></div></div>
      </aside>
    </div> : <div className="upload-result-stack">
      <section className="panel upload-complete-panel"><div className="upload-complete-heading"><span className="upload-complete-icon"><CheckCircle2 size={23} /></span><div><div className="section-kicker">STEP 01 COMPLETE</div><h2>Preflight accepted</h2><p>Your document is stored securely and ready for an explicit signing decision.</p></div><button className="icon-button" onClick={reset} aria-label="Start another upload"><X size={18} /></button></div>
        <div className="uploaded-file-summary"><span className="table-file-icon file-icon-signed"><FileText size={21} /></span><div className="uploaded-file-copy"><strong>{result.name}</strong><span>{formatBytes(result.file.size)} · SHA-256 <code>{shortHash(result.file.sha256)}</code></span><small>Document ID: <code>{result.documentId}</code></small></div><span className="accepted-badge"><CheckCircle2 size={13} /> Accepted</span></div>
        <div className="preflight-metadata"><div><span>Policy</span><code>{result.preflight.policy}</code></div><div><span>Parser identity</span><code>{result.preflight.parser}</code></div></div>
      </section>
      <section className="panel signing-panel"><div className="panel-heading"><div><div className="section-kicker"><ShieldCheck size={14} /> STEP 02 · SIGNING DECISION</div><h2>Choose your evidence profile</h2><p>The profile and its guarantees will be included in the signed manifest.</p></div><span className="step-counter">02 / 02</span></div>
        <SignFlow documentId={result.documentId} versionId={result.versionId} profiles={result.profiles} onSigned={onSigned} />
        {signedProof && <div className="signed-confirmation"><SuccessBanner message={`Successfully signed with ${signedProof.profile}. Your proof is ready.`} /><div className="signed-confirmation-actions"><button className="button button-primary" onClick={() => navigate(`/documents/${result.documentId}`)}>Open document & proof <ArrowRight size={16} /></button><button className="button button-subtle" onClick={reset}>Upload another PDF</button></div></div>}
        {!signedProof && <InfoBanner>Upload is not a signature. Nothing is signed until you confirm a profile and reauthenticate.</InfoBanner>}
      </section>
    </div>}
  </>;
}
