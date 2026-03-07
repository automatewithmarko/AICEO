import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Phone, FileText, ExternalLink, X, Copy } from 'lucide-react';
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

const MOCK_WEBHOOK_URL = 'https://api.puerlypersonal.com/webhooks/fireflies/abc123';
const MOCK_WEBHOOK_SECRET = 'whsec_k7x9Qm2pLnR4vT8wZ1yB3dF6';

export default function Dashboard() {
  const navigate = useNavigate();
  const [onboardingVisible, setOnboardingVisible] = useState(true);
  const [completedSteps, setCompletedSteps] = useState(new Set([1]));
  const [selectedNoteTaker, setSelectedNoteTaker] = useState(NOTE_TAKERS[0]);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_TRACKERS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'notetaker' or 'payment'
  const [apiKey, setApiKey] = useState('');
  const [firefliesStep, setFirefliesStep] = useState(1); // 1 = enter key, 2 = webhook info
  const [copiedField, setCopiedField] = useState(null);

  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = completedSteps.size;
  const progressPercent = (completedCount / totalSteps) * 100;

  const handleComplete = (stepId) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
  };

  const handleSkip = (stepId) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
  };

  const openNotetakerModal = () => {
    setApiKey('');
    setFirefliesStep(1);
    setCopiedField(null);
    setModalType('notetaker');
    setModalOpen(true);
  };

  const openPaymentModal = () => {
    setApiKey('');
    setCopiedField(null);
    setModalType('payment');
    setModalOpen(true);
  };

  const handleFirefliesNext = () => {
    if (!apiKey.trim()) return;
    setFirefliesStep(2);
  };

  const handleConnect = () => {
    setModalOpen(false);
    if (modalType === 'payment') handleComplete(3);
    else handleComplete(4);
    setApiKey('');
    setFirefliesStep(1);
    setModalType(null);
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

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
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
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
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
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
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
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
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleFirefliesNext}
                >
                  Next
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
                      value={MOCK_WEBHOOK_URL}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(MOCK_WEBHOOK_URL, 'url')}
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
                      value={MOCK_WEBHOOK_SECRET}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(MOCK_WEBHOOK_SECRET, 'secret')}
                    >
                      {copiedField === 'secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
