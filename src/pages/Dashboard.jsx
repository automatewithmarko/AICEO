import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Phone, FileText, ExternalLink, X, Copy, Loader } from 'lucide-react';
import { connectIntegration, getIntegrations, getEmailAccounts } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Pages.css';
import './Dashboard.css';

const PAYMENT_TRACKERS = [
  { id: 'stripe', name: 'Stripe', logo: '/stripe-logo.png' },
  { id: 'whop', name: 'Whop', logo: '/whop-logo.svg' },
];

const NOTE_TAKERS = [
  { id: 'fireflies', name: "Fireflies AI", logo: '/fireflies-logo.png' },
  { id: 'fathom', name: 'Fathom', logo: '/fathom-logo.png' },
];

const ONBOARDING_STEPS = [
  { id: 1, label: 'Sign up for PuerlyPersonal', completed: true },
  { id: 2, label: 'Complete Brand DNA', type: 'brand-dna' },
  { id: 3, label: 'Connect to track your payments and sales', type: 'payment' },
  { id: 4, label: 'Connect your AI notetaker to record your calls', type: 'notetaker' },
  { id: 5, label: 'Connect your social media profiles to automate content posting', type: 'action' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashLoading, setDashLoading] = useState(true);
  const [onboardingVisible, setOnboardingVisible] = useState(true);
  const [completedSteps, setCompletedSteps] = useState(new Set([1]));
  const [connectedIntegrations, setConnectedIntegrations] = useState({});
  const [selectedNoteTaker, setSelectedNoteTaker] = useState(NOTE_TAKERS[0]);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_TRACKERS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'notetaker' or 'payment'
  const [apiKey, setApiKey] = useState('');
  const [firefliesStep, setFirefliesStep] = useState(1);
  const [copiedField, setCopiedField] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [firefliesWebhook, setFirefliesWebhook] = useState({ url: '', secret: '' });

  // Load onboarding state + integration status on mount
  useEffect(() => {
    async function load() {
      const steps = new Set([1]); // signup always done

      // Load onboarding from DB
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: onboarding } = await supabase
          .from('onboarding')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (onboarding) {
          setOnboardingVisible(onboarding.is_visible);
          for (const s of (onboarding.completed_steps || [])) {
            // Map string steps to IDs
            if (s === 'signup') steps.add(1);
            if (s === 'brand-dna') steps.add(2);
            if (s === 'payment') steps.add(3);
            if (s === 'notetaker') steps.add(4);
            if (s === 'social') steps.add(5);
          }
        }

        // Check Brand DNA
        const { data: brandDnaRows } = await supabase
          .from('brand_dna')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);
        if (brandDnaRows?.length) steps.add(2);
      }

      // Check connected integrations
      const [intResult, emailResult] = await Promise.all([
        getIntegrations(),
        getEmailAccounts(),
      ]);

      const intMap = {};
      for (const int of (intResult.integrations || [])) {
        intMap[int.provider] = int;
      }
      setConnectedIntegrations(intMap);

      // Auto-mark steps based on connections
      if (intMap.stripe?.is_active || intMap.whop?.is_active) steps.add(3);
      if (intMap.fireflies?.is_active || intMap.fathom?.is_active) steps.add(4);

      setCompletedSteps(steps);
      setDashLoading(false);
    }
    load();
  }, []);

  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = completedSteps.size;
  const progressPercent = (completedCount / totalSteps) * 100;

  const handleComplete = (stepId) => {
    setCompletedSteps((prev) => {
      const next = new Set([...prev, stepId]);
      // Persist to DB
      const stepMap = { 1: 'signup', 2: 'brand-dna', 3: 'payment', 4: 'notetaker', 5: 'social' };
      const stepsArr = [...next].map(id => stepMap[id]).filter(Boolean);
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('onboarding').upsert({
            user_id: session.user.id,
            completed_steps: stepsArr,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        }
      });
      return next;
    });
  };

  const handleSkip = (stepId) => {
    handleComplete(stepId);
  };

  const openNotetakerModal = () => {
    setApiKey('');
    setFirefliesStep(1);
    setCopiedField(null);
    setConnectError(null);
    setConnecting(false);
    setFirefliesWebhook({ url: '', secret: '' });
    setModalType('notetaker');
    setModalOpen(true);
  };

  const openPaymentModal = () => {
    setApiKey('');
    setCopiedField(null);
    setConnectError(null);
    setConnecting(false);
    setModalType('payment');
    setModalOpen(true);
  };

  const handleFirefliesNext = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration('fireflies', apiKey);
      setFirefliesWebhook({
        url: result.integration.webhook_url || '',
        secret: result.integration.webhook_secret || '',
      });
      setFirefliesStep(2);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const provider = modalType === 'payment' ? selectedPayment.id : selectedNoteTaker.id;
      await connectIntegration(provider, apiKey);
      setModalOpen(false);
      if (modalType === 'payment') handleComplete(3);
      else handleComplete(4);
      setApiKey('');
      setFirefliesStep(1);
      setModalType(null);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (dashLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Dashboard</h1>
        <div className="skeleton-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 12 }} />
            <div className="skeleton" style={{ width: 80, height: 16 }} />
          </div>
          <div className="skeleton" style={{ height: 8, borderRadius: 6, marginBottom: 24 }} />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton-row">
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
              <div className="skeleton skeleton-text" style={{ marginBottom: 0 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} className="skeleton-card" style={{ flex: 1, padding: 24 }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: 60, height: 28, marginBottom: 8 }} />
              <div className="skeleton skeleton-text--short skeleton-text" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      {onboardingVisible && (
        <div className="onboarding">
          <div className="onboarding-header">
            <div className="onboarding-header-left">
              <span className="onboarding-badge">Onboarding</span>
              <span className="onboarding-progress-label">
                {completedCount}/{totalSteps} completed
              </span>
            </div>
            {completedCount === totalSteps && (
              <button
                className="onboarding-dismiss"
                onClick={() => setOnboardingVisible(false)}
              >
                Dismiss
              </button>
            )}
          </div>
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="onboarding-steps">
            {ONBOARDING_STEPS.map((step) => {
              const done = completedSteps.has(step.id);
              return (
                <div
                  key={step.id}
                  className={`onboarding-step ${done ? 'onboarding-step--done' : ''}`}
                >
                  <div className={`step-check ${done ? 'step-check--done' : ''}`}>
                    {done && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div className="step-content">
                    <span className={`step-label ${done ? 'step-label--done' : ''}`}>
                      {step.type === 'payment' ? (
                        <>Connect{' '}
                          <span className="notetaker-inline">
                            <div className="notetaker-select" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="notetaker-trigger"
                                onClick={() => setPaymentDropdownOpen(!paymentDropdownOpen)}
                              >
                                <img
                                  src={selectedPayment.logo}
                                  alt={selectedPayment.name}
                                  className="notetaker-logo-wide"
                                />
                                <ChevronDown size={14} className={`notetaker-chevron ${paymentDropdownOpen ? 'notetaker-chevron--open' : ''}`} />
                              </button>
                              {paymentDropdownOpen && (
                                <div className="notetaker-dropdown">
                                  {PAYMENT_TRACKERS.map((pt) => (
                                    <button
                                      key={pt.id}
                                      className={`notetaker-option ${selectedPayment.id === pt.id ? 'notetaker-option--selected' : ''}`}
                                      onClick={() => {
                                        setSelectedPayment(pt);
                                        setPaymentDropdownOpen(false);
                                      }}
                                    >
                                      <img src={pt.logo} alt={pt.name} className="notetaker-logo-wide" />
                                      {selectedPayment.id === pt.id && <Check size={14} />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </span>
                          {' '}to track your payments and sales
                        </>
                      ) : step.type === 'notetaker' ? (
                        <>Connect{' '}
                          <span className="notetaker-inline">
                            <div className="notetaker-select" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="notetaker-trigger"
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                              >
                                <img
                                  src={selectedNoteTaker.logo}
                                  alt={selectedNoteTaker.name}
                                  className="notetaker-logo-wide"
                                />
                                <ChevronDown size={14} className={`notetaker-chevron ${dropdownOpen ? 'notetaker-chevron--open' : ''}`} />
                              </button>
                              {dropdownOpen && (
                                <div className="notetaker-dropdown">
                                  {NOTE_TAKERS.map((nt) => (
                                    <button
                                      key={nt.id}
                                      className={`notetaker-option ${selectedNoteTaker.id === nt.id ? 'notetaker-option--selected' : ''}`}
                                      onClick={() => {
                                        setSelectedNoteTaker(nt);
                                        setDropdownOpen(false);
                                      }}
                                    >
                                      <img src={nt.logo} alt={nt.name} className="notetaker-logo-wide" />
                                      {selectedNoteTaker.id === nt.id && <Check size={14} />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </span>
                          {' '}to record your calls
                        </>
                      ) : (
                        step.label
                      )}
                    </span>
                    {!done && (
                      <div className="step-actions">
                        <button
                          className="step-btn step-btn--primary"
                          onClick={() => {
                            if (step.type === 'payment') openPaymentModal();
                            else if (step.type === 'notetaker') openNotetakerModal();
                            else if (step.type === 'brand-dna') navigate('/settings');
                            else handleComplete(step.id);
                          }}
                        >
                          Start
                          <ExternalLink size={13} />
                        </button>
                        <button
                          className="step-btn step-btn--skip"
                          onClick={() => handleSkip(step.id)}
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <Phone size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">0</span>
            <span className="stat-label">Sales Calls This Week</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FileText size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-value">0</span>
            <span className="stat-label">Posts This Week</span>
          </div>
        </div>
      </div>

      {/* Connection Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalOpen(false)}>
              <X size={18} />
            </button>

            <div className="modal-logo">
              <img src={modalType === 'payment' ? selectedPayment.logo : selectedNoteTaker.logo} alt={modalType === 'payment' ? selectedPayment.name : selectedNoteTaker.name} />
            </div>

            {/* PAYMENT: Stripe */}
            {modalType === 'payment' && selectedPayment.id === 'stripe' && (
              <>
                <p className="modal-description">Connect your Stripe account to automatically track your payments and sales in the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Stripe API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="sk_live_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {/* PAYMENT: Whop */}
            {modalType === 'payment' && selectedPayment.id === 'whop' && (
              <>
                <p className="modal-description">Connect your Whop account to automatically track your payments and sales in the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Whop API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {/* FATHOM: single step */}
            {modalType === 'notetaker' && selectedNoteTaker.id === 'fathom' && (
              <>
                <p className="modal-description">Connect your Fathom AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fathom API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {/* FIREFLIES: step 1 - enter API key */}
            {modalType === 'notetaker' && selectedNoteTaker.id === 'fireflies' && firefliesStep === 1 && (
              <>
                <p className="modal-description">Connect your Fireflies AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fireflies API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleFirefliesNext}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Next'}
                </button>
              </>
            )}

            {/* FIREFLIES: step 2 - webhook info */}
            {modalType === 'notetaker' && selectedNoteTaker.id === 'fireflies' && firefliesStep === 2 && (
              <>
                <p className="modal-instruction">Copy this into your Fireflies AI settings</p>
                <div className="modal-field">
                  <label className="modal-label">Webhook URL</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={firefliesWebhook.url}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(firefliesWebhook.url, 'url')}
                    >
                      {copiedField === 'url' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Webhook Secret</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={firefliesWebhook.secret}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(firefliesWebhook.secret, 'secret')}
                    >
                      {copiedField === 'secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={() => { handleComplete(4); setModalOpen(false); }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
