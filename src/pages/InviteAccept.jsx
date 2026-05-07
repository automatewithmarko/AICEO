import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { acceptWorkspaceInvite, setActiveWorkspaceOwner } from '../lib/api';
import LoginScreen from '../components/LoginScreen';

// Pretty status messages keyed off the backend's error strings.
const ERROR_MESSAGES = {
  invite_not_found: 'This invite link is invalid or has been revoked.',
  invite_not_pending: 'This invite has already been used or revoked.',
  invite_expired: 'This invite has expired. Ask the workspace admin to send a new one.',
  cannot_join_own_workspace: 'You can\'t accept your own invite — sign in with the invited email instead.',
};

export default function InviteAccept() {
  const { token } = useParams();
  const { user, loading, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle');  // idle | accepting | success | error
  const [error, setError] = useState(null);
  const [workspaceInfo, setWorkspaceInfo] = useState(null);
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) return;             // logged-out branch handled below
    if (acceptedRef.current) return;
    acceptedRef.current = true;

    (async () => {
      setStatus('accepting');
      try {
        const result = await acceptWorkspaceInvite(token);
        // Switch active workspace to the one we just joined, then bounce
        // to the dashboard. switchWorkspace also re-runs the auth pipeline
        // so the sidebar/permissions reflect the new role immediately.
        setActiveWorkspaceOwner(result.workspace.ownerId);
        await switchWorkspace(result.workspace.ownerId);
        setWorkspaceInfo(result.workspace);
        setStatus('success');
        setTimeout(() => navigate('/dashboard', { replace: true }), 800);
      } catch (err) {
        setStatus('error');
        setError(err.body?.error || err.message || 'accept_failed');
      }
    })();
  }, [user, loading, token, switchWorkspace, navigate]);

  // Logged-out branch: render LoginScreen inline with a banner
  // explaining why. Defaults to signup mode since most invitees won't
  // have an account yet — they can switch to "Sign In" via the link
  // beneath the form if they do. The URL stays at /invite/:token, so
  // when auth completes AuthContext flips `user` to truthy, this
  // component re-renders without the LoginScreen branch, and the
  // effect above proceeds to accept the invite automatically.
  if (!loading && !user) {
    return (
      <div>
        <div style={bannerStyle}>
          You've been invited to join a workspace. Create an account below — or sign in if you already have one — to accept the invite.
        </div>
        <LoginScreen defaultMode="signup" />
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
              Joined as <strong>{workspaceInfo?.role}</strong>. Redirecting to your dashboard…
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: 22, color: '#dc2626' }}>Couldn't accept invite</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginTop: 8 }}>
              {ERROR_MESSAGES[error] || error}
            </p>
            <button
              style={btnStyle}
              onClick={() => navigate('/dashboard', { replace: true })}
            >
              Go to dashboard
            </button>
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
