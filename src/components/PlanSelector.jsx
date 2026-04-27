import { useState } from 'react';
import { Check, Crown, Star, Sparkles, Loader2, Phone, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createCheckoutSession } from '../lib/api';
import './PlanSelector.css';

const PLANS = [
  {
    id: 'complete',
    name: 'The Complete Platform',
    setup: 1997,
    monthlyStandard: 99,
    monthlyBoost: 199,
    credits: 500,
    recommended: false,
    features: [
      'CRM with AI enrichment',
      'Content creation (all platforms)',
      'Marketing & newsletter builder',
      'Landing pages & squeeze pages',
      'Content calendar',
      'Meeting recorder & transcription',
      'Forms builder',
      'Sales tracking',
      'Outlier detector',
      'Bookkeeping & invoicing',
    ],
  },
  {
    id: 'diamond',
    name: 'Run Your Business From One Platform',
    badge: 'Diamond',
    setup: 2997,
    monthlyStandard: 99,
    monthlyBoost: 199,
    credits: 600,
    recommended: true,
    features: [
      'Everything in Complete, plus:',
      'AI CEO unified chat',
      'PR placement',
      'Reviews vault',
      'Instagram stories generation',
      'LinkedIn posting',
      'Instagram posting',
      'Lead magnets',
      'Call intelligence (advanced)',
      'Priority support',
    ],
  },
  // Internal QA plan — only rendered when VITE_SHOW_TEST_PLAN=true so a
  // real end-user on production never sees this card. Set the env var
  // on the dev Netlify site when QAing, leave unset in prod.
  ...(import.meta.env.VITE_SHOW_TEST_PLAN === 'true'
    ? [{
      id: 'test',
      name: '🧪 Test Plan (Internal QA)',
      setup: 2,
      monthlyStandard: 1,
      monthlyBoost: 1,
      credits: 10,
      recommended: false,
      testOnly: true,
      features: [
        'For team testing only — DO NOT BUY',
        'Validates the full Stripe checkout flow',
        'Charges your card $1/mo + $2 setup',
        'Refundable from the Stripe dashboard',
      ],
    }]
    : []),
];

