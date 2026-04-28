import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { describeAuthError } from '../lib/supabase';
import './LoginScreen.css';

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      // Translate raw Supabase / network exceptions into something
      // a non-developer can act on — "TypeError: Failed to fetch"
      // becomes "Authentication service is unreachable…", credential
      // errors stay clear, etc.
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (plan) => {
    setError('');
    setSubmitting(true);
    try {
      await signup(email, password, plan, name);
      setConfirmEmail(true);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetToLogin = () => {
    setMode('login');
    setEmail('');
    setPassword('');
    setName('');
    setError('');
    setConfirmEmail(false);
  };

  const resetToSignup = () => {
    setMode('signup');
    setError('');
    setConfirmEmail(false);
  };

  if (confirmEmail) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo">
            <img src="/logo.png" alt="PuerlyPersonal" />
            <span className="login-logo-text">AI CEO</span>
          </div>
          <h2 className="login-heading">Check Your Email</h2>
          <p className="login-subtext">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
          </p>
          <button className="btn-primary" onClick={resetToLogin}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="PuerlyPersonal" />
          <span className="login-logo-text">AI CEO</span>
        </div>

        {error && <div className="login-error">{error}</div>}

        {mode === 'login' && (
          <>
            <p className="login-subtext">Sign in to your AI CEO dashboard</p>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            <p className="login-switch">
              Don't have an account?{' '}
              <button className="link-btn" onClick={resetToSignup}>
                Sign Up
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && (
          <>
            <h2 className="login-heading">Create your account</h2>
            <p className="login-subtext">
              You'll choose a plan and complete checkout right after.
            </p>

            <form
              className="signup-fields"
              onSubmit={(e) => { e.preventDefault(); handleSignup(null); }}
            >
              <div className="form-group">
                <label htmlFor="signup-name">Full Name</label>
                <input
                  id="signup-name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-email">Email</label>
                <input
                  id="signup-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn-primary btn-plan btn-plan--full"
                disabled={submitting || !email || !password || !name}
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="login-switch">
              Already have an account?{' '}
              <button className="link-btn" onClick={resetToLogin}>
                Sign In
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
