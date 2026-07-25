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

  const { platform, caption, content_type, scheduled_at, media, status, ig_account_id } = req.body;
  if (!platform || !caption) return res.status(400).json({ error: 'platform and caption required' });

  const row = {
    user_id: userId,
    platform,
    caption,
    content_type: content_type || null,
    scheduled_at: scheduled_at || null,
    media: media || [],
    status: status || 'draft',
  };
  // BooSend account (row UUID) chosen for Instagram publishing. Optional —
  // when absent, BooSend auto-resolves the user's first active account.
  if (platform === 'instagram' && ig_account_id) row.ig_account_id = ig_account_id;

  let { data, error } = await supabase.from('social_posts').insert(row).select().single();
  if (error && row.ig_account_id && /ig_account_id/.test(error.message || '')) {
    // Live DB predates the ig_account_id column — save the post anyway
    // (publish falls back to BooSend's default account).
    delete row.ig_account_id;
    ({ data, error } = await supabase.from('social_posts').insert(row).select().single());
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json({ post: data });
});

// ─── Update a post ───
router.put('/api/calendar/posts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { caption, scheduled_at, media, status, content_type, ig_account_id } = req.body;
  const updates = {};
  if (caption !== undefined) updates.caption = caption;
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
  if (media !== undefined) updates.media = media;
  if (status !== undefined) updates.status = status;
  if (content_type !== undefined) updates.content_type = content_type;
  if (ig_account_id !== undefined) updates.ig_account_id = ig_account_id;

  let { data, error } = await supabase
    .from('social_posts')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error && 'ig_account_id' in updates && /ig_account_id/.test(error.message || '')) {
    delete updates.ig_account_id;
    ({ data, error } = await supabase
      .from('social_posts')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single());
  }

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

// preferredId: BooSend account row UUID the post was pinned to. Falls back
// to the first connected account when absent or no longer connected.
async function fetchBoosendInstagramAccount(apiKey, preferredId) {
  const url = new URL('/api/publishing/instagram/accounts', BOOSEND_API);
  const bsRes = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!bsRes.ok) return null;
  const data = await bsRes.json().catch(() => ({}));
  const accounts = data?.accounts || [];
  if (preferredId) {
    const match = accounts.find((a) => a.id === preferredId);
    if (match) return match;
    console.warn(`[boosend] pinned IG account ${preferredId} no longer connected — falling back to default`);
  }
  return accounts[0] || null;
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
      // Ship carousels as native LinkedIn documents (swipeable slide
      // viewer on web + mobile) rather than multi-image grid.
      const docTitle = post.caption ? post.caption.slice(0, 60) : 'Carousel';
      result = await linkedinApi.postWithDocument(access_token, linkedin_user_id, post.caption || '', imageUrls, docTitle);
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

    const igAccount = await fetchBoosendInstagramAccount(apiKey, post.ig_account_id || null);
    if (!igAccount) {
      const err = new Error('No Instagram account connected via BooSend.');
      err.code = 'ig_account_missing';
      throw err;
    }

    // BooSend's publish route (publishing.ts) contract, read from source:
    //   - Each media_items entry MUST carry `type: 'IMAGE' | 'VIDEO'` —
    //     that field alone decides whether Meta gets image_url or
    //     video_url. Omitting it sends an empty container and Meta
    //     answers "The parameter image_url is required".
    //   - Omit instagram_account_id/access_token entirely: BooSend
    //     auto-resolves the active account from the API key. Passing
    //     its row UUID gets forwarded to Meta verbatim (rejected), and
    //     passing the Meta id fails BooSend's own UUID lookup.
    //   - Caption is only attached when post_type === 'single' (the
    //     carousel branch adds it to the carousel container). A VIDEO
    //     item always becomes a REELS container, so reels go out as
    //     post_type 'single' too — that's what keeps their caption.
    //   - There is no STORIES media_type anywhere in the route: stories
    //     are unsupported upstream and would land on the feed grid.
    if (post.content_type === 'story') {
      const err = new Error("Instagram Stories can't be published through BooSend yet — its Meta publish route has no story support, so frames would land on the feed instead. Post them from the Instagram app for now.");
      err.code = 'ig_story_unsupported';
      throw err;
    }

    const isVideoUrl = (url) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
    const mediaItems = (post.media || [])
      .filter((m) => m?.url)
      .map((m) => ({
        url: m.url,
        type: String(m.type || '').toLowerCase() === 'video' || isVideoUrl(m.url) ? 'VIDEO' : 'IMAGE',
      }));
    if (!mediaItems.length) {
      const err = new Error('No image URL to publish. Attach at least one image before publishing.');
      err.code = 'ig_missing_image';
      throw err;
    }

    const postType = mediaItems.length > 1 ? 'carousel' : 'single';

    const publishBody = {
      media_items: mediaItems,
      caption: post.caption || '',
      post_type: postType,
    };
    // Pin the post to its chosen account (BooSend row UUID — BooSend's
    // auto-resolve looks the row up and swaps in the Meta id + token).
    // Unpinned posts omit the field: BooSend uses the first active account.
    if (post.ig_account_id && igAccount?.id) publishBody.instagram_account_id = igAccount.id;

    const bsRes = await fetch(`${BOOSEND_API}/api/publishing/instagram/publish`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(publishBody),
    });
    const bsData = await bsRes.json().catch(() => ({}));
    if (bsRes.ok) {
      console.log(`[boosend] IG publish succeeded (${postType}, ${mediaItems.length} item(s)) for @${igAccount.username || 'unknown'}`);
    } else {
      console.warn(`[boosend] IG publish failed (${postType}, ${mediaItems.length} item(s)): ${bsData?.error || `HTTP ${bsRes.status}`}`);
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
