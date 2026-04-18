import { supabase } from './storage.js';

/**
 * Get user's current plan with features and credits info.
 * @param {string} userId
 * @returns {{ plan: string|null, features: object, credits_per_month: number, status: string|null }}
 */
export async function getUserPlan(userId) {
  // Get the user's subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single();

  if (!sub || !['active', 'canceling'].includes(sub.status)) {
    return { plan: null, features: {}, credits_per_month: 0, status: sub?.status || null };
  }

  // Get the plan details
  const { data: planRow } = await supabase
    .from('plans')
    .select('id, features, credits_per_month')
    .eq('id', sub.plan)
    .single();

  if (!planRow) {
    return { plan: sub.plan, features: {}, credits_per_month: 500, status: sub.status };
  }

  return {
    plan: planRow.id,
    features: planRow.features || {},
    credits_per_month: planRow.credits_per_month,
    status: sub.status,
  };
}

/**
 * Check if a user has access to a specific feature based on their plan.
 * @param {string} userId
 * @param {string} featureName
 * @returns {boolean}
 */
export async function hasFeature(userId, featureName) {
  const { features } = await getUserPlan(userId);

  // features is a jsonb object — check for truthy value at the key
  return !!features[featureName];
}

/**
 * Get all available plans (for pricing page).
 * @returns {Array<{ id: string, features: object, credits_per_month: number }>}
 */
export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('id, features, credits_per_month');

  if (error) throw error;
  return data || [];
}
