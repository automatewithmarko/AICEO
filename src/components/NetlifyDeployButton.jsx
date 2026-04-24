import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { deployToNetlify, checkNetlifyName, getNetlifyStatus, connectIntegration } from '../lib/api';
// Share the ap-modal / ap-netlify-* styles so this component works anywhere,
// not just when ArtifactPanel is also mounted on the page.
import './ArtifactPanel.css';

/**
 * Self-contained Netlify deploy button with the same UX ArtifactPanel uses:
 *   1. Click Deploy  →  opens "Name your site" modal (debounced availability check)
 *   2. Confirm name  →  calls /api/netlify/deploy
 *   3. If 401 / not connected  →  opens Connect modal (paste token), then retries
 *   4. If name taken / invalid →  keeps name modal open with inline error
 *
 * Styles are shared with ArtifactPanel (ap-* classes, globally loaded via
 * ArtifactPanel.css). Marketing doesn't need its own CSS for this.
 *
 * Props:
 *   getHtml     — () => string  (returns current canvas HTML at click time)
 *   titleHint   — string        (used to suggest a default site name)
 *   disabled    — bool
 *   className   — string        (applied to the trigger button)
 *   label       — string        (button text, default "Deploy to Netlify")
 *   loadingLabel — string       (button text while deploying)
 *   onDeployed  — (url) => void (successful deploy)
 *   onError     — (msg) => void (non-modal errors, optional)
 */
