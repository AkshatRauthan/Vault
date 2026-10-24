import { useEffect, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BadgeCheck, FileKey2, FilePlus2, Files, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { DocumentListResponse } from '../lib/types';
import { ErrorBanner, LoadingBlock, EmptyState } from '../components/Feedback';
import { DocumentTable } from '../components/DocumentTable';
import { PageHeader } from '../components/AppShell';
import { formatDateTime } from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.documents.list(1, 20).then((result) => { if (active) setData(result); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load documents.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const items = data?.items || [];
  const signed = items.filter((item) => item.latestVersion?.status === 'signed').length;
  const awaiting = items.filter((item) => item.latestVersion?.status === 'uploaded').length;
  const textReady = items.filter((item) => item.latestVersion?.profiles['vault-pdf-text-v1']?.available).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return <>
    <PageHeader eyebrow="OVERVIEW" title={`${greeting}, ${user?.name.split(' ')[0] || 'there'}.`} description="Your documents, signatures, and integrity proofs in one place." actions={<Link to="/upload" className="button button-primary"><FilePlus2 size={17} /> Upload a PDF</Link>} />
    <ErrorBanner message={error} />
    <div className="welcome-strip"><div className="welcome-icon"><Sparkles size={20} /></div><div><strong>Make every signature verifiable.</strong><p>Upload a PDF, choose an evidence profile, and keep a proof you can validate later.</p></div><Link to="/upload" className="welcome-action">Start with a document <ArrowRight size={15} /></Link></div>
    <section className="stats-grid">
      <div className="stat-card"><div className="stat-card-top"><span>Total documents</span><span className="stat-icon stat-icon-blue"><Files size={17} /></span></div><div className="stat-number">{loading ? '—' : data?.pagination.total ?? 0}</div><div className="stat-foot"><span className="stat-dot dot-blue" /> In your workspace</div></div>
      <div className="stat-card"><div className="stat-card-top"><span>Signed versions</span><span className="stat-icon stat-icon-green"><BadgeCheck size={17} /></span></div><div className="stat-number">{loading ? '—' : signed}</div><div className="stat-foot"><span className="stat-dot dot-green" /> Among the latest 20</div></div>
      <div className="stat-card"><div className="stat-card-top"><span>Awaiting signature</span><span className="stat-icon stat-icon-amber"><FileKey2 size={17} /></span></div><div className="stat-number">{loading ? '—' : awaiting}</div><div className="stat-foot"><span className="stat-dot dot-amber" /> Ready for your review</div></div>
      <div className="stat-card"><div className="stat-card-top"><span>Text evidence ready</span><span className="stat-icon stat-icon-purple"><ShieldCheck size={17} /></span></div><div className="stat-number">{loading ? '—' : textReady}</div><div className="stat-foot"><span className="stat-dot dot-purple" /> Latest 20 documents</div></div>
    </section>
    <section className="panel documents-panel">
      <div className="panel-heading"><div><div className="section-kicker"><Activity size={14} /> YOUR DOCUMENTS</div><h2>Recent activity</h2><p>The latest versions in your Vault workspace.</p></div><Link to="/documents" className="text-link">View all <ArrowRight size={15} /></Link></div>
      {loading ? <LoadingBlock label="Loading recent documents…" /> : items.length ? <DocumentTable items={items.slice(0, 6)} /> : <EmptyState icon={<Files size={24} />} title="Your workspace is ready" description="Upload your first PDF to create a verifiable document record." action={<Link className="button button-primary" to="/upload"><FilePlus2 size={16} /> Upload your first PDF</Link>} />}
      {!!items.length && <div className="panel-footer"><span>Last refreshed {formatDateTime(new Date().toISOString())}</span><Link to="/documents">Browse document library <ArrowUpRight size={14} /></Link></div>}
    </section>
    <section className="bottom-info-grid">
      <div className="info-mini-card"><span className="mini-icon"><ShieldCheck size={18} /></span><div><strong>Exact-byte integrity</strong><p>Strict profile signs the fingerprint of the exact file.</p></div><span className="mini-status">ALWAYS AVAILABLE</span></div>
      <div className="info-mini-card"><span className="mini-icon mini-icon-lilac"><FileKey2 size={18} /></span><div><strong>Text-evidence profile</strong><p>Add a separate commitment to extracted PDF text by page.</p></div><span className="mini-status mini-status-lilac">WHEN SUPPORTED</span></div>
    </section>
  </>;
}