/* ── Self-serve flow (unchanged) ── */
function SelfServeFlow() {
  const [boost, setBoost] = useState(false);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState('');

  const handleGetStarted = async (planId) => {
    setError('');
    setActing(planId);
    try {
      const { url } = await createCheckoutSession({ plan: planId, boost });
      if (url) {
        window.location.assign(url);
      } else {
        setError('Could not start checkout. Please try again.');
        setActing(null);
      }
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setActing(null);
    }
  };

  return (
    <>
      <div className="plan-selector-header">
        <img src="/favicon.png" alt="AICEO" className="plan-selector-logo" />
        <h1 className="plan-selector-title">Choose Your Plan</h1>
        <p className="plan-selector-subtitle">
          Select the plan that fits your business. You can switch any time after checkout.
        </p>

        <div className="plan-selector-toggle">
          <button
            type="button"
            className={`plan-selector-toggle-tab ${!boost ? 'plan-selector-toggle-tab--active' : ''}`}
            onClick={() => setBoost(false)}
          >
            Standard
          </button>
          <button
            type="button"
            className={`plan-selector-toggle-tab ${boost ? 'plan-selector-toggle-tab--active' : ''}`}
            onClick={() => setBoost(true)}
          >
            <Sparkles size={13} /> With Boost
          </button>
        </div>
      </div>

      {error && <div className="plan-selector-error">{error}</div>}

      <div className={`plan-selector-cards ${PLANS.length >= 3 ? 'plan-selector-cards--three' : ''}`}>
        {PLANS.map((plan) => {
          const monthly = boost ? plan.monthlyBoost : plan.monthlyStandard;
          const busy = acting === plan.id;
          return (
            <div
              key={plan.id}
              className={`plan-card ${plan.recommended ? 'plan-card--recommended' : ''} ${plan.testOnly ? 'plan-card--test' : ''}`}
            >
              {plan.recommended && (
                <div className="plan-card-badge">
                  <Crown size={12} />
                  <span>Recommended</span>
                </div>
              )}

              <div className="plan-card-header">
                <h2 className="plan-card-name">{plan.name}</h2>
                {plan.badge && (
                  <span className="plan-card-tier">
                    <Star size={12} />
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="plan-card-pricing">
                <div className="plan-card-setup">
                  <span className="plan-card-dollar">$</span>
                  <span className="plan-card-amount">{plan.setup.toLocaleString()}</span>
                  <span className="plan-card-label">setup</span>
                </div>
                <div className="plan-card-monthly">
                  + ${monthly}/mo
                  {boost && <span className="plan-card-boost-tag"> · Boost</span>}
                </div>
              </div>

              <div className="plan-card-credits">
                <span className="plan-card-credits-number">{plan.credits}</span>
                <span className="plan-card-credits-label">credits / month</span>
              </div>

              <ul className="plan-card-features">
                {plan.features.map((feat, i) => (
                  <li key={i} className="plan-card-feature">
                    {i === 0 && plan.id === 'diamond' ? (
                      <span className="plan-card-feature-highlight">{feat}</span>
                    ) : (
                      <>
                        <Check size={14} className="plan-card-check" />
                        <span>{feat}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <button
                className={`plan-card-cta ${plan.recommended ? 'plan-card-cta--primary' : ''}`}
                onClick={() => handleGetStarted(plan.id)}
                disabled={busy || !!acting}
              >
                {busy ? (
                  <><Loader2 size={14} className="plan-selector-spinner" /> Starting checkout…</>
                ) : (
                  'Get Started'
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="plan-selector-footnote">
        Need a custom setup or coached onboarding?{' '}
        <a href="mailto:support@aiceo.com?subject=Coached%20Onboarding%20Request">
          Talk to our team
        </a>
      </p>
    </>
  );
}

/* ── Coached multi-step flow ── */
function CoachedFlow() {
  const [step, setStep] = useState(1); // 1 = pick plan, 2 = book call, 3 = pick monthly
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [boost, setBoost] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  // Only show the real plans (no test plan in coached flow)
  const realPlans = PLANS.filter((p) => !p.testOnly);

  const handleCheckout = async () => {
    if (!selectedPlan) return;
    setError('');
    setActing(true);
    try {
      const { url } = await createCheckoutSession({ plan: selectedPlan, boost });
      if (url) {
        window.location.assign(url);
      } else {
        setError('Could not start checkout. Please try again.');
        setActing(false);
      }
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setActing(false);
    }
  };

  return (
    <>
      {/* Step indicator */}
      <div className="coached-steps">
        <div className={`coached-step ${step >= 1 ? 'coached-step--active' : ''} ${step > 1 ? 'coached-step--done' : ''}`}>
          <span className="coached-step-num">1</span>
          <span className="coached-step-label">Choose Plan</span>
        </div>
        <div className="coached-step-line" />
        <div className={`coached-step ${step >= 2 ? 'coached-step--active' : ''} ${step > 2 ? 'coached-step--done' : ''}`}>
          <span className="coached-step-num">2</span>
          <span className="coached-step-label">Book Call</span>
        </div>
        <div className="coached-step-line" />
        <div className={`coached-step ${step >= 3 ? 'coached-step--active' : ''}`}>
          <span className="coached-step-num">3</span>
          <span className="coached-step-label">Monthly Plan</span>
        </div>
      </div>

      {error && <div className="plan-selector-error">{error}</div>}

      {/* Step 1: Choose high-ticket plan */}
      {step === 1 && (
        <>
          <div className="plan-selector-header">
            <h1 className="plan-selector-title">Choose Your Plan</h1>
            <p className="plan-selector-subtitle">
              Select the platform tier that fits your business. Your private 1-on-1 setup call is included.
            </p>
          </div>

          <div className="plan-selector-cards">
            {realPlans.map((plan) => (
              <div
                key={plan.id}
                className={`plan-card ${plan.recommended ? 'plan-card--recommended' : ''} ${selectedPlan === plan.id ? 'plan-card--selected' : ''}`}
                onClick={() => setSelectedPlan(plan.id)}
                style={{ cursor: 'pointer' }}
              >
                {plan.recommended && (
                  <div className="plan-card-badge">
                    <Crown size={12} />
                    <span>Recommended</span>
                  </div>
                )}

                <div className="plan-card-header">
                  <h2 className="plan-card-name">{plan.name}</h2>
                  {plan.badge && (
                    <span className="plan-card-tier">
                      <Star size={12} />
                      {plan.badge}
                    </span>
                  )}
                </div>

                <div className="plan-card-pricing">
                  <div className="plan-card-setup">
                    <span className="plan-card-dollar">$</span>
                    <span className="plan-card-amount">{plan.setup.toLocaleString()}</span>
                    <span className="plan-card-label">one-time setup</span>
                  </div>
                </div>

                <div className="plan-card-credits">
                  <span className="plan-card-credits-number">{plan.credits}</span>
                  <span className="plan-card-credits-label">credits / month</span>
                </div>

                <ul className="plan-card-features">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="plan-card-feature">
                      {i === 0 && plan.id === 'diamond' ? (
                        <span className="plan-card-feature-highlight">{feat}</span>
                      ) : (
                        <>
                          <Check size={14} className="plan-card-check" />
                          <span>{feat}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                <button
                  className={`plan-card-cta ${plan.recommended || selectedPlan === plan.id ? 'plan-card-cta--primary' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlan(plan.id);
                    setStep(2);
                  }}
                >
                  Select Plan <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Step 2: Book a call */}
      {step === 2 && (
        <>
          <div className="plan-selector-header">
            <h1 className="plan-selector-title">Book Your Setup Call</h1>
            <p className="plan-selector-subtitle">
              You're getting a private 1-on-1 call with Marko or Danny to set up your AI CEO for maximum revenue.
            </p>
          </div>

          <div className="coached-book-card">
            <div className="coached-book-icon">
              <Phone size={32} />
            </div>
            <h2 className="coached-book-title">Private 1-on-1 Setup Call</h2>
            <p className="coached-book-text">
              Our team will reach out within 24 hours to schedule your private setup call.
              During the call, we'll configure your AI CEO specifically for your business and
              walk you through a revenue-maximizing strategy.
            </p>
            <ul className="coached-book-includes">
              <li><Check size={14} /> Custom AI CEO configuration for your business</li>
              <li><Check size={14} /> Revenue-maximizing strategy session</li>
              <li><Check size={14} /> Priority ongoing support</li>
            </ul>

            <div className="coached-book-actions">
              <button className="coached-back-btn" onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Back
              </button>
              <button className="btn-primary coached-next-btn" onClick={() => setStep(3)}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Step 3: Choose monthly tier */}
      {step === 3 && (
        <>
          <div className="plan-selector-header">
            <h1 className="plan-selector-title">Choose Your Monthly Plan</h1>
            <p className="plan-selector-subtitle">
              Select Standard or Boost for your monthly subscription.
            </p>
          </div>

          <div className="coached-monthly-cards">
            <div
              className={`coached-monthly-card ${!boost ? 'coached-monthly-card--selected' : ''}`}
              onClick={() => setBoost(false)}
            >
              <h3 className="coached-monthly-name">Standard</h3>
              <div className="coached-monthly-price">
                <span className="coached-monthly-dollar">$</span>
                <span className="coached-monthly-amount">99</span>
                <span className="coached-monthly-period">/mo</span>
              </div>
              <p className="coached-monthly-desc">Everything you need to run your business with AI</p>
            </div>

            <div
              className={`coached-monthly-card ${boost ? 'coached-monthly-card--selected' : ''}`}
              onClick={() => setBoost(true)}
            >
              <div className="coached-monthly-badge"><Sparkles size={12} /> Boost</div>
              <h3 className="coached-monthly-name">With Boost</h3>
              <div className="coached-monthly-price">
                <span className="coached-monthly-dollar">$</span>
                <span className="coached-monthly-amount">199</span>
                <span className="coached-monthly-period">/mo</span>
              </div>
              <p className="coached-monthly-desc">Enhanced capabilities and faster generation across all features</p>
            </div>
          </div>

          <div className="coached-checkout-summary">
            <div className="coached-summary-row">
              <span>Setup fee ({realPlans.find((p) => p.id === selectedPlan)?.name})</span>
              <span>${realPlans.find((p) => p.id === selectedPlan)?.setup.toLocaleString()}</span>
            </div>
            <div className="coached-summary-row">
              <span>Monthly ({boost ? 'Boost' : 'Standard'})</span>
              <span>${boost ? '199' : '99'}/mo</span>
            </div>
            <div className="coached-summary-row coached-summary-row--includes">
              <span><Phone size={13} /> Private setup call included</span>
            </div>
          </div>

          <div className="coached-book-actions">
            <button className="coached-back-btn" onClick={() => setStep(2)}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="btn-primary coached-next-btn"
              onClick={handleCheckout}
              disabled={acting}
            >
              {acting ? (
                <><Loader2 size={14} className="plan-selector-spinner" /> Starting checkout…</>
              ) : (
                <>Complete Purchase <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default function PlanSelector() {
  const { user } = useAuth();
  const isCoached = user?.onboardingType === 'coached';

  return (
    <div className="plan-selector-backdrop">
      <div className="plan-selector-container">
        {isCoached ? <CoachedFlow /> : <SelfServeFlow />}
      </div>
    </div>
  );
}
