import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, FileSearch, FileText, Fingerprint, ShieldAlert, UploadCloud, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { DocumentDetailsResponse, DocumentListResponse, DocumentProfile, DocumentVersionSummary, VerifyResponse } from '../lib/types';
import { ErrorBanner, InfoBanner, LoadingBlock } from '../components/Feedback';
import { PageHeader } from '../components/AppShell';
import { formatBytes, formatDateTime } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';

interface VerifyTarget {
  documentId: string;
  versionId: string;
  name: string;
  signedProfile: DocumentProfile;
  signedAt?: string;
  updatedAt: string;
  size: number;
}

const targetFromLatest = (item: DocumentListResponse['items'][number]): VerifyTarget | null => {
  const version = item.latestVersion;
  if (!version || version.status !== 'signed' || !version.signedProfile) return null;
  return {
    documentId: item.document.documentId,
    versionId: version.versionId,
    name: item.document.name,
    signedProfile: version.signedProfile,
    signedAt: version.signedAt,
    updatedAt: version.updatedAt,
    size: version.file.size,
  };
};

const targetFromDetail = (documentId: string, details: DocumentDetailsResponse, version: DocumentVersionSummary): VerifyTarget | null => {
  if (version.status !== 'signed' || !version.signedProfile) return null;
  return {
    documentId,
    versionId: version.versionId,
    name: details.document.name,
    signedProfile: version.signedProfile,
    signedAt: version.signedAt,
    updatedAt: version.updatedAt,
    size: version.file.size,
  };
};

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [list, setList] = useState<DocumentListResponse | null>(null);
  const [targets, setTargets] = useState<VerifyTarget[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [selection, setSelection] = useState('');
  const [candidate, setCandidate] = useState<File | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadTargets = async () => {
      setLoadingList(true);
      try {
        const response = await api.documents.list(1, 100);
        if (!active) return;
        setList(response);
        const latestTargets = response.items.map(targetFromLatest).filter((target): target is VerifyTarget => target !== null);
        let options = latestTargets;
        const wantedDocumentId = searchParams.get('documentId');
        const wantedVersionId = searchParams.get('versionId');
        let wanted = options.find((target) => target.documentId === wantedDocumentId && target.versionId === wantedVersionId);

        // A details page can link directly to an older signed version. Fetch only that document's history
        // when the requested version is not the latest, rather than issuing N requests for the whole library.
        if (!wanted && wantedDocumentId && wantedVersionId) {
          const details = await api.documents.details(wantedDocumentId);
          if (!active) return;
          const targetVersion = details.versions.find((version) => version.versionId === wantedVersionId);
          if (targetVersion) {
            wanted = targetFromDetail(wantedDocumentId, details, targetVersion) || undefined;
            if (wanted) options = [wanted, ...options.filter((target) => target.versionId !== wantedVersionId)];
          }
        }
        if (!active) return;
        setTargets(options);
        setSelection(wanted ? `${wanted.documentId}:${wanted.versionId}` : options[0] ? `${options[0].documentId}:${options[0].versionId}` : '');
      } catch (err) {
        if (active) setListError(err instanceof Error ? err.message : 'Could not load your signed documents.');
      } finally {
        if (active) setLoadingList(false);
      }
    };
    void loadTargets();
    return () => { active = false; };
  }, [searchParams]);

  const chosen = useMemo(() => targets.find((target) => `${target.documentId}:${target.versionId}` === selection), [targets, selection]);
  const exactVerified = !!result && result.byteVerification.byteIdentical && result.byteVerification.indexTrusted && result.byteVerification.certificateValid && result.byteVerification.signerBinding && result.byteVerification.signatureValid;

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!candidate || !chosen) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api.documents.verify(chosen.documentId, chosen.versionId, candidate)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Verification request failed.'); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="INDEPENDENT CHECK" title="Verify a PDF" description="Compare a candidate file against a stored signed proof. The candidate is never uploaded as a new document." />
    <ErrorBanner message={listError || error} />
    <div className="verify-layout">
      <section className="panel verify-form-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><FileSearch size={14} /> VERIFICATION INPUT</div><h2>Choose the signed version</h2><p>Select the record you want to verify, then provide the candidate PDF.</p></div><span className="step-counter">01 / 02</span></div>
        {loadingList ? <LoadingBlock label="Loading signed versions…" /> : targets.length === 0 ? <div className="verify-no-signed"><div className="empty-icon"><FileText size={24} /></div><strong>No signed versions yet</strong><p>Sign a document first; only versions with a stored signed proof can be verified.</p><Link to="/upload" className="button button-primary">Upload & sign <ArrowRight size={16} /></Link></div> : <form onSubmit={verify}>
          <label className="field-label" htmlFor="target-version">Signed document version</label>
          <select className="text-input select-input" id="target-version" value={selection} onChange={(event) => { setSelection(event.target.value); setResult(null); }} required>
            {targets.map((target) => <option key={`${target.documentId}:${target.versionId}`} value={`${target.documentId}:${target.versionId}`}>{target.name} · {target.signedProfile === 'vault-pdf-text-v1' ? 'Text evidence' : 'Strict'} · {target.versionId.slice(0, 8)}</option>)}
          </select>
          {chosen && <div className="verify-target-card"><span className="table-file-icon file-icon-signed"><FileCheck2 size={18} /></span><div><strong>{chosen.name}</strong><span>Signed {formatDateTime(chosen.signedAt || chosen.updatedAt)}</span><small>{chosen.signedProfile} · {formatBytes(chosen.size)}</small></div><StatusBadge status="signed" /></div>}
          <label className="field-label" htmlFor="candidate-pdf">Candidate PDF</label>
          <label className={`candidate-picker ${candidate ? 'candidate-picker-selected' : ''}`} htmlFor="candidate-pdf"><input id="candidate-pdf" type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; setError(''); setResult(null); if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) setCandidate(file); else if (file) { setCandidate(null); setError('Choose a PDF candidate.'); } }} /><span className="candidate-icon">{candidate ? <FileCheck2 size={22} /> : <UploadCloud size={22} />}</span><strong>{candidate?.name || 'Choose the candidate file'}</strong><span>{candidate ? formatBytes(candidate.size) : 'Browse a PDF from your device'}</span></label>
          <InfoBanner>Vault runs bounded PDF preflight on the candidate. Exact-byte integrity and text evidence are reported separately.</InfoBanner>
          <button type="submit" className="button button-primary button-full" disabled={!candidate || !chosen || busy}>{busy ? <><span className="button-spinner" /> Verifying integrity…</> : <>Verify against signed proof <ArrowRight size={16} /></>}</button>
        </form>}
      </section>
      <aside className="verify-aside"><div className="panel verify-explain-panel"><div className="verify-emblem"><div className="verify-emblem-ring"><Fingerprint size={31} /></div><span className="verify-ring-dot" /></div><h3>What does Vault verify?</h3><p>Verification checks both whether the signature is authentic and whether the file matches the signed commitment.</p><div className="verify-check-row"><span><CheckCircle2 size={15} /></span><div><strong>Proof chain</strong><small>Certificate trust, signer binding, and manifest signature.</small></div></div><div className="verify-check-row"><span><CheckCircle2 size={15} /></span><div><strong>Exact file bytes</strong><small>Fingerprint and chunk index checked against the signed root.</small></div></div><div className="verify-check-row"><span><CheckCircle2 size={15} /></span><div><strong>Page text evidence</strong><small>Available when the proof uses the text-evidence profile.</small></div></div><div className="table-helper">{list && list.pagination.total > list.items.length ? `Showing the latest 100 of ${list.pagination.total} documents. Open a document's details to verify an older version.` : 'Choose any visible signed version, including an older version opened from document details.'}</div></div></aside>
    </div>
    {result && <section className="panel verify-result-panel">
      <div className="verify-result-header"><div className={`verify-result-mark ${exactVerified ? 'verify-result-pass' : 'verify-result-fail'}`}>{exactVerified ? <CheckCircle2 size={24} /> : <ShieldAlert size={24} />}</div><div><div className="section-kicker">VERIFICATION RESULT</div><h2>{exactVerified ? 'Exact match — proof valid' : result.byteVerification.byteIdentical ? 'Bytes match, but proof checks need review' : 'Differences detected'}</h2><p>{exactVerified ? 'The candidate bytes match the signed fingerprint, and the proof chain and stored index checks passed.' : result.byteVerification.byteIdentical ? 'The candidate bytes match the fingerprint, but one or more proof or index checks did not pass. Review the facts below.' : 'The candidate does not match the exact signed file bytes. Review each verification fact below.'}</p></div><StatusBadge status={exactVerified ? 'verified' : 'failed'} /></div>
      <div className="verification-facts-grid"><Fact label="Certificate valid" value={result.byteVerification.certificateValid} /><Fact label="Signer binding" value={result.byteVerification.signerBinding} /><Fact label="Manifest signature" value={result.byteVerification.signatureValid} /><Fact label="Stored index trusted" value={result.byteVerification.indexTrusted} /><Fact label="File size matches" value={result.byteVerification.sizeMatches} /><div className="verification-fact"><span>Current key status</span><StatusBadge status={result.byteVerification.keyStatus} /></div></div>
      <div className="verify-size-row"><div><span>Signed file size</span><strong>{formatBytes(result.byteVerification.originalSize)}</strong></div><div><span>Candidate size</span><strong>{formatBytes(result.byteVerification.candidateSize)}</strong></div><div><span>Signed profile</span><strong>{result.profile}</strong></div></div>
      {result.byteVerification.reasons.length > 0 && <div className="verify-reasons"><strong><AlertTriangle size={15} /> Verification notes</strong>{result.byteVerification.reasons.map((reason, index) => <p key={`${index}-${reason}`}>{reason}</p>)}</div>}
      {result.byteVerification.differingChunks.length > 0 && <div className="diff-list-wrap"><h3><Fingerprint size={16} /> Differing byte chunks <span>{result.byteVerification.differingChunks.length}</span></h3><div className="diff-list">{result.byteVerification.differingChunks.map((chunk) => <div key={chunk.index} className="diff-chunk"><strong>Chunk {chunk.index + 1}</strong><span>Original: {chunk.original ? `${chunk.original.from.toLocaleString()}–${chunk.original.to.toLocaleString()} bytes` : 'Not present'}</span><span>Candidate: {chunk.candidate ? `${chunk.candidate.from.toLocaleString()}–${chunk.candidate.to.toLocaleString()} bytes` : 'Not present'}</span></div>)}</div><small className="quiet-copy">Chunk ranges are positional; ranges after a size change may be shifted.</small></div>}
      <div className="text-evidence-result"><div className="text-evidence-result-heading"><span className="text-evidence-result-icon"><FileText size={17} /></span><div><h3>Text evidence</h3><p>Separate from exact-byte verification.</p></div>{result.textEvidence.available && result.textEvidence.rootMatches !== undefined && <StatusBadge status={result.textEvidence.rootMatches ? 'verified' : 'failed'} />}</div>
        {result.textEvidence.available ? <><div className="text-evidence-facts"><Fact label="Text index trusted" value={!!result.textEvidence.indexTrusted} /><Fact label="Page count matches" value={!!result.textEvidence.pageCountMatches} /><Fact label="Text root matches" value={!!result.textEvidence.rootMatches} /></div>{result.textEvidence.differingPages && result.textEvidence.differingPages.length > 0 ? <div className="page-diff-row"><strong>Pages with changed text evidence</strong><div>{result.textEvidence.differingPages.map((page) => <span key={page}>Page {page}</span>)}</div></div> : result.textEvidence.rootMatches ? <p className="text-result-positive"><CheckCircle2 size={15} /> Extracted text evidence matches the signed root.</p> : <p className="quiet-copy">Text evidence did not match or could not be compared.</p>}{result.textEvidence.unextractablePages && result.textEvidence.unextractablePages.length > 0 && <p className="quiet-copy">Text extraction failed on pages: {result.textEvidence.unextractablePages.join(', ')}.</p>}</> : <div className="text-evidence-unavailable"><AlertTriangle size={16} /><span>{result.textEvidence.reason || 'Text evidence is unavailable for this comparison.'}</span></div>}
      </div>
    </section>}
  </>;
}

function Fact({ label, value }: { label: string; value: boolean }) {
  return <div className="verification-fact"><span>{label}</span><strong className={value ? 'fact-true' : 'fact-false'}>{value ? <><CheckCircle2 size={14} /> Yes</> : <><XCircle size={14} /> No</>}</strong></div>;
}
