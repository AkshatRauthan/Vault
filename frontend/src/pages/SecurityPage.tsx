import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Fingerprint, KeyRound, Laptop, LogOut, RefreshCw, Shield, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { KeyVersionView, SessionView } from '../lib/types';
import { ErrorBanner, LoadingBlock, SuccessBanner } from '../components/Feedback';
import { PageHeader } from '../components/AppShell';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { formatDateTime, shortHash } from '../lib/format';
import { useAuth } from '../context/AuthContext';

type SensitiveAction = 'rotate' | 'revoke' | 'logout-all';

export function SecurityPage() {
  const { refreshUser, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [keys, setKeys] = useState<KeyVersionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRef, setBusyRef] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [action, setAction] = useState<SensitiveAction | null>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState<'suspected_compromise' | 'other'>('other');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [sessionResult, keyResult] = await Promise.allSettled([api.auth.sessions(), api.keys.mine()]);
    if (sessionResult.status === 'fulfilled') setSessions(sessionResult.value.sessions);
    else setError(sessionResult.reason instanceof Error ? sessionResult.reason.message : 'Could not load sessions.');
    if (keyResult.status === 'fulfilled') setKeys(keyResult.value.keys);
    else if (sessionResult.status === 'fulfilled') setError(keyResult.reason instanceof Error ? keyResult.reason.message : 'Could not load signing keys.');
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function revokeSession(session: SessionView) {
    setBusyRef(session.ref); setError(''); setSuccess('');
    try {
      await api.auth.revokeSession(session.ref);
      setSuccess(session.current ? 'The current session was revoked.' : 'Session revoked.');
      if (session.current) {
        await refreshUser();
        navigate('/login', { replace: true });
      } else await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not revoke session.'); }
    finally { setBusyRef(''); }
  }

  async function performSensitiveAction(event: FormEvent) {
    event.preventDefault(); if (!action) return;
    setActionBusy(true); setError(''); setSuccess('');
    try {
      await api.auth.reauth(password);
      if (action === 'rotate') {
        const result = await api.keys.rotate();
        setSuccess(`Signing key rotated to version ${result.key.keyVersion}.`);
      } else if (action === 'revoke') {
        const result = await api.keys.revoke(reason);
        setSuccess(`Key version ${result.revoked.keyVersion} was revoked. A replacement version ${result.active.keyVersion} is now active.`);
      } else {
        await logoutAll();
        navigate('/login', { replace: true });
        return;
      }
      setAction(null); setPassword(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Security operation failed.'); }
    finally { setActionBusy(false); }
  }

  const activeKey = keys.find((key) => key.status === 'active');

  return <>
    <PageHeader eyebrow="ACCOUNT SECURITY" title="Security & keys" description="Manage your sessions and the keys that identify signing operations." actions={<button className="button button-subtle" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>} />
    <ErrorBanner message={error} />{success && <SuccessBanner message={success} />}
    <div className="security-overview-grid"><div className="security-overview-card"><span className="security-overview-icon"><ShieldCheck size={19} /></span><div><span>Session posture</span><strong>{sessions.some((session) => session.suspicious) ? 'Review needed' : 'No flags reported'}</strong><small>{sessions.length} active session{sessions.length === 1 ? '' : 's'}</small></div></div><div className="security-overview-card"><span className="security-overview-icon security-key-icon"><KeyRound size={19} /></span><div><span>Signing key</span><strong>{activeKey ? `Version ${activeKey.keyVersion} active` : 'Not created yet'}</strong><small>{activeKey ? `Key ID ${activeKey.keyId.slice(0, 8)}…` : 'Created during first signing operation'}</small></div></div></div>
    <section className="panel security-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><Fingerprint size={14} /> SIGNING IDENTITY</div><h2>Key versions</h2><p>Old public keys remain available so historical proofs can continue to verify.</p></div><div className="security-panel-actions"><button className="button button-subtle button-small" onClick={() => { setAction('revoke'); setError(''); }} disabled={!activeKey}><Shield size={15} /> Revoke active</button><button className="button button-primary button-small" onClick={() => { setAction('rotate'); setError(''); }}><RefreshCw size={15} /> Rotate key</button></div></div>
      {loading ? <LoadingBlock label="Loading key versions…" /> : keys.length === 0 ? <div className="security-empty"><KeyRound size={22} /><div><strong>No signing key yet</strong><p>Vault creates a signing key the first time you sign a document, or you can create one by selecting Rotate key.</p></div></div> : <div className="key-list">{keys.map((key) => <div className="key-row" key={`${key.keyId}-${key.keyVersion}`}><span className={`key-row-icon ${key.status === 'active' ? 'key-row-icon-active' : ''}`}><KeyRound size={18} /></span><div className="key-row-main"><strong>Key version {key.keyVersion}</strong><span>{key.keyId}</span><code>{shortHash(key.publicKey)}</code></div><div className="key-row-dates"><span>Created {formatDateTime(key.createdAt)}</span>{key.retiredAt && <small>Retired {formatDateTime(key.retiredAt)}</small>}{key.revokedAt && <small>Revoked {formatDateTime(key.revokedAt)}</small>}</div><StatusBadge status={key.status} /></div>)}</div>}
      <div className="security-footnote"><ShieldCheck size={15} /> Revocation changes online key status; it does not erase historical certificates or signatures.</div>
    </section>
    <section className="panel sessions-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><Laptop size={14} /> SESSION MANAGEMENT</div><h2>Active sessions</h2><p>Review devices currently associated with your account.</p></div><button className="button button-danger-outline button-small" onClick={() => { setAction('logout-all'); setError(''); }}><LogOut size={14} /> Sign out everywhere</button></div>
      {loading ? <LoadingBlock label="Loading sessions…" /> : sessions.length === 0 ? <div className="security-empty"><Laptop size={22} /><div><strong>No active sessions found</strong><p>Refresh this view after signing in again.</p></div></div> : <div className="session-list">{sessions.map((session) => <div className="session-row" key={session.ref}><span className="session-device-icon">{/Android|iPhone|Mobile/i.test(session.userAgent) ? <Smartphone size={18} /> : <Laptop size={18} />}</span><div className="session-row-main"><div className="session-name"><strong>{session.current ? 'This device' : 'Other session'}</strong>{session.current && <span className="current-session-pill">CURRENT</span>}{session.suspicious && <span className="suspicious-session-pill"><AlertTriangle size={12} /> Reauthentication required</span>}</div><span>{session.userAgent || 'Unknown browser'} · {session.ip || 'Unknown IP'}</span><small>Created {formatDateTime(session.createdAt)} · Expires {formatDateTime(session.expiresAt)}</small></div><button className="button button-danger-outline button-small" disabled={busyRef === session.ref} onClick={() => void revokeSession(session)}><X size={14} /> {busyRef === session.ref ? 'Revoking…' : 'Revoke'}</button></div>)}</div>}
    </section>
    {action && <Modal title={action === 'rotate' ? 'Rotate signing key' : action === 'revoke' ? 'Revoke active signing key' : 'Sign out everywhere'} description={action === 'rotate' ? 'Create a new certified signing-key version. Historical keys remain available for verification.' : action === 'revoke' ? 'The active key will be revoked and replaced immediately. Existing proofs remain cryptographically checkable.' : 'All sessions, including this one, will be terminated.'} onClose={() => { if (!actionBusy) { setAction(null); setPassword(''); } }}>
      <form className="modal-form" onSubmit={performSensitiveAction}><ErrorBanner message={error} />{action === 'revoke' && <><label className="field-label" htmlFor="revoke-reason">Reason</label><select className="text-input select-input" id="revoke-reason" value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="other">Routine security rotation</option><option value="suspected_compromise">Suspected compromise</option></select><div className="modal-note"><AlertTriangle size={15} /> This operation creates a replacement key, but it changes the status of the previous key.</div></>}{action === 'logout-all' && <div className="modal-note"><LogOut size={15} /> You will need to sign in again on this device.</div>}<label className="field-label" htmlFor="security-password">Confirm with password</label><input className="text-input" id="security-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /><button className={`button ${action === 'revoke' || action === 'logout-all' ? 'button-danger' : 'button-primary'} button-full`} disabled={actionBusy || !password}>{actionBusy ? 'Processing securely…' : action === 'rotate' ? 'Reauthenticate & rotate' : action === 'revoke' ? 'Reauthenticate & revoke' : 'Reauthenticate & sign out all'}</button></form>
    </Modal>}
  </>;
}
