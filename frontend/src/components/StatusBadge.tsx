import { CheckCircle2, Clock3, FileUp, AlertTriangle } from 'lucide-react';
import type { DocumentStatus, KeyStatus } from '../lib/types';

export function StatusBadge({ status }: { status: DocumentStatus | KeyStatus | 'verified' | 'failed' | 'unknown' }) {
  const config = {
    uploaded: { label: 'Awaiting signature', icon: FileUp, className: 'badge-neutral' },
    signing: { label: 'Signing', icon: Clock3, className: 'badge-warn' },
    signed: { label: 'Signed', icon: CheckCircle2, className: 'badge-success' },
    active: { label: 'Active', icon: CheckCircle2, className: 'badge-success' },
    retired: { label: 'Retired', icon: Clock3, className: 'badge-neutral' },
    revoked: { label: 'Revoked', icon: AlertTriangle, className: 'badge-danger' },
    verified: { label: 'Verified', icon: CheckCircle2, className: 'badge-success' },
    failed: { label: 'Mismatch', icon: AlertTriangle, className: 'badge-danger' },
    unknown: { label: 'Unknown', icon: AlertTriangle, className: 'badge-warn' },
  }[status];
  const Icon = config.icon;
  return <span className={`status-badge ${config.className}`}><Icon size={13} strokeWidth={2.3} />{config.label}</span>;
}
