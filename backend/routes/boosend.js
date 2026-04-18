import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();
const BOOSEND_API = 'https://boosend-automation-api-production.up.railway.app';
const BOOSEND_API_KEY = process.env.BOOSEND_API_KEY; // Master API key for BooSend service

// Helper to get BooSend API key — uses master key from env, falls back to per-user integration key
async function getBoosendKey(userId) {
  if (BOOSEND_API_KEY) return BOOSEND_API_KEY;
  // Fallback: check if user has their own key stored
  const { data } = await supabase
    .from('integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'boosend')
    .eq('is_active', true)
    .single();
  return data?.api_key;
}

// Helper to proxy requests
async function boosendFetch(apiKey, userId, path, options = {}) {
  const url = new URL(path, BOOSEND_API);
  if (!url.searchParams.has('user_id')) url.searchParams.set('user_id', userId);

  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();
  return { status: res.status, data };
}

// ─── List all templates ───
router.get('/api/boosend/templates', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend not configured. Set BOOSEND_API_KEY or connect in Settings.' });

  try {
    const { status, data } = await boosendFetch(apiKey, userId, `/api/templates?user_id=${userId}`);
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] templates list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single template ───
router.get('/api/boosend/templates/:id', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const { status, data } = await boosendFetch(apiKey, userId, `/api/templates/${req.params.id}?user_id=${userId}`);
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] template get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Create automation from template ───
router.post('/api/boosend/templates/:id/use', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const body = { user_id: userId, ...req.body };
    const { status, data } = await boosendFetch(apiKey, userId, `/api/templates/${req.params.id}/use`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] template use error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── List user's automations ───
router.get('/api/boosend/automations', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const filter = req.query.filter || 'all';
    const { status, data } = await boosendFetch(
      apiKey, userId,
      `/api/automations?user_id=${userId}&page=${page}&limit=${limit}&filter=${filter}`
    );
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] automations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single automation with graph ───
router.get('/api/boosend/automations/:id', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const { status, data } = await boosendFetch(
      apiKey, userId,
      `/api/automations?id=${req.params.id}&user_id=${userId}`
    );
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] automation get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update automation ───
router.put('/api/boosend/automations/:id', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const body = { ...req.body, user_id: userId };
    const { status, data } = await boosendFetch(apiKey, userId, `/api/automations/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] automation update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Activate automation ───
router.post('/api/boosend/automations/:id/activate', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const { status, data } = await boosendFetch(apiKey, userId, `/api/automations/${req.params.id}/activate`, {
      method: 'POST',
    });
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] automation activate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Deactivate automation ───
router.post('/api/boosend/automations/:id/deactivate', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  try {
    const { status, data } = await boosendFetch(apiKey, userId, `/api/automations/${req.params.id}/deactivate?user_id=${userId}`);
    res.status(status).json(data);
  } catch (err) {
    console.error('[boosend] automation deactivate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get user's Instagram accounts (for publishing) ───
router.get('/api/boosend/instagram-accounts', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.json({ accounts: [] }); // Not connected, return empty

  try {
    const { status, data } = await boosendFetch(apiKey, userId, `/api/publishing/instagram/accounts?user_id=${userId}`);
    if (status >= 400) return res.json({ accounts: [] });
    res.json({ accounts: data?.accounts || [] });
  } catch (err) {
    console.error('[boosend] instagram accounts error:', err.message);
    res.json({ accounts: [] });
  }
});

// ─── Publish to Instagram via BooSend ───
router.post('/api/boosend/instagram/publish', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  const { caption, media_items, post_type, instagram_account_id } = req.body;
  if (!caption && (!media_items || media_items.length === 0)) {
    return res.status(400).json({ error: 'caption or media_items required' });
  }

  try {
    // If no account specified, get the first active one
    let accountId = instagram_account_id;
    let accessToken;

    if (!accountId) {
      const { data: accounts } = await supabase
        .from('instagram_accounts')
        .select('id, access_token')
        .eq('owner_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!accounts) return res.status(400).json({ error: 'No Instagram account connected via BooSend' });
      accountId = accounts.id;
      accessToken = accounts.access_token;
    } else {
      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('access_token')
        .eq('id', accountId)
        .eq('owner_id', userId)
        .single();

      if (!account) return res.status(400).json({ error: 'Instagram account not found' });
      accessToken = account.access_token;
    }

    // Call BooSend publishing API
    const publishBody = {
      action: 'publish',
      instagram_account_id: accountId,
      access_token: accessToken,
      media_items: media_items || [],
      caption: caption || '',
      post_type: post_type || 'single',
    };

    const { status, data } = await boosendFetch(apiKey, userId, '/api/publishing/instagram/publish', {
      method: 'POST',
      body: JSON.stringify(publishBody),
    });

    if (status >= 400) {
      return res.status(status).json(data);
    }

    // Record in social_posts
    await supabase.from('social_posts').insert({
      user_id: userId,
      platform: 'instagram',
      caption: caption || '',
      external_post_id: data?.media_id || null,
      status: 'published',
      published_at: new Date().toISOString(),
    });

    res.json({ ok: true, media_id: data?.media_id });
  } catch (err) {
    console.error('[boosend] instagram publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Schedule Instagram post via BooSend ───
router.post('/api/boosend/instagram/schedule', async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  const { caption, media_items, post_type, instagram_account_id, scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });

  try {
    let accountId = instagram_account_id;
    let accessToken;

    if (!accountId) {
      const { data: accounts } = await supabase
        .from('instagram_accounts')
        .select('id, access_token')
        .eq('owner_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!accounts) return res.status(400).json({ error: 'No Instagram account connected via BooSend' });
      accountId = accounts.id;
      accessToken = accounts.access_token;
    } else {
      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('access_token')
        .eq('id', accountId)
        .eq('owner_id', userId)
        .single();

      if (!account) return res.status(400).json({ error: 'Instagram account not found' });
      accessToken = account.access_token;
    }

    const scheduleBody = {
      action: 'schedule',
      instagram_account_id: accountId,
      access_token: accessToken,
      user_id: userId,
      media_items: media_items || [],
      caption: caption || '',
      post_type: post_type || 'single',
      scheduled_at,
    };

    const { status, data } = await boosendFetch(apiKey, userId, '/api/publishing/instagram/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleBody),
    });

    if (status >= 400) return res.status(status).json(data);

    res.json({ ok: true, scheduled_post_id: data?.scheduled_post_id });
  } catch (err) {
    console.error('[boosend] instagram schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
