import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowUpRight, BadgeCheck, ChevronDown, CircleHelp, Files, Fingerprint,
  LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, UploadCloud, UserRound, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Documents', icon: Files },
  { to: '/upload', label: 'Upload & sign', icon: UploadCloud },
  { to: '/verify', label: 'Verify a file', icon: BadgeCheck },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setLoggingOut(false);
      setUserMenuOpen(false);
      window.dispatchEvent(new CustomEvent('vault:toast', {
        detail: { type: 'error', message: error instanceof Error ? error.message : 'Could not sign out.' },
      }));
    }
  }

  const initials = (user?.name || 'V').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="app-frame">
      {mobileOpen && <button aria-label="Close menu" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand-row"><Brand light /><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Upload & sign' && <span className="nav-plus">+</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">ACCOUNT</div>
        <nav className="main-nav" aria-label="Account navigation">
          <NavLink to="/security" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Fingerprint size={18} strokeWidth={1.8} /><span>Security & keys</span></NavLink>
          <NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Settings2 size={18} strokeWidth={1.8} /><span>Settings</span></NavLink>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-trust-card">
          <div className="trust-icon"><ShieldCheck size={19} /></div>
          <strong>Proof, not promises.</strong>
          <p>Every signature is tied to a verifiable integrity commitment.</p>
          <span className="trust-link">How Vault works <ArrowUpRight size={13} /></span>
        </div>
        <div className="sidebar-bottom"><span className="sidebar-status-dot" />System ready <span className="sidebar-version">V1</span></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="topbar-context"><span className="topbar-overline">VAULT WORKSPACE</span><span className="topbar-divider">/</span><span className="topbar-crumb">Documents & integrity</span></div>
          <div className="topbar-right">
            <div className="secure-pill"><span className="sidebar-status-dot" />Secure session</div>
            <div className="user-menu-wrap">
              <button className="user-menu-trigger" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
                <span className="avatar">{initials}</span><span className="user-menu-name"><strong>{user?.name || 'Vault user'}</strong><small>@{user?.tag || 'account'}</small></span><ChevronDown size={15} />
              </button>
              {userMenuOpen && <div className="user-dropdown">
                <div className="dropdown-user"><strong>{user?.name}</strong><small>{user?.email}</small></div>
                <NavLink to="/settings" onClick={() => setUserMenuOpen(false)}><UserRound size={15} /> Profile settings</NavLink>
                <NavLink to="/security" onClick={() => setUserMenuOpen(false)}><Fingerprint size={15} /> Security</NavLink>
                <button onClick={() => void handleLogout()} disabled={loggingOut}><LogOut size={15} /> {loggingOut ? 'Signing out…' : 'Sign out'}</button>
              </div>}
            </div>
          </div>
        </header>
        <main className="page-main"><Outlet /></main>
        <footer className="app-footer"><span>VAULT · DOCUMENT INTEGRITY</span><span><ShieldCheck size={13} /> Cryptographic verification, made understandable.</span></footer>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <div className="page-header"><div>{eyebrow && <div className="page-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-header-actions">{actions}</div>}</div>;
}

export function PageNotFound() {
  return <div className="center-page"><div className="empty-icon"><CircleHelp size={27} /></div><h2>That page isn't here</h2><p>The address may have changed, or this page may not exist.</p><NavLink className="button button-primary" to="/">Return to overview</NavLink></div>;
}

export function ActivityIcon() {
  return <Activity size={16} />;
}
