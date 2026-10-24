import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FilePlus2, Files, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { DocumentListResponse, DocumentListItem } from '../lib/types';
import { ErrorBanner, LoadingBlock, EmptyState } from '../components/Feedback';
import { DocumentTable } from '../components/DocumentTable';
import { PageHeader } from '../components/AppShell';

export function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.documents.list(page, 20)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load documents.'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const rows = (data?.items || []).filter((item: DocumentListItem) => {
    const matchesSearch = `${item.document.name} ${item.document.documentId}`.toLowerCase().includes(search.toLowerCase());
    const currentStatus = item.latestVersion?.status || 'uploaded';
    return matchesSearch && (status === 'all' || currentStatus === status);
  });

  return <>
    <PageHeader eyebrow="LIBRARY" title="Documents" description="A clear record of every file, version, and signing decision." actions={<Link to="/upload" className="button button-primary"><FilePlus2 size={17} /> Upload PDF</Link>} />
    <ErrorBanner message={error} />
    <section className="panel documents-panel">
      <div className="library-toolbar"><div className="search-box"><Search size={17} /><input aria-label="Search documents on this page" placeholder="Search by name or ID…" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="search-count">{rows.length}</span></div><div className="filter-box"><SlidersHorizontal size={16} /><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="signed">Signed</option><option value="uploaded">Awaiting signature</option><option value="signing">Signing</option></select>{status !== 'all' && <button onClick={() => setStatus('all')} aria-label="Clear status filter"><X size={14} /></button>}</div></div>
      <div className="table-helper">Showing page {data?.pagination.page || page}; search and status filters apply to this page.</div>
      {loading ? <LoadingBlock label="Loading document library…" /> : rows.length ? <DocumentTable items={rows} /> : <EmptyState icon={<Files size={24} />} title={search || status !== 'all' ? 'No documents found' : 'No documents yet'} description={search || status !== 'all' ? 'Try clearing your filters or another search term.' : 'Upload a PDF to start your document integrity workflow.'} action={!search && status === 'all' ? <Link className="button button-primary" to="/upload"><FilePlus2 size={16} /> Upload a PDF</Link> : undefined} />}
      <div className="pagination-row"><span>{data ? `${data.pagination.total} total ${data.pagination.total === 1 ? 'document' : 'documents'}` : 'Loading total…'}</span><div className="pagination-actions"><button className="button button-subtle button-small" disabled={!data?.pagination.hasPreviousPage || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Previous</button><span className="pagination-current">{data?.pagination.totalPages ? `${data.pagination.page} / ${data.pagination.totalPages}` : '0 pages'}</span><button className="button button-subtle button-small" disabled={!data?.pagination.hasNextPage || loading} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={15} /></button></div></div>
    </section>
  </>;
}
