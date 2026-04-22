// Shared Stripe client + Price ID map.
//
// One source of truth for:
// - The Stripe SDK instance (pinned to a known API version so `npm update`
//   never silently changes webhook parsing or API shapes).
// - The bi-directional mapping between our plan+tier and Stripe Price IDs.
//
// Env vars consulted (all optional at import time — only required at first use):
//   STRIPE_SECRET_KEY                 — required for any Stripe API call
//   STRIPE_PRICE_<PLAN>_STANDARD      — e.g. STRIPE_PRICE_COMPLETE_STANDARD
//   STRIPE_PRICE_<PLAN>_BOOST         — e.g. STRIPE_PRICE_DIAMOND_BOOST
//   STRIPE_PRICE_<PLAN>_SETUP         — one-time setup fee price (phase 2)

import Stripe from 'stripe';

const API_VERSION = '2024-10-28.acacia';

let _client = null;

/**
 * Returns a memoized, pinned Stripe client.
 * Throws with a clear message if STRIPE_SECRET_KEY is missing so callers
 * don't ship code that silently no-ops.
 */
export function stripe() {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // 10s timeout on any single Stripe API call. Stripe's webhook delivery
  // times out at 30s, so a hung call would otherwise burn the whole
  // budget while we wait. Default httpClient retries once on 5xx, so
  // worst-case is ~20s — still well under the webhook ceiling.
  _client = new Stripe(key, { apiVersion: API_VERSION, timeout: 10000, maxNetworkRetries: 1 });
  return _client;
}

/**
 * Look up the Stripe Price ID for a given plan + tier combo.
 * Returns null if no env var is configured, so callers can 400 with a
 * helpful error instead of blowing up.
 */
export function getStripePriceId(planId, { boost = false, setup = false } = {}) {
  if (!planId) return null;
  const suffix = setup ? 'SETUP' : boost ? 'BOOST' : 'STANDARD';
  const key = `STRIPE_PRICE_${String(planId).toUpperCase()}_${suffix}`;
  return process.env[key] || null;
}

/**
 * Reverse map: given a Stripe Price ID, return `{ plan, tier }` where
 * tier is 'standard' | 'boost' | 'setup'. Returns null if the Price ID
 * isn't one we know about.
 *
 * Built lazily on first call by walking process.env for STRIPE_PRICE_*
 * so adding a new plan/tier later only requires setting an env var.
 */
let _reverseMap = null;
export function priceIdToPlanTier(priceId) {
  if (!priceId) return null;
  if (!_reverseMap) {
    _reverseMap = new Map();
    for (const [key, value] of Object.entries(process.env)) {
      const m = key.match(/^STRIPE_PRICE_([A-Z0-9]+)_(STANDARD|BOOST|SETUP)$/);
      if (!m || !value) continue;
      const plan = m[1].toLowerCase();
      const tier = m[2].toLowerCase();
      _reverseMap.set(value, { plan, tier });
    }
  }
  return _reverseMap.get(priceId) || null;
}

/**
 * Clear the memoized reverse map. Test-only; not used in app code.
 */
export function _resetStripeForTests() {
  _client = null;
  _reverseMap = null;
}
