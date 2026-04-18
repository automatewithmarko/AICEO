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
    const plan = await getUserPlan(userId);

    // Also fetch current credit balance
    const { data: creditRow } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    res.json({
      plan: plan.plan,
      status: plan.status,
      features: plan.features,
      credits_per_month: plan.credits_per_month,
      credit_balance: creditRow?.balance ?? 0,
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
