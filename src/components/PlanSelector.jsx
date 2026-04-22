import { useState } from 'react';
import { Check, Crown, Star, Sparkles, Loader2 } from 'lucide-react';
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

export default function PlanSelector() {
  const [boost, setBoost] = useState(false);
  const [acting, setActing] = useState(null); // plan id being checked out
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
    <div className="plan-selector-backdrop">
      <div className="plan-selector-container">
        <div className="plan-selector-header">
          <img src="/favicon.png" alt="AICEO" className="plan-selector-logo" />
          <h1 className="plan-selector-title">Choose Your Plan</h1>
          <p className="plan-selector-subtitle">
            Select the plan that fits your business. You can switch any time after checkout.
          </p>

          {/* Standard / Boost tier toggle */}
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
      </div>
    </div>
  );
}
