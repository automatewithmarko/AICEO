import { Router } from 'express';
import { supabase } from '../services/storage.js';
import * as linkedinApi from '../services/linkedin-api.js';
import { requireFeature } from '../middleware/gate.js';

const BOOSEND_API = 'https://boosend-automation-api-production.up.railway.app';
const BOOSEND_API_KEY = process.env.BOOSEND_API_KEY;

const router = Router();

// ─── List calendar posts ───
router.get('/api/calendar/posts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ posts: [] });

  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data || [] });
});

// ─── Create / schedule a post ───
router.post('/api/calendar/posts', requireFeature('content_calendar'), async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { platform, caption, content_type, scheduled_at, media, status } = req.body;
  if (!platform || !caption) return res.status(400).json({ error: 'platform and caption required' });

  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      user_id: userId,
      platform,
      caption,
      content_type: content_type || null,
      scheduled_at: scheduled_at || null,
      media: media || [],
      status: status || 'draft',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ post: data });
});

// ─── Update a post ───
router.put('/api/calendar/posts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { caption, scheduled_at, media, status, content_type } = req.body;
  const updates = {};
  if (caption !== undefined) updates.caption = caption;
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
  if (media !== undefined) updates.media = media;
  if (status !== undefined) updates.status = status;
  if (content_type !== undefined) updates.content_type = content_type;

  const { data, error } = await supabase
    .from('social_posts')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ post: data });
});

