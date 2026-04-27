// 4-state onboarding overlay — shown globally by App.jsx whenever the
// user hasn't completed every step of: setup-fee → book call → monthly.
//
// State A — no setup_paid_at                     → SetupPlanPicker
// State B — setup_paid_at, no meeting_booked_at  → BookingPage
// State C — meeting_booked_at, no live monthly   → MonthlySubPicker
// State D — live monthly                         → component returns null
//
// Each state's CTA hits the matching new endpoint:
//   /api/billing/checkout/setup    /meeting/booked    /checkout/monthly
//
// Server enforces the order so a tampered client can't skip a step.

import { useEffect, useState, useMemo } from 'react';
import { Check, Crown, Star, Loader2, CalendarCheck, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getBillingPlan,
  createSetupCheckoutSession,
  createMonthlyCheckoutSession,
  confirmMeetingBooked,
} from '../lib/api';
import './OnboardingFunnel.css';

const BASE_SETUP_PLANS = [
  {
    id: 'complete',
    name: 'The Complete Platform',
    setup: 1997,
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

// Internal QA plan — only rendered when VITE_SHOW_TEST_PLAN=true so a real
// end-user on production never sees this card. Set the env var on dev /
// staging Netlify when QAing the full Stripe flow end-to-end. Linked to
// real (live-mode) $2 setup + $1/mo Stripe Prices via the
// STRIPE_PRICE_TEST_SETUP and STRIPE_PRICE_TEST_STANDARD env vars on
// the backend.
const TEST_PLAN = {
  id: 'test',
  name: 'Test Plan (Internal QA)',
  setup: 2,
  recommended: false,
  testOnly: true,
  features: [
    'For team testing only — DO NOT BUY',
    'Validates the full Stripe checkout flow',
    'Charges your card $2 setup + $1/mo',
    'Refundable from the Stripe dashboard',
  ],
};

const SETUP_PLANS = import.meta.env.VITE_SHOW_TEST_PLAN === 'true'
  ? [...BASE_SETUP_PLANS, TEST_PLAN]
  : BASE_SETUP_PLANS;

const MONTHLY_BY_PLAN = {
  complete: { label: 'The Complete Platform', monthly: 99 },
  diamond: { label: 'Diamond', monthly: 199 },
  test: { label: 'Test Plan', monthly: 1 },
};

function getCalendlyUrl(plan) {
  // One env var per plan, with a generic fallback. Empty string is treated
  // as "not configured" so we render a clear placeholder rather than load
  // about:blank into the iframe.
  const generic = import.meta.env.VITE_CALENDLY_URL || '';
  if (plan === 'diamond') return import.meta.env.VITE_CALENDLY_URL_DIAMOND || generic;
  return import.meta.env.VITE_CALENDLY_URL_COMPLETE || generic;
}

export default function OnboardingFunnel() {
  const { refreshUser, planData } = useAuth();
  // Local copy of subscription state so we can re-poll after the user
  // returns from a Stripe Checkout success URL without waiting for the
  // top-level AuthContext refresh to complete.
  const [sub, setSub] = useState(planData?.subscription || null);
  const [loadingState, setLoadingState] = useState(false);

  // Sync from AuthContext on mount + whenever it changes.
  useEffect(() => { setSub(planData?.subscription || null); }, [planData]);

  // After returning from Stripe Checkout (success URL has ?checkout=…)
  // poll the billing endpoint until the new state shows up. Webhooks
  // typically settle in 1–4 seconds.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (!status || status === 'cancelled') return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15; // 15 × 2s = 30s
    setLoadingState(true);
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const fresh = await getBillingPlan();
        if (cancelled) return;
        const freshSub = fresh?.subscription || null;
        // Settled = either setup_paid_at appeared (after setup checkout)
        // or has_active_monthly is true (after monthly checkout).
        const settled = !!freshSub?.setup_paid_at && (
          status === 'setup_success' ||
          status === 'success' ? !!freshSub.has_active_monthly : true
        );
        if (settled || attempts >= maxAttempts) {
          setSub(freshSub);
          setLoadingState(false);
          // Also refresh AuthContext so other parts of the app see the
          // new plan without a full reload.
          refreshUser?.().catch(() => {});
          // Strip the ?checkout= param so a refresh doesn't re-trigger.
          const clean = window.location.pathname;
          window.history.replaceState({}, '', clean);
          return;
        }
      } catch { /* keep polling */ }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 400);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepKey = useMemo(() => {
    if (sub?.has_active_monthly) return 'done';
    if (sub?.meeting_booked_at) return 'monthly';
    if (sub?.setup_paid_at) return 'meeting';
    return 'setup';
  }, [sub]);

  if (stepKey === 'done') return null;

  return (
    <div className="of-backdrop">
      <div className="of-stepper">
        <Stepper current={stepKey} />
        {loadingState && (
          <div className="of-banner">
            <Loader2 size={16} className="of-spinner" />
            <span>Finalising your last payment… this usually takes a few seconds.</span>
          </div>
        )}
        {stepKey === 'setup' && <SetupPlanPicker />}
        {stepKey === 'meeting' && (
          <BookingPage
            plan={sub?.plan || 'complete'}
            onBooked={(updatedSub) => setSub(updatedSub)}
          />
        )}
        {stepKey === 'monthly' && (
          <MonthlySubPicker plan={sub?.plan || 'complete'} />
        )}
      </div>
    </div>
  );
}

