import React from 'react';
import { KeyRound, RefreshCw, Search, UserPlus } from 'lucide-react';
import { BrandLogo, MetricPill } from './components';
import { apiFetch } from './lib';
import type { AuthUser, GoogleStatus } from './types';

export function AuthLoadingState() {
  return (
    <div className="auth-page">
      <div className="auth-card compact">
        <BrandLogo variant="loading" />
        <RefreshCw className="spin" size={22} />
        <h1>Checking secure access</h1>
        <p>One moment while the dashboard verifies your session.</p>
      </div>
    </div>
  );
}

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed.');
      onAuthenticated(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo variant="auth" subtitle="Content Intelligence" />
        </div>
        <div>
          <h1>Sign in to continue</h1>
          <p>Access is invite-only. Ask an admin for an account if you do not have one yet.</p>
        </div>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full-width" disabled={isSubmitting}>
          <KeyRound size={16} />
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export function AcceptInviteScreen({
  token,
  onAuthenticated,
}: {
  token: string;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invite could not be accepted.');
      onAuthenticated(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invite could not be accepted.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo variant="auth" subtitle="Invite setup" />
        </div>
        <div>
          <h1>Create your dashboard login</h1>
          <p>This invite link is private. Set a password to activate your account.</p>
        </div>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <p className="form-hint">Use at least 12 characters. The dashboard will keep you logged in for 30 days.</p>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full-width" disabled={isSubmitting}>
          <KeyRound size={16} />
          {isSubmitting ? 'Activating account' : 'Activate account'}
        </button>
      </form>
    </div>
  );
}

export function InvitePanel() {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState<'viewer' | 'admin'>('viewer');
  const [inviteUrl, setInviteUrl] = React.useState('');
  const [copyText, setCopyText] = React.useState('Copy link');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setInviteUrl('');
    setCopyText('Copy link');
    try {
      const response = await apiFetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invite failed. Make sure you are signed in as an admin.');
      setInviteUrl(data.inviteUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invite failed. Make sure you are signed in as an admin.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopyText('Copied');
  }

  return (
    <form className="invite-form" onSubmit={submit}>
      <p className="panel-note">
        Create an invite link for anyone who needs dashboard access. Use admin only for people who should invite others.
      </p>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as 'viewer' | 'admin')}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {error && <div className="form-error">{error}</div>}
      <button className="secondary-button full-width" disabled={isSubmitting}>
        <UserPlus size={16} />
        {isSubmitting ? 'Creating invite' : 'Create invite link'}
      </button>
      {inviteUrl && (
        <div className="invite-result">
          <strong>Invite link</strong>
          <p>{inviteUrl}</p>
          <button type="button" className="secondary-button full-width" onClick={copyInvite}>
            {copyText}
          </button>
        </div>
      )}
    </form>
  );
}

export function GoogleSearchConsolePanel({
  status,
  isSyncing,
  onSync,
}: {
  status: GoogleStatus | null;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const latestPageSnapshot = status?.latestSnapshots?.find((snapshot) => snapshot.dimensions === 'page');
  const hasSearchConsoleData = Boolean(status?.connected || status?.imported || status?.latestSnapshots?.length);

  return (
    <div className="google-panel">
      <div className="google-panel-header">
        <div>
          <strong>Google Search Console</strong>
          <span>
            {status?.connected
              ? `${status.authenticationMode === 'service-account' ? 'Automatic service account' : 'Connected'}${status.connection?.google_email ? ` · ${status.connection.google_email}` : ''}`
              : hasSearchConsoleData
                ? 'Imported by Google Apps Script'
                : 'OAuth or Apps Script connection'}
          </span>
        </div>
        <span className={hasSearchConsoleData ? 'connection-badge connected' : 'connection-badge'}>
          {hasSearchConsoleData ? 'Connected' : status?.configured ? 'Ready' : 'Needs import'}
        </span>
      </div>
      {status?.connected && status.authenticationMode !== 'service-account' && !status.analyticsScopeReady && (
        <p className="panel-note">
          GA4 reporting needs one more Google reconnect after deploy so Analytics read-only access is approved.
        </p>
      )}

      {!status?.configured && !hasSearchConsoleData && (
        <div className="setup-box">
          <strong>Use the Apps Script import first</strong>
          <p>The dashboard is ready for Search Console rows from Google Apps Script. OAuth can be added later with this redirect URI:</p>
          <code>{status?.redirectUri || 'https://codakidblogdashboard.netlify.app/api/google/oauth/callback'}</code>
        </div>
      )}

      {status?.configured && !status.connected && (
        <a className="secondary-button full-width" href="/api/google/oauth/start">
          <Search size={16} />
          {hasSearchConsoleData ? 'Connect Google for Analytics' : 'Connect Google Search Console'}
        </a>
      )}

      {hasSearchConsoleData && (
        <>
          <div className="gsc-stats">
            <MetricPill label="GSC properties" value={status?.properties.length || 0} />
            <MetricPill label="Latest page rows" value={latestPageSnapshot?.rowCount || 0} />
          </div>
          {status?.connected ? (
            <button className="secondary-button full-width" onClick={onSync} disabled={isSyncing}>
              <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
              {isSyncing ? 'Syncing Search Console' : 'Sync Search Console now'}
            </button>
          ) : (
            <p className="panel-note">Automatic refresh is handled by the Google Apps Script daily trigger.</p>
          )}
          <div className="property-list">
            {(status?.properties || []).slice(0, 4).map((property) => (
              <article key={property.site_url}>
                <strong>{property.site_url}</strong>
                <span>
                  {property.permission_level || 'permission unknown'}
                  {property.selected ? ' · selected' : ''}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
