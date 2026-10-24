import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Toast = { id: number; type: 'success' | 'error'; message: string };

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ type?: 'success' | 'error'; message?: string }>;
      if (!custom.detail?.message) return;
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, type: custom.detail.type === 'success' ? 'success' : 'error', message: custom.detail.message || '' }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
    };
    window.addEventListener('vault:toast', listener);
    return () => window.removeEventListener('vault:toast', listener);
  }, []);

  return <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.type}`} key={toast.id}>{toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{toast.message}</span><button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification"><X size={15} /></button></div>)}</div>;
}
