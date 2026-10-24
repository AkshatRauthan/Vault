import { ArrowUpRight, FileCheck2, FileClock, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DocumentListItem } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { formatBytes, formatDate } from '../lib/format';

export function DocumentTable({ items }: { items: DocumentListItem[] }) {
  if (items.length === 0) return <div className="table-empty"><div className="table-empty-icon"><FileText size={22} /></div><strong>No documents match this view</strong><span>Try a different search or upload a PDF to get started.</span></div>;

  return <div className="table-scroll"><table className="data-table">
    <thead><tr><th>DOCUMENT</th><th>STATUS</th><th>INTEGRITY PROFILE</th><th>FILE SIZE</th><th>LAST UPDATED</th><th aria-label="Open" /></tr></thead>
    <tbody>{items.map((item) => {
      const version = item.latestVersion;
      const isSigned = version?.status === 'signed';
      const Icon = isSigned ? FileCheck2 : version?.status === 'signing' ? FileClock : FileText;
      return <tr key={item.document.documentId}>
        <td><Link to={`/documents/${item.document.documentId}`} className="table-document-link"><span className={`table-file-icon ${isSigned ? 'file-icon-signed' : ''}`}><Icon size={18} /></span><span className="table-document-copy"><strong>{item.document.name}</strong><small>{item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'} · ID {item.document.documentId.slice(0, 8)}</small></span></Link></td>
        <td>{version ? <StatusBadge status={version.status} /> : <StatusBadge status="uploaded" />}</td>
        <td>{version?.signedProfile ? <span className="profile-chip">{version.signedProfile === 'vault-pdf-text-v1' ? 'Text evidence' : 'Strict integrity'}</span> : <span className="table-muted">Not signed</span>}</td>
        <td className="table-muted">{version ? formatBytes(version.file.size) : '—'}</td>
        <td><span className="date-cell">{formatDate(version?.signedAt || item.document.updatedAt)}</span></td>
        <td><Link className="table-open-link" to={`/documents/${item.document.documentId}`} aria-label={`Open ${item.document.name}`}><ArrowUpRight size={17} /></Link></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
