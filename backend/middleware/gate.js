import { hasFeature } from '../services/plans.js';
import { hasCredits, deductCredits } from '../services/credits.js';
import { supabase } from '../services/storage.js';

/**
 * Feature gate middleware.
 * Blocks the request with 403 if the user's plan doesn't include the feature.
 *
 * Usage: router.post('/api/some-route', requireFeature('dm_automation'), handler)
 *
 * @param {string} featureName
 * @returns {Function} Express middleware
 */
export function requireFeature(featureName) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId || userId === 'anonymous') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const allowed = await hasFeature(userId, featureName);
      if (!allowed) {
        return res.status(403).json({
          error: 'Feature not available on your plan',
          feature: featureName,
          upgrade: true,
        });
      }
      next();
    } catch (err) {
      console.error(`[gate/feature] Error checking feature ${featureName}:`, err.message);
      return res.status(500).json({ error: 'Failed to check feature access' });
    }
  };
}

/**
 * Credit gate middleware.
 * Checks if the user has enough credits for the action, deducts them,
 * and sets req.creditDeducted = true and req.creditCost = N on success.
 *
 * Usage: router.post('/api/generate', requireCredits('image_generation'), handler)
 *
 * @param {string} action - must match a row in credit_costs table
 * @returns {Function} Express middleware
 */
export function requireCredits(action) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId || userId === 'anonymous') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Disputed accounts are frozen until the chargeback resolves —
    // no paid actions until it's cleared. Cheap upfront query.
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('disputed')
        .eq('user_id', userId)
        .maybeSingle();
      if (sub?.disputed) {
        return res.status(402).json({
          error: 'Account is on hold pending a chargeback. Contact support@aiceo.com.',
          disputed: true,
        });
      }
    } catch { /* on read failure, fall through to normal flow */ }

    try {
      const result = await deductCredits(userId, action);
      req.creditDeducted = true;
      req.creditCost = result.cost;
      req.creditNewBalance = result.newBalance;
      next();
    } catch (err) {
      if (err.code === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({
          error: 'Insufficient credits',
          balance: err.balance,
          cost: err.cost,
          action,
        });
      }
      console.error(`[gate/credits] Error deducting credits for ${action}:`, err.message);
      return res.status(500).json({ error: 'Failed to process credits' });
    }
  };
}
