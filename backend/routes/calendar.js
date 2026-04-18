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

// ─── Publish a scheduled post NOW ───
router.post('/api/calendar/posts/:id/publish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Get the post
  const { data: post, error: fetchErr } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

  if (post.platform === 'linkedin') {
    // Get LinkedIn credentials
    const { data: integration } = await supabase
      .from('integrations')
      .select('metadata')
      .eq('user_id', userId)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .single();

    if (!integration?.metadata?.access_token) {
      return res.status(400).json({ error: 'LinkedIn not connected. Go to Settings to connect.' });
    }

    const { access_token, linkedin_user_id } = integration.metadata;

    try {
      const result = await linkedinApi.postText(access_token, linkedin_user_id, post.caption);

      // Update the post as published
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_post_id: result.postUrn || null,
          url: result.postUrl || null,
        })
        .eq('id', post.id);

      res.json({ ok: true, postUrl: result.postUrl, postUrn: result.postUrn });
    } catch (err) {
      res.status(500).json({ error: `LinkedIn posting failed: ${err.message}` });
    }
  } else if (post.platform === 'instagram') {
    // Get BooSend API key
    let apiKey = BOOSEND_API_KEY;
    if (!apiKey) {
      const { data: bsInt } = await supabase
        .from('integrations')
        .select('api_key')
        .eq('user_id', userId)
        .eq('provider', 'boosend')
        .eq('is_active', true)
        .single();
      apiKey = bsInt?.api_key;
    }
    if (!apiKey) return res.status(400).json({ error: 'BooSend not connected. Connect in Settings to post to Instagram.' });

    // Get Instagram account
    const { data: igAccount } = await supabase
      .from('instagram_accounts')
      .select('id, access_token')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!igAccount) return res.status(400).json({ error: 'No Instagram account connected via BooSend.' });

    try {
      const publishBody = {
        action: 'publish',
        instagram_account_id: igAccount.id,
        access_token: igAccount.access_token,
        media_items: post.media || [],
        caption: post.caption || '',
        post_type: post.content_type || 'single',
      };

      const bsRes = await fetch(`${BOOSEND_API}/api/publishing/instagram/publish`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(publishBody),
      });

      const bsData = await bsRes.json();
      if (!bsRes.ok) return res.status(bsRes.status).json(bsData);

      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_post_id: bsData.media_id || null,
        })
        .eq('id', post.id);

      res.json({ ok: true, media_id: bsData.media_id });
    } catch (err) {
      res.status(500).json({ error: `Instagram posting failed: ${err.message}` });
    }
  } else {
    return res.status(400).json({ error: `${post.platform} posting not yet supported. Coming soon.` });
  }
});

export default router;
