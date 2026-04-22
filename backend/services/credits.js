import { supabase } from './storage.js';

/**
 * Check if a user has enough credits for a given action.
 * @param {string} userId
 * @param {string} action - e.g. 'image_generation', 'text_post'
 * @returns {{ hasEnough: boolean, balance: number, cost: number }}
 */
export async function hasCredits(userId, action) {
  // Look up the cost for this action
  const { data: costRow, error: costErr } = await supabase
    .from('credit_costs')
    .select('cost')
    .eq('action', action)
    .single();

  if (costErr || !costRow) {
    throw new Error(`Unknown credit action: ${action}`);
  }

  const cost = costRow.cost;

  // Get user's current balance (or 0 if no row exists)
  const { data: creditRow } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  const balance = creditRow?.balance ?? 0;

  return { hasEnough: balance >= cost, balance, cost };
}

/**
 * Deduct credits for an action and log the transaction.
 * Throws if insufficient balance.
 * @param {string} userId
 * @param {string} action
 * @param {string|null} referenceId - optional UUID linking to the generated artifact
 * @returns {{ success: boolean, newBalance: number, cost: number }}
 */
export async function deductCredits(userId, action, referenceId = null) {
  const { hasEnough, balance, cost } = await hasCredits(userId, action);

  if (!hasEnough) {
    const err = new Error(`Insufficient credits: need ${cost}, have ${balance}`);
    err.code = 'INSUFFICIENT_CREDITS';
    err.balance = balance;
    err.cost = cost;
    throw err;
  }

  const newBalance = balance - cost;

  // Update balance — use a conditional update to prevent races that could go negative
  const { data: updated, error: updateErr } = await supabase
    .from('credits')
    .update({ balance: newBalance })
    .eq('user_id', userId)
    .gte('balance', cost)
    .select('balance')
    .single();

  if (updateErr || !updated) {
    throw new Error('Credit deduction failed — possible race condition');
  }

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -cost,
    reason: action,
    reference_id: referenceId || null,
  });

  console.log(`[credits] Deducted ${cost} from user ${userId} for ${action}. New balance: ${updated.balance}`);

  return { success: true, newBalance: updated.balance, cost };
}

/**
 * Add credits to a user's balance (monthly refill, purchases, etc.)
 * Creates the credits row if it doesn't exist yet.
 *
 * If a `stripe_event_id` is passed AND a credit_transactions row already
 * exists with that event id, this is a retry — we skip and return the
 * current balance. This is the last-line defense against double-credit
 * bugs when the outer stripe_events dedupe misses (e.g. on first-ever
 * event before the table row exists).
 *
 * @param {string} userId
 * @param {number} amount - positive integer
 * @param {string} reason - e.g. 'monthly_refill', 'purchase', 'bonus'
 * @param {object} [opts]
 * @param {string} [opts.stripe_event_id] - ties this credit to a Stripe event
 */
export async function addCredits(userId, amount, reason, opts = {}) {
  if (amount <= 0) throw new Error('Amount must be positive');

  // Idempotency guard: same Stripe event should never credit twice.
  if (opts.stripe_event_id) {
    const { data: dupe } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('stripe_event_id', opts.stripe_event_id)
      .maybeSingle();
    if (dupe) {
      const { data: row } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', userId)
        .single();
      console.log(`[credits] Skipping duplicate credit for event ${opts.stripe_event_id}`);
      return { success: true, newBalance: row?.balance ?? 0, duplicate: true };
    }
  }

  // Upsert: create row with default + amount, or increment existing.
  const { data: existing } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  let newBalance = (existing?.balance || 0) + amount;

  // Rollover cap on monthly_refill only. Without this, credits grow
  // unbounded for users who don't use them — at cancellation time you'd
  // owe a large refund proportional to a balance that was never meant
  // to accumulate. Cap at 2× the user's monthly allocation so they get
  // some carry-over goodwill without it spiraling.
  if (reason === 'monthly_refill') {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    if (sub?.plan) {
      const { data: planRow } = await supabase
        .from('plans')
        .select('credits_per_month')
        .eq('id', sub.plan)
        .maybeSingle();
      const monthly = planRow?.credits_per_month;
      if (monthly && monthly > 0) {
        const cap = monthly * 2;
        if (newBalance > cap) {
          console.log(`[credits] Rollover cap hit for user ${userId}: ${newBalance} → ${cap} (plan=${sub.plan}, monthly=${monthly})`);
          newBalance = cap;
        }
      }
    }
  }

  if (existing) {
    await supabase
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('credits')
      .insert({ user_id: userId, balance: newBalance });
  }

  // Log transaction (with optional Stripe event linkage for audit trail)
  const txRow = { user_id: userId, amount, reason };
  if (opts.stripe_event_id) txRow.stripe_event_id = opts.stripe_event_id;
  await supabase.from('credit_transactions').insert(txRow);

  console.log(`[credits] Added ${amount} to user ${userId} for ${reason}. New balance: ${newBalance}`);

  return { success: true, newBalance };
}

/**
 * Get credit costs for all actions.
 * @returns {Array<{ action: string, cost: number }>}
 */
export async function getCreditCosts() {
  const { data, error } = await supabase
    .from('credit_costs')
    .select('action, cost')
    .order('action');

  if (error) throw error;
  return data || [];
}

/**
 * Refill monthly credits based on the user's plan.
 * Resets balance to the plan's credits_per_month value.
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.stripe_event_id] - for idempotency against Stripe retries
 */
export async function refillMonthlyCredits(userId, opts = {}) {
  // Look up the user's plan to get credits_per_month
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single();

  if (!sub || !['active', 'canceling'].includes(sub.status)) {
    console.log(`[credits] No active subscription for user ${userId} — skipping refill`);
    return { success: false, reason: 'no_active_subscription' };
  }

  const { data: planRow } = await supabase
    .from('plans')
    .select('credits_per_month')
    .eq('id', sub.plan)
    .single();

  if (!planRow?.credits_per_month) {
    console.warn(`[credits] refillMonthlyCredits: no credits_per_month for plan="${sub.plan}" — falling back to 500. Add the plan row.`);
  }
  const creditsToAdd = planRow?.credits_per_month || 500;

  return addCredits(userId, creditsToAdd, 'monthly_refill', opts);
}
