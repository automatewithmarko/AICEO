import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Zap, Calendar, Check, Receipt, ArrowUpRight, Loader2, TrendingUp, ExternalLink, Sparkles } from 'lucide-react';
import { getBillingPlan, getBillingCredits, getAvailablePlans, getCreditCosts, createCheckoutSession, createBillingPortalSession } from '../lib/api';
import './Pages.css';
import './Billing.css';

// Human-readable label for each credit action
const ACTION_LABELS = {
  ai_ceo_message: 'AI CEO chat message',
  web_research: 'Web research in chat',
  image_generation: 'One image',
  text_post: 'Text post (final)',
  call_recording: 'Call recording',
  call_intelligence: 'Call analysis (summary + actions)',
  dm_automation: 'DM sequence',
  carousel: 'Carousel (Instagram / LinkedIn)',
  lead_magnet: 'Lead magnet PDF',
  story_sequence: 'Story sequence',
  squeeze_page: 'Squeeze page',
  newsletter: 'Newsletter',
  landing_page: 'Landing page',
};

// Which actions to feature in the "credits translated into outcomes" widget
const HEADLINE_ACTIONS = ['landing_page', 'carousel', 'newsletter', 'image_generation'];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function humanReason(reason) {
  if (!reason) return '';
  if (reason === 'monthly_refill') return 'Monthly refill';
  if (reason === 'purchase') return 'Credit purchase';
  if (reason === 'bonus') return 'Bonus credits';
  if (reason === 'refund_failure') return 'Refund (failed generation)';
  return ACTION_LABELS[reason] || reason.replace(/_/g, ' ');
}

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [planData, setPlanData] = useState(null);
  const [creditData, setCreditData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [costs, setCosts] = useState([]);
  const [boost, setBoost] = useState(false);
  const [acting, setActing] = useState(null); // planId being subscribed, or 'portal'
  const [actionError, setActionError] = useState('');

  // Kick off Stripe Checkout for a plan + tier. Redirects the browser.
  const handleSubscribe = async (planId) => {
    setActionError('');
    setActing(planId);
    try {
      const { url } = await createCheckoutSession({ plan: planId, boost });
      if (url) window.location.href = url;
    } catch (err) {
      setActionError(err.message || 'Could not start checkout');
      setActing(null);
    }
  };

  // Open the Stripe Customer Portal — switch/cancel plan, update card, etc.
  const handleManage = async () => {
    setActionError('');
    setActing('portal');
    try {
      const { url } = await createBillingPortalSession();
      if (url) window.location.href = url;
    } catch (err) {
      setActionError(err.message || 'Could not open billing portal');
      setActing(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pd, cd, pl, co] = await Promise.all([
          getBillingPlan(),
          getBillingCredits(),
          getAvailablePlans(),
          getCreditCosts(),
        ]);
        if (cancelled) return;
        setPlanData(pd || null);
        setCreditData(cd || null);
        setPlans(pl?.plans || []);
        setCosts(co?.costs || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // If the user just came back from Stripe Checkout, the Stripe webhook
  // may still be in-flight when they land here. Show a confirmation
  // banner + strip the ?checkout=... params from the URL.
  const [checkoutReturn, setCheckoutReturn] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (status) {
      setCheckoutReturn(status);
      // Clean the URL so a refresh doesn't re-show the banner.
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  const currentPlan = planData?.plan || null;
  const subscription = planData?.subscription || null;
  const balance = creditData?.balance ?? planData?.credits?.balance ?? 0;
  const monthly = currentPlan?.credits_per_month || 0;
  const percentUsed = monthly > 0 ? Math.max(0, Math.min(100, 100 - (balance / monthly) * 100)) : 0;

  const costByAction = useMemo(() => {
    const map = new Map();
    for (const c of costs) map.set(c.action, c.cost);
    return map;
  }, [costs]);

  // Sort costs: free actions first, then ascending by cost
  const sortedCosts = useMemo(() => {
    return [...costs].sort((a, b) => a.cost - b.cost);
  }, [costs]);

  if (loading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Billing & Credits</h1>
        <div className="billing-loading">
          <Loader2 size={22} className="billing-spinner" /> Loading your billing info…
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Billing & Credits</h1>

      {checkoutReturn === 'success' && (
        <div className="billing-banner billing-banner--success">
          <Check size={16} />
          <span>Thanks — your subscription is being activated. Plan details refresh in a moment.</span>
        </div>
      )}
      {checkoutReturn === 'cancelled' && (
        <div className="billing-banner billing-banner--info">
          <span>Checkout cancelled. Nothing was charged.</span>
        </div>
      )}

      {/* Current plan + credits side-by-side */}
      <div className="billing-grid">
        {/* Plan card */}
        <div className="billing-card">
          <div className="billing-card-head">
            <div className="billing-card-icon billing-card-icon--plan"><CreditCard size={18} /></div>
            <div>
              <div className="billing-card-label">Current plan</div>
              <div className="billing-card-title">
                {currentPlan?.display_name || 'No active plan'}
              </div>
            </div>
            {subscription?.status && (
              <span className={`billing-status billing-status--${subscription.status === 'active' ? 'active' : 'inactive'}`}>
                {subscription.status === 'active' ? 'Active' : subscription.status}
              </span>
            )}
          </div>

          {currentPlan && (
            <div className="billing-plan-meta">
              <div className="billing-plan-row">
                <span className="billing-plan-row-label">Monthly</span>
                <span className="billing-plan-row-value">
                  ${currentPlan.monthly_price_without_boost}
                  <span className="billing-plan-row-mute"> / mo</span>
                </span>
              </div>
              {currentPlan.monthly_price_with_boost && currentPlan.monthly_price_with_boost !== currentPlan.monthly_price_without_boost && (
                <div className="billing-plan-row">
                  <span className="billing-plan-row-label">With Boost</span>
                  <span className="billing-plan-row-value">${currentPlan.monthly_price_with_boost}<span className="billing-plan-row-mute"> / mo</span></span>
                </div>
              )}
              {currentPlan.setup_fee > 0 && (
                <div className="billing-plan-row">
                  <span className="billing-plan-row-label">Setup fee</span>
                  <span className="billing-plan-row-value">${currentPlan.setup_fee.toLocaleString()}</span>
                </div>
              )}
              {subscription?.current_period_end && (
                <div className="billing-plan-row">
                  <span className="billing-plan-row-label">
                    <Calendar size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    Renews
                  </span>
                  <span className="billing-plan-row-value">{fmtDate(subscription.current_period_end)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Credits card */}
        <div className="billing-card">
          <div className="billing-card-head">
            <div className="billing-card-icon billing-card-icon--credits"><Zap size={18} /></div>
            <div>
              <div className="billing-card-label">Credits</div>
              <div className="billing-card-title billing-card-title--credits">
                {balance.toLocaleString()}
                {monthly > 0 && <span className="billing-card-title-mute"> / {monthly.toLocaleString()}</span>}
              </div>
            </div>
          </div>

          {monthly > 0 && (
            <div className="billing-progress">
              <div className="billing-progress-bar">
                <div className="billing-progress-fill" style={{ width: `${percentUsed}%` }} />
              </div>
              <div className="billing-progress-label">
                {Math.round(percentUsed)}% used this period
              </div>
            </div>
          )}

          {/* Translation: credits into outcomes */}
          {balance > 0 && costByAction.size > 0 && (
            <div className="billing-translate">
              <div className="billing-translate-head">With {balance.toLocaleString()} credits, you could make:</div>
              <ul className="billing-translate-list">
                {HEADLINE_ACTIONS.filter((a) => costByAction.has(a)).map((action) => {
                  const cost = costByAction.get(action);
                  if (!cost) return null;
                  const count = Math.floor(balance / cost);
                  return (
                    <li key={action} className="billing-translate-item">
                      <span className="billing-translate-count">≈ {count.toLocaleString()}</span>
                      <span className="billing-translate-name">{ACTION_LABELS[action] || action}</span>
                      <span className="billing-translate-cost">({cost} cr each)</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Manage billing if subscribed, else a subscribe prompt is in
              the Available Plans section below. */}
          {planData?.plan?.id && subscription?.stripe_customer_id !== null ? (
            <button
              className="billing-btn billing-btn--primary"
              onClick={handleManage}
              disabled={acting === 'portal'}
            >
              {acting === 'portal' ? <><Loader2 size={14} className="billing-spinner" /> Opening…</> : <><ExternalLink size={14} /> Manage subscription</>}
            </button>
          ) : null}
        </div>
      </div>

      {actionError && (
        <div className="billing-action-error">
          <span>{actionError}</span>
        </div>
      )}

      {/* What a credit buys */}
      <div className="billing-section">
        <div className="billing-section-head">
          <div>
            <h2 className="billing-section-title">What your credits buy</h2>
            <p className="billing-section-subtitle">Chat and research are free. You only spend credits when the AI ships a finished asset.</p>
          </div>
        </div>
        <div className="billing-costs-grid">
          {sortedCosts.map((c) => (
            <div key={c.action} className={`billing-cost-tile ${c.cost === 0 ? 'billing-cost-tile--free' : ''}`}>
              <div className="billing-cost-tile-top">
                <span className="billing-cost-tile-cost">
                  {c.cost === 0 ? 'Free' : `${c.cost} cr`}
                </span>
              </div>
              <div className="billing-cost-tile-name">
                {ACTION_LABELS[c.action] || c.action.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {creditData?.transactions?.length > 0 && (
        <div className="billing-section">
          <div className="billing-section-head">
            <div>
              <h2 className="billing-section-title">Recent activity</h2>
              <p className="billing-section-subtitle">Last {creditData.transactions.length} credit transactions on your account.</p>
            </div>
            <Receipt size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="billing-activity">
            {creditData.transactions.map((tx) => {
              const isCredit = tx.amount > 0;
              return (
                <div key={tx.id} className="billing-activity-row">
                  <div className={`billing-activity-icon billing-activity-icon--${isCredit ? 'in' : 'out'}`}>
                    {isCredit ? <ArrowUpRight size={14} style={{ transform: 'rotate(180deg)' }} /> : <ArrowUpRight size={14} />}
                  </div>
                  <div className="billing-activity-info">
                    <span className="billing-activity-reason">{humanReason(tx.reason)}</span>
                    <span className="billing-activity-date">{fmtDateTime(tx.created_at)}</span>
                  </div>
                  <span className={`billing-activity-amount billing-activity-amount--${isCredit ? 'in' : 'out'}`}>
                    {isCredit ? '+' : ''}{tx.amount.toLocaleString()} cr
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Other plans */}
      {plans.length > 0 && (
        <div className="billing-section">
          <div className="billing-section-head">
            <div>
              <h2 className="billing-section-title">Available plans</h2>
              <p className="billing-section-subtitle">Switch or upgrade any time. Changes take effect at the next billing cycle.</p>
            </div>
            <TrendingUp size={18} style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Boost toggle — flips the Stripe price each plan card uses */}
          <div className="billing-boost-toggle">
            <button
              type="button"
              className={`billing-boost-tab ${!boost ? 'billing-boost-tab--active' : ''}`}
              onClick={() => setBoost(false)}
            >
              Standard
            </button>
            <button
              type="button"
              className={`billing-boost-tab ${boost ? 'billing-boost-tab--active' : ''}`}
              onClick={() => setBoost(true)}
            >
              <Sparkles size={13} /> With Boost
            </button>
          </div>

          <div className="billing-plans-grid">
            {plans
              .slice()
              .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
              .map((p) => {
                const isCurrent = p.id === currentPlan?.id;
                const price = boost
                  ? (p.monthly_price_with_boost ?? p.monthly_price_without_boost)
                  : p.monthly_price_without_boost;
                const featureKeys = Object.entries(p.features || {})
                  .filter(([, v]) => v === true)
                  .slice(0, 6)
                  .map(([k]) => k.replace(/_/g, ' '));
                const busy = acting === p.id;
                const displayShort = p.display_name?.split(' ')[0] || p.name;
                return (
                  <div key={p.id} className={`billing-plan-card ${isCurrent ? 'billing-plan-card--current' : ''}`}>
                    <div className="billing-plan-card-head">
                      <span className="billing-plan-card-name">{p.display_name || p.name}</span>
                      {isCurrent && <span className="billing-plan-card-badge">Current</span>}
                    </div>
                    <div className="billing-plan-card-price">
                      <span className="billing-plan-card-price-amount">${price}</span>
                      <span className="billing-plan-card-price-unit">/ mo</span>
                    </div>
                    <div className="billing-plan-card-credits">
                      {p.credits_per_month?.toLocaleString()} credits / month
                    </div>
                    {p.setup_fee > 0 && (
                      <div className="billing-plan-card-setup">
                        + ${p.setup_fee.toLocaleString()} setup
                      </div>
                    )}
                    {featureKeys.length > 0 && (
                      <ul className="billing-plan-card-features">
                        {featureKeys.map((f) => (
                          <li key={f}><Check size={13} /> {f}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      className={`billing-btn ${isCurrent ? 'billing-btn--outline' : 'billing-btn--primary'} billing-plan-card-cta`}
                      onClick={() => (isCurrent ? handleManage() : handleSubscribe(p.id))}
                      disabled={busy || (isCurrent && acting === 'portal')}
                    >
                      {busy ? (
                        <><Loader2 size={14} className="billing-spinner" /> Starting…</>
                      ) : isCurrent ? (
                        <>Manage</>
                      ) : (
                        <>{currentPlan ? `Switch to ${displayShort}` : `Subscribe to ${displayShort}`}</>
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
