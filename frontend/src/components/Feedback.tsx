import { AlertCircle, CheckCircle2, Info, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return <div className="feedback feedback-error"><AlertCircle size={17} /><span>{message}</span>{onDismiss && <button onClick={onDismiss} aria-label="Dismiss error">×</button>}</div>;
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="feedback feedback-success"><CheckCircle2 size={17} /><span>{message}</span></div>;
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return <div className="feedback feedback-info"><Info size={17} /><span>{children}</span></div>;
}

export function LoadingBlock({ label = 'Loading your workspace' }: { label?: string }) {
  return <div className="loading-block"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>;
}

export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action && <div className="empty-action">{action}</div>}</div>;
}
