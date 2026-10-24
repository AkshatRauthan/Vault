import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Fingerprint, FileLock2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { DocumentProfile, ProfileAvailability, SignedProofResponse } from '../lib/types';
import { ErrorBanner, InfoBanner } from './Feedback';
import { Modal } from './Modal';

export function SignFlow({ documentId, versionId, profiles, onSigned, compact = false }: {
  documentId: string;
  versionId: string;
  profiles: Record<DocumentProfile, ProfileAvailability>;
  onSigned: (proof: SignedProofResponse) => void;
  compact?: boolean;
}) {
  const [profile, setProfile] = useState<DocumentProfile | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirmSign(event: FormEvent) {
    event.preventDefault();
    const selectedProfile = profile;
    if (!selectedProfile) { setError('Choose a signing profile first.'); return; }
    setError('');
    setBusy(true);
    try {
      await api.auth.reauth(password);
      const proof = await api.documents.sign(documentId, versionId, selectedProfile);
      setReauthOpen(false);
      setPassword('');
      onSigned(proof);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`sign-flow ${compact ? 'sign-flow-compact' : ''}`}>
        <div className="section-kicker"><Fingerprint size={15} /> SIGNING PROFILE</div>
        <div className="profile-options">
          <button type="button" className={`profile-option ${profile === 'vault-strict-v1' ? 'profile-option-active' : ''}`} onClick={() => setProfile('vault-strict-v1')}>
            <span className="profile-radio">{profile === 'vault-strict-v1' && <span />}</span>
            <span className="profile-copy"><strong>Strict integrity</strong><small>vault-strict-v1</small><small>Verifies the exact file bytes, with chunk-level differences.</small></span>
            <FileLock2 size={19} />
          </button>
          <button type="button" className={`profile-option ${profile === 'vault-pdf-text-v1' ? 'profile-option-active' : ''} ${!profiles['vault-pdf-text-v1']?.available ? 'profile-option-disabled' : ''}`} onClick={() => { if (profiles['vault-pdf-text-v1']?.available) setProfile('vault-pdf-text-v1'); }} disabled={!profiles['vault-pdf-text-v1']?.available}>
            <span className="profile-radio">{profile === 'vault-pdf-text-v1' && <span />}</span>
            <span className="profile-copy"><strong>Text evidence</strong><small>vault-pdf-text-v1</small><small>Commits to normalized extracted text, page by page.</small>{!profiles['vault-pdf-text-v1']?.available && <em>{profiles['vault-pdf-text-v1']?.reason || 'Text evidence is unavailable for this PDF.'}</em>}</span>
            <ShieldCheck size={19} />
          </button>
        </div>
        {profile === 'vault-pdf-text-v1' && <InfoBanner>Text evidence does not guarantee detection of every visual-only change, such as changes to images, colors, or vector graphics.</InfoBanner>}
        {!compact && <p className="quiet-copy">Signing requires password reauthentication. Vault will not silently downgrade the selected profile.</p>}
        <button className="button button-primary button-full" type="button" disabled={!profile} onClick={() => { setError(''); setReauthOpen(true); }}>
          {profile ? 'Sign document' : 'Choose a profile to continue'} <ArrowRight size={16} />
        </button>
      </div>
      {reauthOpen && <Modal title="Confirm your identity" description="Enter your password to authorize this signing operation." onClose={() => { if (!busy) setReauthOpen(false); }}>
        <form className="modal-form" onSubmit={confirmSign}>
          <ErrorBanner message={error} />
          <label className="field-label" htmlFor="sign-password">Vault password</label>
          <input id="sign-password" className="text-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          <div className="modal-note"><CheckCircle2 size={15} /> Your private signing key never leaves the server-side key provider.</div>
          <button className="button button-primary button-full" disabled={busy || !password} type="submit">{busy ? 'Signing securely…' : 'Reauthenticate & sign'}</button>
        </form>
      </Modal>}
    </>
  );
}