// ─── Delete a post ───
router.delete('/api/calendar/posts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('social_posts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Shared: resolve BooSend API key + a working IG account ───
// BooSend owns the IG account list (there is no local `instagram_accounts`
// table — the previous lookup 500'd against a nonexistent column and every
// IG publish silently failed).
async function resolveBoosendKey(userId) {
  if (BOOSEND_API_KEY) return BOOSEND_API_KEY;
  const { data } = await supabase
    .from('integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'boosend')
    .eq('is_active', true)
    .single();
  return data?.api_key || null;
}

async function fetchBoosendInstagramAccount(apiKey) {
  const url = new URL('/api/publishing/instagram/accounts', BOOSEND_API);
  const bsRes = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!bsRes.ok) return null;
  const data = await bsRes.json().catch(() => ({}));
  const acc = (data?.accounts || [])[0] || null;
  if (acc) {
    // BooSend has surfaced their own account UUID as `id`. Facebook's
    // Graph error ("Object with ID '<uuid>' does not exist") means the
    // publish endpoint has been forwarding that UUID directly to Meta.
    // Log all fields so we can pick the Meta-facing one deterministically
    // rather than guessing.
    console.log('[boosend] IG account shape:', Object.keys(acc), acc);
  }
  return acc;
}

// Pick the Meta-side Instagram business account id from BooSend's
// account object. Confirmed shape from Railway logs:
//   { id: '<boosend-uuid>', username, instagram_account_id: '17841…',
//     profile_picture_url }
// The Meta id lives in `instagram_account_id` (17-digit numeric). The
// BooSend UUID in `id` is NOT accepted by the publish endpoint — it
// gets forwarded straight to Meta as-is and Meta rejects it.
function pickMetaInstagramId(acc) {
  if (!acc) return null;
  // Prefer numeric Meta ids. BooSend's `instagram_account_id` field
  // holds the real Meta id, but if some tenant surfaces it under a
  // different name we accept the well-known aliases too.
  return (
    acc.instagram_account_id ||
    acc.instagram_business_account_id ||
    acc.ig_business_id ||
    acc.ig_user_id ||
    acc.instagram_user_id ||
    acc.meta_id ||
    acc.instagram_id ||
    null
  );
}

// Publish an already-loaded social_posts row via the right provider.
// Split out so the scheduled-post dispatcher can share the same publish
// logic without going through the HTTP layer.
export async function publishSocialPostRow(userId, post) {
  if (post.platform === 'linkedin') {
    const { data: integration } = await supabase
      .from('integrations')
      .select('metadata')
      .eq('user_id', userId)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .single();

    if (!integration?.metadata?.access_token) {
      const err = new Error('LinkedIn not connected. Go to Settings to connect.');
      err.code = 'linkedin_not_connected';
      throw err;
    }

    const { access_token, linkedin_user_id, expires_at } = integration.metadata;
    if (expires_at && new Date(expires_at) < new Date()) {
      const err = new Error('LinkedIn token expired. Please reconnect.');
      err.code = 'linkedin_token_expired';
      throw err;
    }

    // Route to the right publish path based on how many slides the
    // scheduled row carries. Multi-image posts ship all slides as a
    // LinkedIn carousel; single-image posts stay on the simpler path;
    // text-only posts skip the image pipeline entirely.
    const imageUrls = Array.isArray(post.media)
      ? post.media.map((m) => m?.url).filter(Boolean)
      : [];
    let result;
    if (imageUrls.length > 1) {
      result = await linkedinApi.postWithImages(access_token, linkedin_user_id, post.caption || '', imageUrls);
    } else if (imageUrls.length === 1) {
      result = await linkedinApi.postWithImage(access_token, linkedin_user_id, post.caption || '', imageUrls[0]);
    } else {
      result = await linkedinApi.postText(access_token, linkedin_user_id, post.caption || '');
    }

    await supabase
      .from('social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        external_post_id: result.postUrn || null,
        url: result.postUrl || null,
      })
      .eq('id', post.id);

    return { ok: true, postUrl: result.postUrl, postUrn: result.postUrn };
  }

  if (post.platform === 'instagram') {
    const apiKey = await resolveBoosendKey(userId);
    if (!apiKey) {
      const err = new Error('BooSend not connected. Connect in Settings to post to Instagram.');
      err.code = 'boosend_not_connected';
      throw err;
    }

    const igAccount = await fetchBoosendInstagramAccount(apiKey);
    if (!igAccount) {
      const err = new Error('No Instagram account connected via BooSend.');
      err.code = 'ig_account_missing';
      throw err;
    }

    // Normalize IG post_type to what BooSend/Meta expect. `carousel` +
    // 2+ images is a "carousel"; a `story` maps to "story"; anything
    // else is a single-media post.
    const inferredType = (post.content_type === 'carousel' || (post.media || []).length > 1)
      ? 'carousel'
      : post.content_type === 'story'
        ? 'story'
        : post.content_type === 'reel'
          ? 'reel'
          : 'single';

    // Try publish variants in order. The failing shape was
    // { instagram_account_id: <BooSend-UUID> } → BooSend forwarded the
    // UUID to Meta as an Instagram Business Account ID. Prefer the
    // Meta-facing id if BooSend exposes one; then try omitting the
    // account id entirely so BooSend resolves from the API key; only
    // fall back to the UUID as a last resort.
    const metaId = pickMetaInstagramId(igAccount);
    const attempts = [];
    if (metaId) attempts.push({ label: 'meta_id', body: { instagram_account_id: metaId } });
    attempts.push({ label: 'omit', body: {} });
    if (igAccount.id) attempts.push({ label: 'boosend_uuid', body: { instagram_account_id: igAccount.id } });

    let bsData = {};
    let bsRes;
    let lastErrText = '';
    for (const attempt of attempts) {
      const publishBody = {
        ...attempt.body,
        media_items: post.media || [],
        caption: post.caption || '',
        post_type: inferredType,
      };

      bsRes = await fetch(`${BOOSEND_API}/api/publishing/instagram/publish`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(publishBody),
      });
      bsData = await bsRes.json().catch(() => ({}));
      if (bsRes.ok) {
        console.log(`[boosend] IG publish succeeded via ${attempt.label}`);
        break;
      }
      lastErrText = bsData?.error || `HTTP ${bsRes.status}`;
      console.warn(`[boosend] IG publish attempt "${attempt.label}" failed: ${lastErrText}`);
    }

    if (!bsRes.ok) {
      const err = new Error(bsData?.error || `Instagram publish failed (${bsRes.status})`);
      err.status = bsRes.status;
      err.body = bsData;
      throw err;
    }

    await supabase
      .from('social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        external_post_id: bsData.media_id || null,
      })
      .eq('id', post.id);

    return { ok: true, media_id: bsData.media_id };
  }

  const err = new Error(`${post.platform} posting not yet supported.`);
  err.code = 'unsupported_platform';
  throw err;
}

// ─── Publish a scheduled post NOW ───
router.post('/api/calendar/posts/:id/publish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: post, error: fetchErr } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

  try {
    const result = await publishSocialPostRow(userId, post);
    res.json(result);
  } catch (err) {
    // Preserve typed error codes so the UI can render "Reconnect
    // LinkedIn" vs a generic failure banner.
    const status = err.status || (err.code === 'linkedin_token_expired' ? 401 : err.code ? 400 : 500);
    res.status(status).json({ error: err.message, code: err.code });
  }
});

export default router;
