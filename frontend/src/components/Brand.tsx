import { ShieldCheck } from 'lucide-react';

export function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''} ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></span>
      {!compact && <span className="brand-word">vault<span className="brand-period">.</span></span>}
    </div>
  );
}
