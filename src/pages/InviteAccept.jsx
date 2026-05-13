import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { acceptWorkspaceInvite, lookupWorkspaceInvite, setActiveWorkspaceOwner } from '../lib/api';
import { supabase } from '../lib/supabase';
import LoginScreen from '../components/LoginScreen';

// Pretty status messages keyed off the backend's error strings.
const ERROR_MESSAGES = {
  invite_not_found: 'This invite link is invalid or has been revoked.',
  invite_not_pending: 'This invite has already been used or revoked.',
  invite_expired: 'This invite has expired. Ask the workspace admin to send a new one.',
  cannot_join_own_workspace: 'You can\'t accept your own invite — sign in with the invited email instead.',
  email_mismatch: 'This invite was sent to a different email address. Sign in with the email the invite was addressed to.',
};

export default function InviteAccept() {
  const { token } = useParams();
  const { user, loading, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle');  // idle | accepting | success | error
  const [error, setError] = useState(null);
  const [workspaceInfo, setWorkspaceInfo] = useState(null);
  // Preview data fetched without auth — what workspace the user is being
  // invited to, role label, expiration. Lets us show a meaningful card
  // BEFORE asking the user to sign up, and short-circuit on
  // expired/revoked/used invites without making the user authenticate
  // first.
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const acceptedRef = useRef(false);

  // Fetch the invite preview on mount. No auth required.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await lookupWorkspaceInvite(token);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setPreviewError(err.body?.error || err.message || 'lookup_failed');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (loading) return;
    if (!user) return;             // logged-out branch handled below
    if (acceptedRef.current) return;
    // Don't try to accept if the preview already told us this invite is
    // dead. Saves a redundant 4xx and lets the user see the friendly
    // message immediately.
    if (preview && preview.status !== 'pending') return;
    acceptedRef.current = true;

    (async () => {
      setStatus('accepting');
      try {
        const result = await acceptWorkspaceInvite(token);
        // Switch active workspace to the one we just joined, then bounce
        // to the dashboard. switchWorkspace also re-runs the auth pipeline
        // so the sidebar/permissions reflect the new role immediately.
        await setActiveWorkspaceOwner(result.workspace.ownerId);
        await switchWorkspace(result.workspace.ownerId);
        setWorkspaceInfo(result.workspace);
        setStatus('success');
        setTimeout(() => navigate('/dashboard', { replace: true }), 800);
      } catch (err) {
        setStatus('error');
        setError(err.body?.error || err.message || 'accept_failed');
      }
    })();
  }, [user, loading, token, preview, switchWorkspace, navigate]);

  // Logged-out branch: render LoginScreen inline with a banner
  // explaining why. Defaults to signup mode since most invitees won't
  // have an account yet — they can switch to "Sign In" via the link
  // beneath the form if they do. The URL stays at /invite/:token, so
  // when auth completes AuthContext flips `user` to truthy, this
  // component re-renders without the LoginScreen branch, and the
  // effect above proceeds to accept the invite automatically.
  // Dead-invite short-circuit: show the friendly message and stop,
  // even before requiring auth. Covers expired / revoked / used /
  // 404 tokens.
  if (preview && preview.status !== 'pending') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 22, color: '#dc2626' }}>This invite isn't usable</h1>
          <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>
            {preview.status === 'expired'
              ? 'This invite has expired. Ask the workspace admin to send a new one.'
              : preview.status === 'revoked'
                ? 'This invite has been revoked.'
                : preview.status === 'accepted'
                  ? 'This invite has already been used.'
                  : 'This invite is no longer valid.'}
          </p>
          {/* Always give the user a way out — without these buttons, a
              logged-in user landing on a dead invite has no nav (page is
              rendered outside Layout, no sidebar). */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            {user && (
              <button style={btnStyle} onClick={() => navigate('/dashboard', { replace: true })}>
                Continue to dashboard
              </button>
            )}
            {user && (
              <button
                style={{ ...btnStyle, background: 'transparent', color: '#111', border: '1px solid #111' }}
                onClick={async () => { await supabase.auth.signOut(); }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (previewError) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 22, color: '#dc2626' }}>Couldn't load invite</h1>
          <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>
            {ERROR_MESSAGES[previewError] || previewError}
          </p>
        </div>
      </div>
    );
  }

  if (!loading && !user) {
    // Pass the current invite URL as the post-confirmation redirect so
    // that — when Supabase email confirmation is enabled — the link in
    // the inbox returns the user back to /invite/:token rather than
    // dropping them on the project default URL and orphaning the invite.
    const inviteUrl = typeof window !== 'undefined' ? window.location.href : null;
    const inviterName = preview?.ownerName || 'a workspace';
    const roleLabel = preview?.roleLabel || 'team member';
    return (
      <div>
        <div style={bannerStyle}>
          {preview ? (
            <>You've been invited to join <strong>{inviterName}</strong> as <strong>{roleLabel}</strong>. The email is locked to <strong>{preview.email}</strong> — create an account or sign in with that address.</>
          ) : (
            <>You've been invited to join a workspace. Create an account below — or sign in if you already have one — to accept the invite.</>
          )}
        </div>
        {/* lockedEmail prevents the broken journey where the invitee types
            the wrong email, creates a phantom account, then gets bounced
            by the backend's email-mismatch check on accept and ends up
            stuck on the OnboardingFunnel pricing page with no nav. */}
        <LoginScreen
          defaultMode="signup"
          signupRedirectTo={inviteUrl}
          lockedEmail={preview?.email || null}
        />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {status === 'idle' || status === 'accepting' ? (
          <>
            <h1 style={{ margin: 0, fontSize: 22 }}>Accepting your invite…</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>One moment.</p>
          </>
        ) : status === 'success' ? (
          <>
            <h1 style={{ margin: 0, fontSize: 22, color: '#16a34a' }}>You're in!</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>
              Joined {preview?.ownerName ? <strong>{preview.ownerName}</strong> : 'the workspace'}
              {' '}as <strong>{preview?.roleLabel || workspaceInfo?.role}</strong>. Redirecting…
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: 22, color: '#dc2626' }}>Couldn't accept invite</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>
              {ERROR_MESSAGES[error] || error}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              {/* For email_mismatch and cannot_join_own_workspace, the user
                  is logged into the WRONG account for this invite. Going
                  to /dashboard would just leave them on the OnboardingFunnel
                  in their phantom account. Offer sign-out so they can
                  retry the invite link with the correct account. */}
              {(error === 'email_mismatch' || error === 'cannot_join_own_workspace') && (
                <button
                  style={btnStyle}
                  onClick={async () => { await supabase.auth.signOut(); }}
                >
                  Sign out and try again
                </button>
              )}
              <button
                style={
                  error === 'email_mismatch' || error === 'cannot_join_own_workspace'
                    ? { ...btnStyle, background: 'transparent', color: '#111', border: '1px solid #111' }
                    : btnStyle
                }
                onClick={() => navigate('/dashboard', { replace: true })}
              >
                Continue to dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: '#fafafa',
};
const cardStyle = {
  maxWidth: 420,
  width: '100%',
  padding: '28px 28px 24px',
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: '1px solid #eee',
  textAlign: 'center',
};
const btnStyle = {
  marginTop: 18,
  padding: '10px 18px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
const bannerStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
  padding: '10px 16px',
  background: '#111',
  color: '#fff',
  textAlign: 'center',
  fontSize: 13,
};
