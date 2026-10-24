import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Fingerprint, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Brand } from '../components/Brand';
import { ErrorBanner } from '../components/Feedback';

export function AuthPage({ mode: initialMode = 'login' }: { mode?: 'login' | 'register' }) {
  const { user, loading: authLoading, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tagAvailability, setTagAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const requestedNext = searchParams.get('next') || '/';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')
    ? requestedNext
    : '/';

  if (authLoading) return <div className="auth-loading">Checking your session…</div>;
  if (user) return <Navigate to={next} replace />;

  async function checkTag() {
    const normalized = tag.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(normalized)) { setTagAvailability('idle'); return; }
    setTagAvailability('checking');
    try {
      const result = await api.users.tagAvailability(normalized);
      setTagAvailability(result.available ? 'available' : 'taken');
    } catch {
      setTagAvailability('idle');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'login') {
        await login(identifier.trim(), password, remember);
      } else {
        if (tagAvailability === 'taken') throw new Error('That handle is already in use.');
        await register({ name: name.trim(), tag: tag.trim().toLowerCase(), email: email.trim(), password });
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally { setBusy(false); }
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode); setError(''); setPassword('');
    const destination = nextMode === 'register' ? '/register' : '/login';
    navigate(`${destination}?next=${encodeURIComponent(next)}`, { replace: true });
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="auth-visual-glow auth-glow-one" /><div className="auth-visual-glow auth-glow-two" />
        <div className="auth-brand"><Brand light /><span className="auth-brand-caption">DOCUMENT INTEGRITY PLATFORM</span></div>
        <div className="auth-visual-content">
          <div className="auth-overline"><span className="overline-mark" /> TRUST, WITH EVIDENCE</div>
          <h1>Sign with<br /><span>certainty.</span></h1>
          <p>Documents deserve more than a signature. Give every file a verifiable record of what was signed.</p>
          <div className="auth-feature-list">
            <div><span><Fingerprint size={17} /></span><div><strong>Cryptographic by design</strong><small>Proofs tied to document fingerprints.</small></div></div>
            <div><span><ShieldCheck size={17} /></span><div><strong>Built for verification</strong><small>Integrity checks beyond a visual stamp.</small></div></div>
            <div><span><LockKeyhole size={17} /></span><div><strong>Your keys stay protected</strong><small>Signing operations are handled server-side.</small></div></div>
          </div>
        </div>
        <div className="auth-visual-footer"><span>BUILT AROUND VERIFIABLE PROOFS</span><span>V1.0</span></div>
        <div className="auth-floating-proof"><div className="floating-proof-top"><span className="floating-proof-icon"><ShieldCheck size={17} /></span><span className="floating-proof-badge"><Check size={11} /> VERIFIED</span></div><div className="floating-proof-label">INTEGRITY COMMITMENT</div><div className="proof-lines"><span /><span /><span /></div><div className="floating-hash">SHA-256 · ED25519 · MERKLE</div></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-mobile-brand"><Brand /></div>
        <div className="auth-form-wrap">
          <div className="auth-form-heading"><div className="auth-heading-icon"><Sparkles size={18} /></div><div className="page-eyebrow">YOUR SECURE WORKSPACE</div><h2>{mode === 'login' ? 'Welcome back' : 'Create your Vault'}</h2><p>{mode === 'login' ? 'Sign in to access your documents and proofs.' : 'Set up an account to start signing with evidence.'}</p></div>
          <div className="auth-tabs"><button className={mode === 'login' ? 'auth-tab-active' : ''} onClick={() => switchMode('login')}>Sign in</button><button className={mode === 'register' ? 'auth-tab-active' : ''} onClick={() => switchMode('register')}>Create account</button></div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <ErrorBanner message={error} />
            {mode === 'register' ? <>
              <label className="field-label" htmlFor="register-name">Full name</label>
              <input className="text-input" id="register-name" autoComplete="name" placeholder="e.g. Akshat Rauthan" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              <label className="field-label" htmlFor="register-tag">Username</label>
              <div className="input-prefix-wrap"><span>@</span><input className="text-input" id="register-tag" autoComplete="username" placeholder="yourhandle" value={tag} onChange={(event) => { setTag(event.target.value.replace(/\s/g, '').toLowerCase()); setTagAvailability('idle'); }} onBlur={() => void checkTag()} maxLength={20} required /></div>
              <div className={`field-hint ${tagAvailability === 'available' ? 'hint-success' : tagAvailability === 'taken' ? 'hint-error' : ''}`}>{tagAvailability === 'checking' ? 'Checking availability…' : tagAvailability === 'available' ? 'That handle is available.' : tagAvailability === 'taken' ? 'That handle is already taken.' : '3–20 characters. Start with a letter; use letters, numbers or underscores.'}</div>
              <label className="field-label" htmlFor="register-email">Email address</label>
              <input className="text-input" id="register-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
            </> : <>
              <label className="field-label" htmlFor="login-identifier">Email or username</label>
              <input className="text-input" id="login-identifier" autoComplete="username" placeholder="you@example.com or handle" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
            </>}
            <label className="field-label" htmlFor="auth-password">Password</label>
            <input className="text-input" id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'Create a strong password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : 1} maxLength={128} required />
            {mode === 'register' && <div className="field-hint">Use 8–128 characters with a letter, a number, and a special character.</div>}
            {mode === 'login' && <label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Keep me signed in for longer</span></label>}
            <button className="button button-primary button-full auth-submit" disabled={busy || (mode === 'register' && tagAvailability === 'taken')} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create account'} <ArrowRight size={17} /></button>
          </form>
          <div className="auth-legal"><LockKeyhole size={13} /> Protected by secure sessions and CSRF validation.</div>
          <div className="auth-bottom-link">{mode === 'login' ? <>New to Vault? <button onClick={() => switchMode('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => switchMode('login')}>Sign in</button></>}</div>
        </div>
        <div className="auth-form-footer"><span>© Vault · Document integrity</span><Link to="/login">Privacy-first by design</Link></div>
      </section>
    </div>
  );
}
