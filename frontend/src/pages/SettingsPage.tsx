import { useState, type FormEvent } from 'react';
import { CheckCircle2, LockKeyhole, Save, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { ErrorBanner, SuccessBanner } from '../components/Feedback';
import { PageHeader } from '../components/AppShell';
import { formatDate } from '../lib/format';

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setSavingProfile(true); setProfileError(''); setProfileSuccess('');
    try {
      const result = await api.users.updateName(name.trim());
      updateUser(result.user); setProfileSuccess('Profile updated successfully.');
    } catch (err) { setProfileError(err instanceof Error ? err.message : 'Could not update profile.'); }
    finally { setSavingProfile(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordError(''); setPasswordSuccess('');
    if (newPassword !== confirmPassword) { setPasswordError('The new password and confirmation do not match.'); return; }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword) || newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError('Use 8–128 characters with a letter, a number, and a special character.'); return;
    }
    setSavingPassword(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordSuccess('Password changed. Other active sessions have been signed out.');
    } catch (err) { setPasswordError(err instanceof Error ? err.message : 'Could not change password.'); }
    finally { setSavingPassword(false); }
  }

  return <>
    <PageHeader eyebrow="PREFERENCES" title="Account settings" description="Update your profile and manage your account credentials." />
    <div className="settings-layout">
      <section className="panel settings-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><UserRound size={14} /> PROFILE</div><h2>Personal details</h2><p>This name appears in your account and document signing records.</p></div></div><ErrorBanner message={profileError} /><SuccessBanner message={profileSuccess} /><form className="settings-form" onSubmit={saveProfile}><label className="field-label" htmlFor="settings-name">Display name</label><input className="text-input" id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /><div className="settings-readonly-grid"><div><span>Email address</span><strong>{user?.email}</strong><small>Email change isn't available in V1.</small></div><div><span>Username</span><strong>@{user?.tag}</strong><small>Username is immutable.</small></div><div><span>Member since</span><strong>{formatDate(user?.createdAt)}</strong><small>Vault account creation date.</small></div></div><button className="button button-primary" type="submit" disabled={savingProfile || name.trim() === user?.name || !name.trim()}><Save size={16} /> {savingProfile ? 'Saving…' : 'Save profile'}</button></form></section>
      <section className="panel settings-panel"><div className="panel-heading panel-heading-compact"><div><div className="section-kicker"><LockKeyhole size={14} /> PASSWORD</div><h2>Change password</h2><p>You'll need your current password. Other active sessions are terminated.</p></div></div><ErrorBanner message={passwordError} /><SuccessBanner message={passwordSuccess} /><form className="settings-form" onSubmit={changePassword}><label className="field-label" htmlFor="current-password">Current password</label><input className="text-input" id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><label className="field-label" htmlFor="new-password">New password</label><input className="text-input" id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required /><div className="field-hint">8–128 characters with a letter, a number, and a special character.</div><label className="field-label" htmlFor="confirm-password">Confirm new password</label><input className="text-input" id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} required /><button className="button button-primary" type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}><CheckCircle2 size={16} /> {savingPassword ? 'Updating password…' : 'Update password'}</button></form></section>
    </div>
    <div className="settings-security-note"><LockKeyhole size={17} /><div><strong>Security controls are server-enforced.</strong><p>Vault uses signed HTTP-only session cookies, CSRF validation on state-changing requests, and password reauthentication for signing and key operations.</p></div></div>
  </>;
}
