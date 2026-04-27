import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './LoginScreen.css';

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [signupStep, setSignupStep] = useState('choose'); // 'choose' | 'self-serve' | 'coached'
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
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (plan, onboardingType) => {
    setError('');
    setSubmitting(true);
    try {
      await signup(email, password, plan, name, onboardingType);
      setConfirmEmail(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetToLogin = () => {
    setMode('login');
    setSignupStep('choose');
    setEmail('');
    setPassword('');
    setName('');
    setError('');
    setConfirmEmail(false);
  };

  const resetToSignup = () => {
    setMode('signup');
    setSignupStep('choose');
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

        {mode === 'signup' && signupStep === 'choose' && (
          <>
            <h2 className="login-heading">Get Started</h2>
            <p className="login-subtext">
              Choose how you'd like to set up your AI CEO
            </p>
            <div className="signup-options">
              <button
                className="option-card"
                onClick={() => setSignupStep('self-serve')}
              >
                <div className="option-badge">Self-Serve</div>
                <h3>Set Up on Your Own</h3>
                <p>
                  Get instant access to the platform and configure your AI CEO
                  at your own pace.
                </p>
                <span className="option-cta">View Plans →</span>
              </button>
              <button
                className="option-card option-card--premium"
                onClick={() => setSignupStep('coached')}
              >
                <div className="option-badge option-badge--premium">
                  Coached Onboarding
                </div>
                <h3>Private 1-on-1 Setup</h3>
                <p>
                  Get on a private call with Marko or Danny for complete
                  guidance setting up your AI CEO for maximum revenue.
                </p>
                <span className="option-cta">Learn More →</span>
              </button>
            </div>
            <p className="login-switch">
              Already have an account?{' '}
              <button className="link-btn" onClick={resetToLogin}>
                Sign In
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && signupStep === 'self-serve' && (
          <>
            <button
              className="back-btn"
              onClick={() => setSignupStep('choose')}
            >
              ← Back
            </button>
            <h2 className="login-heading">Choose Your Plan</h2>
            <p className="login-subtext">
              Create your account, then select a plan
            </p>

            <div className="signup-fields">
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
            </div>

            {/* Account-only step. No plan choice here — once the account is
                created and the email is confirmed, PlanSelector takes over
                with the real plans + live Stripe Checkout. */}
            <button
              className="btn-primary btn-plan btn-plan--full"
              onClick={() => handleSignup(null)}
              disabled={submitting || !email || !password || !name}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
            <p className="login-subnote">
              You'll choose your plan and complete checkout right after.
            </p>
            <p className="login-switch">
              Already have an account?{' '}
              <button className="link-btn" onClick={resetToLogin}>
                Sign In
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && signupStep === 'coached' && (
          <>
            <button
              className="back-btn"
              onClick={() => setSignupStep('choose')}
            >
              ← Back
            </button>
            <h2 className="login-heading">Coached Onboarding</h2>
            <p className="login-subtext">
              Create your account, then select a plan — your private 1-on-1 setup call is included with every plan
            </p>

            <div className="signup-fields">
              <div className="form-group">
                <label htmlFor="coached-name">Full Name</label>
                <input
                  id="coached-name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="coached-email">Email</label>
                <input
                  id="coached-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="coached-password">Password</label>
                <input
                  id="coached-password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="coached-card">
              <div className="coached-details">
                <h3>Included With Your Plan</h3>
                <p>
                  Get on a private one-on-one call with either <strong>Marko</strong> or{' '}
                  <strong>Danny</strong> to get complete guidance setting up your
                  PuerlyPersonal AI CEO to generate maximum revenue for your
                  business.
                </p>
                <ul className="coached-includes">
                  <li>Private setup call with Marko or Danny</li>
                  <li>Custom AI CEO configuration for your business</li>
                  <li>Revenue-maximizing strategy session</li>
                  <li>Priority ongoing support</li>
                </ul>
              </div>
              <button
                className="btn-primary btn-coached"
                onClick={() => handleSignup(null, 'coached')}
                disabled={submitting || !email || !password || !name}
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
              <p className="login-subnote">
                You'll choose your plan and complete checkout right after.
              </p>
            </div>
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
