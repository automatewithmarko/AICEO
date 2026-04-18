import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { requireFeature } from '../middleware/gate.js';

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
  if (!apiKey) return res.json({ accounts: [] });

  try {
    // Don't pass user_id — let BooSend resolve the user from the API key
    const url = new URL('/api/publishing/instagram/accounts', BOOSEND_API);
    const bsRes = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    });
    const data = await bsRes.json();
    console.log('[boosend] instagram accounts response:', bsRes.status, data);
    if (bsRes.status >= 400) return res.json({ accounts: [] });
    res.json({ accounts: data?.accounts || [] });
  } catch (err) {
    console.error('[boosend] instagram accounts error:', err.message);
    res.json({ accounts: [] });
  }
});

// ─── Publish to Instagram via BooSend ───
router.post('/api/boosend/instagram/publish', requireFeature('instagram_posting'), async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  const { caption, media_items, post_type, instagram_account_id } = req.body;

  try {
    // BooSend handles token lookup internally — just proxy the request
    const url = new URL('/api/publishing/instagram/publish', BOOSEND_API);
    const bsRes = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instagram_account_id: instagram_account_id || undefined,
        media_items: media_items || [],
        caption: caption || '',
        post_type: post_type || 'single',
      }),
    });

    const data = await bsRes.json();
    if (bsRes.status >= 400) return res.status(bsRes.status).json(data);

    // Record in AICEO's social_posts for calendar display
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
router.post('/api/boosend/instagram/schedule', requireFeature('instagram_posting'), async (req, res) => {
  const userId = req.user.id;
  const apiKey = await getBoosendKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'BooSend integration not connected' });

  const { caption, media_items, post_type, instagram_account_id, scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });

  try {
    // BooSend handles scheduling + token lookup internally
    const url = new URL('/api/publishing/instagram/schedule', BOOSEND_API);
    const bsRes = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instagram_account_id: instagram_account_id || undefined,
        media_items: media_items || [],
        caption: caption || '',
        post_type: post_type || 'single',
        scheduled_at,
      }),
    });

    const data = await bsRes.json();
    if (bsRes.status >= 400) return res.status(bsRes.status).json(data);

    // Also record in AICEO's social_posts for calendar display
    await supabase.from('social_posts').insert({
      user_id: userId,
      platform: 'instagram',
      caption: caption || '',
      status: 'scheduled',
      scheduled_at,
    });

    res.json({ ok: true, scheduled_post_id: data?.scheduled_post_id });
  } catch (err) {
    console.error('[boosend] instagram schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
