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
 * @param {string} userId
 * @param {number} amount - positive integer
 * @param {string} reason - e.g. 'monthly_refill', 'purchase', 'bonus'
 */
export async function addCredits(userId, amount, reason) {
  if (amount <= 0) throw new Error('Amount must be positive');

  // Upsert: create row with default + amount, or increment existing
  const { data: existing } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  let newBalance;
  if (existing) {
    newBalance = existing.balance + amount;
    await supabase
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', userId);
  } else {
    newBalance = amount;
    await supabase
      .from('credits')
      .insert({ user_id: userId, balance: newBalance });
  }

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: amount,
    reason,
  });

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
 */
export async function refillMonthlyCredits(userId) {
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

  const creditsToAdd = planRow?.credits_per_month || 500;

  return addCredits(userId, creditsToAdd, 'monthly_refill');
}