function Stepper({ current }) {
  const steps = [
    { key: 'setup', label: 'Setup' },
    { key: 'meeting', label: 'Book call' },
    { key: 'monthly', label: 'Subscribe' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className="of-step-row">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="of-step-item">
            <div className={`of-step-dot${done ? ' of-step-dot--done' : ''}${active ? ' of-step-dot--active' : ''}`}>
              {done ? <Check size={14} /> : <span>{i + 1}</span>}
            </div>
            <span className={`of-step-label${active ? ' of-step-label--active' : ''}`}>{s.label}</span>
            {i < steps.length - 1 && <div className={`of-step-bar${done ? ' of-step-bar--done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step A: pick a setup plan ───
function SetupPlanPicker() {
  const [acting, setActing] = useState(null);
  const [error, setError] = useState('');

  const handlePick = async (planId) => {
    setError('');
    setActing(planId);
    try {
      const { url, next_step } = await createSetupCheckoutSession({ plan: planId });
      if (url) {
        window.location.assign(url);
        return; // browser leaves
      }
      // Edge case: backend says we already paid setup. Reload the funnel
      // state so we render the next step.
      if (next_step && next_step !== 'setup') {
        window.location.reload();
        return;
      }
      setError('Could not start checkout. Please try again.');
      setActing(null);
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setActing(null);
    }
  };

  return (
    <>
      <header className="of-header">
        <img src="/favicon.png" alt="" className="of-logo" />
        <h1 className="of-title">Choose Your Plan</h1>
        <p className="of-subtitle">
          Pay the one-time setup fee to get started. Your monthly subscription begins after your onboarding call.
        </p>
      </header>

      {error && <div className="of-error">{error}</div>}

      <div className={`of-cards ${SETUP_PLANS.length >= 3 ? 'of-cards--three' : 'of-cards--two'}`}>
        {SETUP_PLANS.map((plan) => {
          const busy = acting === plan.id;
          const cardLabel = plan.id === 'diamond' ? 'Diamond'
            : plan.id === 'test' ? 'Test'
            : 'Complete';
          return (
            <div
              key={plan.id}
              className={`of-card${plan.recommended ? ' of-card--recommended' : ''}${plan.testOnly ? ' of-card--test' : ''}`}
            >
              {plan.recommended && (
                <div className="of-card-badge">
                  <Crown size={12} />
                  <span>Recommended</span>
                </div>
              )}
              {plan.testOnly && (
                <div className="of-card-badge of-card-badge--test">
                  <span>QA only</span>
                </div>
              )}

              <div className="of-card-head">
                <h2 className="of-card-name">{plan.name}</h2>
                {plan.badge && (
                  <span className="of-card-tier">
                    <Star size={12} />
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="of-card-pricing">
                <span className="of-card-dollar">$</span>
                <span className="of-card-amount">{plan.setup.toLocaleString()}</span>
                <span className="of-card-label">one-time setup</span>
              </div>

              <ul className="of-card-features">
                {plan.features.map((feat, i) => (
                  <li key={i} className="of-card-feature">
                    {i === 0 && plan.id === 'diamond' ? (
                      <span className="of-card-feature-highlight">{feat}</span>
                    ) : (
                      <>
                        <Check size={14} className="of-card-check" />
                        <span>{feat}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`of-cta ${plan.recommended ? 'of-cta--primary' : 'of-cta--secondary'}`}
                onClick={() => handlePick(plan.id)}
                disabled={busy || !!acting}
              >
                {busy ? (
                  <><Loader2 size={14} className="of-spinner" /> Starting checkout…</>
                ) : (
                  <>Continue with {cardLabel} <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Step B: Calendly inline + confirm-booked button ───
function BookingPage({ plan, onBooked }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const calendlyUrl = getCalendlyUrl(plan);

  const handleConfirm = async () => {
    setError('');
    setConfirming(true);
    try {
      const result = await confirmMeetingBooked();
      // Reload billing to advance the stepper. We optimistically pass
      // through the meeting_booked_at the server returned so the UI
      // doesn't blink back to the booking step on the next render.
      const next = await getBillingPlan();
      onBooked?.(next?.subscription || {
        ...result,
        meeting_booked_at: result?.meeting_booked_at || new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message || 'Could not confirm booking. Try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <header className="of-header">
        <CalendarCheck size={32} className="of-icon-large" />
        <h1 className="of-title">Book your onboarding call</h1>
        <p className="of-subtitle">
          Pick a time that works for you. We'll configure your AI CEO around your business on the call, then unlock the platform on your monthly subscription right after.
        </p>
      </header>

      {error && <div className="of-error">{error}</div>}

      <div className="of-calendly-frame">
        {calendlyUrl ? (
          <iframe
            title="Book your onboarding call"
            src={calendlyUrl}
            frameBorder="0"
            className="of-calendly-iframe"
          />
        ) : (
          <div className="of-calendly-placeholder">
            <Sparkles size={20} />
            <p>Booking link not configured yet.</p>
            <p className="of-calendly-placeholder-hint">
              Set <code>VITE_CALENDLY_URL</code> (or <code>VITE_CALENDLY_URL_{plan === 'diamond' ? 'DIAMOND' : 'COMPLETE'}</code>) on Netlify and reload.
            </p>
          </div>
        )}
      </div>

      <div className="of-confirm-row">
        <button
          type="button"
          className="of-cta of-cta--primary"
          onClick={handleConfirm}
          disabled={confirming}
        >
          {confirming ? (
            <><Loader2 size={14} className="of-spinner" /> Confirming…</>
          ) : (
            <>I've booked the call <ArrowRight size={14} /></>
          )}
        </button>
        <p className="of-confirm-hint">
          Click after picking a time on the calendar above.
        </p>
      </div>
    </>
  );
}

// ─── Step C: confirm + start the monthly subscription ───
function MonthlySubPicker({ plan }) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const meta = MONTHLY_BY_PLAN[plan] || MONTHLY_BY_PLAN.complete;

  const handleStart = async () => {
    setError('');
    setActing(true);
    try {
      const { url, use_portal } = await createMonthlyCheckoutSession();
      if (url) { window.location.assign(url); return; }
      if (use_portal) {
        window.location.reload(); // funnel will detect done state
        return;
      }
      setError('Could not start checkout. Please try again.');
      setActing(false);
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setActing(false);
    }
  };

  return (
    <>
      <header className="of-header">
        <h1 className="of-title">Activate your monthly subscription</h1>
        <p className="of-subtitle">
          Final step. Your {meta.label} plan unlocks the moment your subscription is active.
        </p>
      </header>

      {error && <div className="of-error">{error}</div>}

      <div className="of-cards of-cards--one">
        <div className="of-card of-card--recommended">
          <div className="of-card-badge">
            <Sparkles size={12} />
            <span>Your plan</span>
          </div>

          <div className="of-card-head">
            <h2 className="of-card-name">{meta.label}</h2>
          </div>

          <div className="of-card-pricing">
            <span className="of-card-dollar">$</span>
            <span className="of-card-amount">{meta.monthly}</span>
            <span className="of-card-label">/ month</span>
          </div>

          <ul className="of-card-features">
            <li className="of-card-feature">
              <Check size={14} className="of-card-check" />
              <span>Full platform access</span>
            </li>
            <li className="of-card-feature">
              <Check size={14} className="of-card-check" />
              <span>Monthly credit allocation</span>
            </li>
            <li className="of-card-feature">
              <Check size={14} className="of-card-check" />
              <span>Cancel anytime from the billing portal</span>
            </li>
          </ul>

          <button
            type="button"
            className="of-cta of-cta--primary"
            onClick={handleStart}
            disabled={acting}
          >
            {acting ? (
              <><Loader2 size={14} className="of-spinner" /> Starting checkout…</>
            ) : (
              <>Start subscription <ArrowRight size={14} /></>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