export default function NetlifyDeployButton({
  getHtml,
  titleHint = 'my-site',
  disabled = false,
  className = '',
  label = 'Deploy to Netlify',
  loadingLabel = 'Deploying...',
  onDeployed,
  onError,
}) {
  const [deploying, setDeploying] = useState(false);

  // Connect / reconnect modal
  const [netlifyModalOpen, setNetlifyModalOpen] = useState(false);
  const [netlifyModalMode, setNetlifyModalMode] = useState('connect'); // 'connect' | 'reconnect'
  const [netlifyToken, setNetlifyToken] = useState('');
  const [netlifyConnecting, setNetlifyConnecting] = useState(false);
  const [netlifyConnectError, setNetlifyConnectError] = useState('');

  // Name-your-site modal
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [siteNameInput, setSiteNameInput] = useState('');
  const [nameCheck, setNameCheck] = useState(null); // { available, owned, reason, normalized }
  const [nameChecking, setNameChecking] = useState(false);
  const [modalError, setModalError] = useState('');
  const nameCheckTimerRef = useRef(null);

  const suggestSiteName = () => {
    const raw = (titleHint || 'my-site').toString();
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'my-site';
  };

  const openDeployFlow = async () => {
    if (deploying) return;
    const html = typeof getHtml === 'function' ? getHtml() : getHtml;
    if (!html) return;
    setModalError('');
    let initial = suggestSiteName();
    try {
      const status = await getNetlifyStatus();
      if (status?.connected && status?.last_site_name) initial = status.last_site_name;
    } catch {
      // status is optional — suggestion is fine
    }
    setSiteNameInput(initial);
    setNameCheck(null);
    setNameModalOpen(true);
  };

  // Debounced name availability check
  useEffect(() => {
    if (!nameModalOpen) return;
    const raw = siteNameInput.trim().toLowerCase();
    if (!raw) { setNameCheck(null); return; }
    if (nameCheckTimerRef.current) clearTimeout(nameCheckTimerRef.current);
    setNameChecking(true);
    nameCheckTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkNetlifyName(raw);
        setNameCheck(result);
      } finally {
        setNameChecking(false);
      }
    }, 400);
    return () => { if (nameCheckTimerRef.current) clearTimeout(nameCheckTimerRef.current); };
  }, [siteNameInput, nameModalOpen]);

  const performDeploy = async (name) => {
    if (deploying) return;
    const html = typeof getHtml === 'function' ? getHtml() : getHtml;
    if (!html) return;
    setDeploying(true);
    setModalError('');
    try {
      const result = await deployToNetlify(html, name);
      setNameModalOpen(false);
      if (onDeployed) onDeployed(result.url);
    } catch (err) {
      if (err.code === 'netlify_not_connected' || err.code === 'netlify_unauthorized') {
        setNameModalOpen(false);
        setNetlifyModalMode(err.code === 'netlify_unauthorized' ? 'reconnect' : 'connect');
        setNetlifyToken('');
        setNetlifyConnectError('');
        setNetlifyModalOpen(true);
      } else if (err.code === 'netlify_name_taken' || err.code === 'netlify_invalid_name') {
        // Keep name modal open, surface the reason inline
        setNameCheck({ available: false, reason: err.code === 'netlify_name_taken' ? 'taken' : 'invalid_chars' });
        setModalError(err.message);
      } else {
        setNameModalOpen(false);
        if (onError) onError(err.message || 'Deploy failed');
      }
    } finally {
      setDeploying(false);
    }
  };

  const handleConfirmName = () => {
    const name = siteNameInput.trim().toLowerCase();
    if (!name || (nameCheck && nameCheck.available === false)) return;
    performDeploy(name);
  };

  const handleNetlifyConnectAndDeploy = async () => {
    const token = netlifyToken.trim();
    if (!token || netlifyConnecting) return;
    setNetlifyConnecting(true);
    setNetlifyConnectError('');
    try {
      await connectIntegration('netlify', token);
      setNetlifyModalOpen(false);
      setNetlifyToken('');
      // Retry the deploy flow the user originally triggered
      await openDeployFlow();
    } catch (err) {
      setNetlifyConnectError(err.message || 'Could not validate token');
    } finally {
      setNetlifyConnecting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={openDeployFlow}
        disabled={disabled || deploying}
      >
        {deploying ? loadingLabel : label}
      </button>

      {/* ── Name Your Netlify Site Modal ── */}
      {nameModalOpen && (
        <div className="ap-modal-overlay" onClick={() => !deploying && setNameModalOpen(false)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Name your site</h3>
              <button className="ap-modal-close" onClick={() => !deploying && setNameModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-netlify-connect">
              <p className="ap-netlify-connect-desc">
                This becomes your Netlify subdomain. Pick something memorable — you can share the URL anywhere.
              </p>
              <label className="ap-netlify-label">Site name</label>
              <div className="ap-sitename-row">
                <input
                  type="text"
                  className="ap-netlify-input ap-sitename-input"
                  placeholder="my-awesome-page"
                  value={siteNameInput}
                  onChange={(e) => setSiteNameInput(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmName(); }}
                  autoFocus
                  maxLength={63}
                />
                <span className="ap-sitename-suffix">.netlify.app</span>
              </div>
              <div className="ap-sitename-status">
                {nameChecking && <span className="ap-sitename-status--checking">Checking availability…</span>}
                {!nameChecking && nameCheck && nameCheck.available && nameCheck.owned && (
                  <span className="ap-sitename-status--owned">✓ You already own this site — we'll redeploy to it.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available && !nameCheck.owned && nameCheck.reason !== 'unverified' && (
                  <span className="ap-sitename-status--ok">✓ Available</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available && nameCheck.reason === 'unverified' && (
                  <span className="ap-sitename-status--warn">Couldn't fully verify — deploy will confirm.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'taken' && (
                  <span className="ap-sitename-status--err">✗ This name is taken. Try another.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'invalid_chars' && (
                  <span className="ap-sitename-status--err">✗ Use only lowercase letters, digits, and hyphens.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'too_long' && (
                  <span className="ap-sitename-status--err">✗ Too long — keep it under 63 characters.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'empty' && (
                  <span className="ap-sitename-status--err">✗ Name can't be empty.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'unauthorized' && (
                  <span className="ap-sitename-status--err">✗ Netlify token rejected. Reconnect in Settings.</span>
                )}
              </div>
              {siteNameInput && (
                <div className="ap-sitename-preview">
                  Your URL: <strong>https://{siteNameInput}.netlify.app</strong>
                </div>
              )}
              {modalError && <div className="ap-netlify-error">{modalError}</div>}
              <div className="ap-netlify-actions">
                <button
                  className="ap-btn ap-btn--outline"
                  onClick={() => setNameModalOpen(false)}
                  disabled={deploying}
                >
                  Cancel
                </button>
                <button
                  className="ap-btn ap-btn--netlify"
                  onClick={handleConfirmName}
                  disabled={
                    !siteNameInput.trim() ||
                    deploying ||
                    nameChecking ||
                    (nameCheck && nameCheck.available === false)
                  }
                >
                  {deploying ? 'Deploying…' : 'Deploy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Connect / Reconnect Netlify Modal ── */}
      {netlifyModalOpen && (
        <div className="ap-modal-overlay" onClick={() => setNetlifyModalOpen(false)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>{netlifyModalMode === 'reconnect' ? 'Reconnect Netlify' : 'Connect Netlify to Deploy'}</h3>
              <button className="ap-modal-close" onClick={() => setNetlifyModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-netlify-connect">
              <p className="ap-netlify-connect-desc">
                {netlifyModalMode === 'reconnect'
                  ? 'Your saved Netlify token was rejected (likely expired or revoked). Paste a fresh token to deploy this page.'
                  : 'Paste your Netlify personal access token to deploy this page with one click.'}
              </p>
              <div className="ap-netlify-steps">
                <div className="ap-netlify-steps-title">How to get a token (30 seconds)</div>
                <ol className="ap-netlify-steps-list">
                  <li>
                    Open{' '}
                    <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank" rel="noopener noreferrer">
                      app.netlify.com → User settings → Applications
                    </a>
                    .
                  </li>
                  <li>Under <strong>Personal access tokens</strong>, click <strong>New access token</strong>.</li>
                  <li>Name it (e.g. <em>PurelyPersonal</em>) and click <strong>Generate token</strong>.</li>
                  <li>Copy the token and paste it below.</li>
                </ol>
              </div>
              <label className="ap-netlify-label">Personal Access Token</label>
              <input
                type="text"
                className="ap-netlify-input"
                placeholder="nfp_..."
                value={netlifyToken}
                onChange={(e) => setNetlifyToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && netlifyToken.trim()) handleNetlifyConnectAndDeploy(); }}
                autoFocus
              />
              {netlifyConnectError && <div className="ap-netlify-error">{netlifyConnectError}</div>}
              <div className="ap-netlify-actions">
                <button
                  className="ap-btn ap-btn--outline"
                  onClick={() => setNetlifyModalOpen(false)}
                  disabled={netlifyConnecting}
                >
                  Cancel
                </button>
                <button
                  className="ap-btn ap-btn--netlify"
                  onClick={handleNetlifyConnectAndDeploy}
                  disabled={!netlifyToken.trim() || netlifyConnecting}
                >
                  {netlifyConnecting ? 'Validating…' : 'Connect & Deploy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
