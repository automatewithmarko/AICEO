import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { getUserPlan, getPlans } from '../services/plans.js';
import { getCreditCosts } from '../services/credits.js';

const router = Router();

// ─── GET /api/billing/plan — user's current plan, features, credits ───
router.get('/api/billing/plan', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  try {
    const planInfo = await getUserPlan(userId);

    // Fetch full plan row for display_name
    let planRow = null;
    if (planInfo.plan) {
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planInfo.plan)
        .single();
      planRow = data;
    }

    // Fetch subscription for period dates
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Fetch current credit balance
    const { data: creditRow } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    res.json({
      plan: planRow ? {
        id: planRow.id,
        name: planRow.name,
        display_name: planRow.display_name,
        features: planRow.features,
        credits_per_month: planRow.credits_per_month,
        setup_fee: planRow.setup_fee,
        monthly_price_with_boost: planRow.monthly_price_with_boost,
        monthly_price_without_boost: planRow.monthly_price_without_boost,
      } : null,
      subscription: sub ? {
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
      } : null,
      credits: {
        balance: creditRow?.balance ?? 0,
      },
    });
  } catch (err) {
    console.error('[billing/plan]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/credits — current balance + recent transactions ───
router.get('/api/billing/credits', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  try {
    const [balanceRes, txRes] = await Promise.all([
      supabase
        .from('credits')
        .select('balance')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    res.json({
      balance: balanceRes.data?.balance ?? 0,
      transactions: txRes.data || [],
    });
  } catch (err) {
    console.error('[billing/credits]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/plans — all available plans (for pricing page) ───
router.get('/api/billing/plans', async (_req, res) => {
  try {
    const plans = await getPlans();
    res.json({ plans });
  } catch (err) {
    console.error('[billing/plans]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/costs — credit costs per action ───
router.get('/api/billing/costs', async (_req, res) => {
  try {
    const costs = await getCreditCosts();
    res.json({ costs });
  } catch (err) {
    console.error('[billing/costs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
