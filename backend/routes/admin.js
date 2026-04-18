import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { addCredits } from '../services/credits.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

// ─── GET /api/admin/users — List all users with plan, credits, subscription ───
router.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    // Fetch all profiles
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, name, avatar_url, created_at')
      .order('created_at', { ascending: false });

    if (profileErr) throw profileErr;

    if (!profiles || profiles.length === 0) {
      return res.json({ users: [] });
    }

    const userIds = profiles.map((p) => p.id);

    // Fetch subscriptions and credits in parallel
    const [subsRes, creditsRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('user_id, plan, status')
        .in('user_id', userIds),
      supabase
        .from('credits')
        .select('user_id, balance')
        .in('user_id', userIds),
    ]);

    const subsByUser = {};
    (subsRes.data || []).forEach((s) => {
      subsByUser[s.user_id] = s;
    });

    const creditsByUser = {};
    (creditsRes.data || []).forEach((c) => {
      creditsByUser[c.user_id] = c;
    });

    const users = profiles.map((p) => ({
      id: p.id,
      email: p.email,
      name: p.name,
      avatar_url: p.avatar_url,
      plan: subsByUser[p.id]?.plan || 'free',
      credits_balance: creditsByUser[p.id]?.balance ?? 0,
      subscription_status: subsByUser[p.id]?.status || 'none',
      created_at: p.created_at,
    }));

    res.json({ users });
  } catch (err) {
    console.error('[admin/users]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/users/:id — Single user detail ───
router.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const [profileRes, subRes, creditRes, txRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single(),
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single(),
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

    if (profileRes.error || !profileRes.data) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        ...profileRes.data,
        plan: subRes.data?.plan || 'free',
        subscription_status: subRes.data?.status || 'none',
        subscription: subRes.data || null,
        credits_balance: creditRes.data?.balance ?? 0,
        recent_transactions: txRes.data || [],
      },
    });
  } catch (err) {
    console.error('[admin/users/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/users/:id/plan — Assign plan to user ───
router.post('/api/admin/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { plan } = req.body;

    if (!plan) {
      return res.status(400).json({ error: 'plan is required' });
    }

    // Upsert subscription row
    const { data, error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          plan,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    console.log(`[admin] Assigned plan "${plan}" to user ${userId}`);
    res.json({ subscription: data });
  } catch (err) {
    console.error('[admin/users/:id/plan]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/users/:id/credits — Add credits to user ───
router.post('/api/admin/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { amount, reason } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const result = await addCredits(userId, amount, reason || 'admin_grant');

    console.log(`[admin] Added ${amount} credits to user ${userId} (reason: ${reason || 'admin_grant'})`);
    res.json({ success: true, newBalance: result.newBalance });
  } catch (err) {
    console.error('[admin/users/:id/credits]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/users — Create a new user ───
router.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, password, name, plan, credits } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Create auth user via Supabase Admin API
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw authErr;

    const userId = authData.user.id;

    // Create profile row
    const { error: profileErr } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email,
        name: name || '',
      });

    if (profileErr) {
      console.error('[admin/create-user] Profile insert error:', profileErr.message);
    }

    // Optionally assign plan
    if (plan) {
      await supabase
        .from('subscriptions')
        .upsert(
          {
            user_id: userId,
            plan,
            status: 'active',
          },
          { onConflict: 'user_id' }
        );
    }

    // Optionally add credits
    if (credits && credits > 0) {
      await addCredits(userId, credits, 'admin_initial_grant');
    }

    console.log(`[admin] Created user ${email} (${userId})`);
    res.json({
      user: {
        id: userId,
        email,
        name: name || '',
        plan: plan || 'free',
        credits_balance: credits || 0,
      },
    });
  } catch (err) {
    console.error('[admin/users POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/admin/users/:id — Deactivate user (cancel subscription) ───
router.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Don't delete — just cancel the subscription
    const { error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          status: 'canceled',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;

    console.log(`[admin] Deactivated user ${userId} (subscription canceled)`);
    res.json({ ok: true, message: 'User subscription canceled' });
  } catch (err) {
    console.error('[admin/users/:id DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/stats — Dashboard stats ───
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Run queries in parallel
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalUsersRes,
      subsRes,
      creditsUsedRes,
      recentSignupsRes,
    ] = await Promise.all([
      // Total users
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true }),
      // Active subscriptions by plan
      supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('status', 'active'),
      // Credits used this month (sum of negative transactions)
      supabase
        .from('credit_transactions')
        .select('amount')
        .lt('amount', 0)
        .gte('created_at', startOfMonth),
      // Recent signups (last 7 days)
      supabase
        .from('profiles')
        .select('id, email, name, created_at')
        .gte('created_at', last7Days)
        .order('created_at', { ascending: false }),
    ]);

    // Count active subscriptions by plan
    const activeSubs = {};
    (subsRes.data || []).forEach((s) => {
      activeSubs[s.plan] = (activeSubs[s.plan] || 0) + 1;
    });

    // Sum credits used
    const totalCreditsUsed = (creditsUsedRes.data || []).reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0
    );

    res.json({
      total_users: totalUsersRes.count || 0,
      active_subscriptions: activeSubs,
      total_credits_used_this_month: totalCreditsUsed,
      recent_signups: recentSignupsRes.data || [],
    });
  } catch (err) {
    console.error('[admin/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
