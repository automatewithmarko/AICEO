import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { addCredits } from '../services/credits.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

// ─── GET /api/admin/users — List all users with plan, credits, subscription ───
router.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    // Fetch auth users (has email) via admin API
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) throw authErr;

    const authUsers = authData?.users || [];
    if (authUsers.length === 0) return res.json({ users: [] });

    const userIds = authUsers.map(u => u.id);

    // Fetch profiles, subscriptions, credits in parallel
    const [profilesRes, subsRes, creditsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, created_at').in('id', userIds),
      supabase.from('subscriptions').select('user_id, plan, status').in('user_id', userIds),
      supabase.from('credits').select('user_id, balance').in('user_id', userIds),
    ]);

    const profilesByUser = {};
    (profilesRes.data || []).forEach(p => { profilesByUser[p.id] = p; });
    const subsByUser = {};
    (subsRes.data || []).forEach(s => { subsByUser[s.user_id] = s; });
    const creditsByUser = {};
    (creditsRes.data || []).forEach(c => { creditsByUser[c.user_id] = c; });

    const users = authUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: profilesByUser[u.id]?.full_name || '',
      avatar_url: profilesByUser[u.id]?.avatar_url || null,
      plan: subsByUser[u.id]?.plan || 'free',
      credits_balance: creditsByUser[u.id]?.balance ?? 0,
      subscription_status: subsByUser[u.id]?.status || 'none',
      created_at: profilesByUser[u.id]?.created_at || u.created_at,
    }));

    // Sort by created_at descending
    users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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

    // Get auth user for email
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
    if (authErr || !authData?.user) return res.status(404).json({ error: 'User not found' });

    const [profileRes, subRes, creditRes, txRes] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url, created_at').eq('id', userId).single(),
      supabase.from('subscriptions').select('*').eq('user_id', userId).single(),
      supabase.from('credits').select('balance').eq('user_id', userId).single(),
      supabase.from('credit_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ]);

    res.json({
      user: {
        id: userId,
        email: authData.user.email,
        name: profileRes.data?.full_name || '',
        avatar_url: profileRes.data?.avatar_url || null,
        created_at: profileRes.data?.created_at || authData.user.created_at,
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
    const { plan, mark_setup_paid, mark_meeting_booked, mark_subscription_active } = req.body;

    if (!plan) return res.status(400).json({ error: 'plan is required' });

    // "none" = remove subscription entirely so user sees plan selector
    if (plan === 'none') {
      await supabase.from('subscriptions').delete().eq('user_id', userId);
      console.log(`[admin] Removed plan for user ${userId}`);
      return res.json({ subscription: null });
    }

    const now = new Date().toISOString();

    // Determine the correct status based on which steps are marked
    let status = 'pending';
    if (mark_setup_paid) status = 'setup_paid';
    if (mark_subscription_active) status = 'active';

    const upsertData = {
      user_id: userId,
      plan,
      status,
      updated_at: now,
    };

    if (mark_setup_paid) upsertData.setup_paid_at = now;
    if (mark_meeting_booked) upsertData.meeting_booked_at = now;
    if (mark_subscription_active) upsertData.stripe_subscription_id = `admin_bypass_${Date.now()}`;

    const { data, error } = await supabase
      .from('subscriptions')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    const skipped = [mark_setup_paid && 'setup', mark_meeting_booked && 'meeting', mark_subscription_active && 'subscription'].filter(Boolean);
    console.log(`[admin] Assigned plan "${plan}" to user ${userId}${skipped.length ? ` (skipped: ${skipped.join(', ')})` : ''}`);
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

    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw authErr;

    const userId = authData.user.id;

    // Create profile row (full_name, not name/email)
    await supabase.from('profiles').insert({
      id: userId,
      full_name: name || '',
    });

    if (plan) {
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        status: 'active',
      }, { onConflict: 'user_id' });
    }

    if (credits && credits > 0) {
      await addCredits(userId, credits, 'admin_initial_grant');
    }

    console.log(`[admin] Created user ${email} (${userId})`);
    res.json({
      user: { id: userId, email, name: name || '', plan: plan || 'free', credits_balance: credits || 0 },
    });
  } catch (err) {
    console.error('[admin/users POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/admin/users/:id — Deactivate user ───
router.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const { error } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: 'canceled',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;

    console.log(`[admin] Deactivated user ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/:id DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/stats — Dashboard stats ───
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get auth users for total count and recent signups
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const allUsers = authData?.users || [];

    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentSignups = allUsers
      .filter(u => new Date(u.created_at) >= last7Days)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(u => ({ id: u.id, email: u.email, created_at: u.created_at }));

    // Get profiles for names
    const recentIds = recentSignups.map(u => u.id);
    const { data: recentProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', recentIds);
    const nameMap = {};
    (recentProfiles || []).forEach(p => { nameMap[p.id] = p.full_name; });
    recentSignups.forEach(u => { u.name = nameMap[u.id] || ''; });

    const [subsRes, creditsUsedRes] = await Promise.all([
      supabase.from('subscriptions').select('plan, status').eq('status', 'active'),
      supabase.from('credit_transactions').select('amount').lt('amount', 0).gte('created_at', startOfMonth),
    ]);

    const activeSubs = {};
    (subsRes.data || []).forEach(s => { activeSubs[s.plan] = (activeSubs[s.plan] || 0) + 1; });

    const totalCreditsUsed = (creditsUsedRes.data || []).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    res.json({
      total_users: allUsers.length,
      active_subscriptions: activeSubs,
      total_credits_used_this_month: totalCreditsUsed,
      recent_signups: recentSignups,
    });
  } catch (err) {
    console.error('[admin/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
