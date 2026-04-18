import { useState } from 'react';
import { Check, Crown, Star, X } from 'lucide-react';
import './PlanSelector.css';

const PLANS = [
  {
    id: 'complete',
    name: 'The Complete Platform',
    setup: 1999,
    monthly: '99–199',
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
    setup: 2999,
    monthly: '99–199',
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
];

export default function PlanSelector() {
  const [selected, setSelected] = useState(null); // null | 'complete' | 'diamond'
  const [showContact, setShowContact] = useState(false);

  const handleGetStarted = (planId) => {
    setSelected(planId);
    setShowContact(true);
  };

  return (
    <div className="plan-selector-backdrop">
      <div className="plan-selector-container">
        <div className="plan-selector-header">
          <img src="/favicon.png" alt="AICEO" className="plan-selector-logo" />
          <h1 className="plan-selector-title">Choose Your Plan</h1>
          <p className="plan-selector-subtitle">
            Select the plan that fits your business. You can upgrade anytime.
          </p>
        </div>

        <div className="plan-selector-cards">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${plan.recommended ? 'plan-card--recommended' : ''} ${selected === plan.id ? 'plan-card--selected' : ''}`}
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
                  + ${plan.monthly}/mo
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
              >
                Get Started
              </button>
            </div>
          ))}
        </div>

        {/* Contact modal */}
        {showContact && (
          <div className="plan-contact-overlay" onClick={() => setShowContact(false)}>
            <div className="plan-contact-modal" onClick={(e) => e.stopPropagation()}>
              <button className="plan-contact-close" onClick={() => setShowContact(false)}>
                <X size={18} />
              </button>
              <div className="plan-contact-content">
                <h3 className="plan-contact-title">
                  Get started with {selected === 'diamond' ? 'Diamond' : 'Complete'}
                </h3>
                <p className="plan-contact-text">
                  Contact us to set up your account and get started with your plan.
                </p>
                <a
                  href="mailto:support@aiceo.com?subject=Plan%20Setup%20Request"
                  className="plan-contact-email"
                >
                  support@aiceo.com
                </a>
                <p className="plan-contact-note">
                  We will get back to you within 24 hours to complete your setup.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
