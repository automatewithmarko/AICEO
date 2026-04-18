import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/storage.js';
import * as stripeInt from '../services/integrations/stripe-int.js';
import * as whop from '../services/integrations/whop.js';
import * as gohighlevel from '../services/integrations/gohighlevel.js';
import * as shopify from '../services/integrations/shopify.js';
import * as kajabi from '../services/integrations/kajabi.js';
import * as netlify from '../services/integrations/netlify.js';
import * as boosend from '../services/integrations/boosend.js';
import * as linkedinApi from '../services/linkedin-api.js';

const router = Router();

const services = { stripe: stripeInt, whop, gohighlevel, shopify, kajabi, netlify, boosend };
const VALID_PROVIDERS = Object.keys(services);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://aiceoproduction.netlify.app';

function linkedinRedirectUri(req) {
  const baseUrl = process.env.API_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get('host')}`);
  return `${baseUrl}/api/integrations/linkedin/callback`;
}

// ─── LinkedIn OAuth 2.0 + Posting ───
// These must be defined BEFORE the generic :provider routes below so Express
// matches the literal paths first.

// Return the LinkedIn authorization URL so the frontend can redirect the user
router.get('/api/integrations/linkedin/auth', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  try {
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = linkedinRedirectUri(req);
    const url = linkedinApi.getAuthUrl(redirectUri, state);

    // Persist state so we can verify it on callback
    await supabase.from('integrations').upsert({
      user_id: userId,
      provider: 'linkedin_oauth_state',
      credentials: { state },
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    res.json({ url });
  } catch (err) {
    console.log('[linkedin] auth URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback — exchange code, get user info, store credentials
router.get('/api/integrations/linkedin/callback', async (req, res) => {
  const { code, error: oauthError, error_description } = req.query;

  if (oauthError) {
    console.log('[linkedin] OAuth error:', oauthError, error_description);
    return res.redirect(`${FRONTEND_URL}/settings?linkedin=error&reason=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings?linkedin=error&reason=no_code`);
  }

  try {
    const redirectUri = linkedinRedirectUri(req);

    // Exchange code for access token
    const tokenData = await linkedinApi.exchangeCode(code, redirectUri);
    const { access_token, expires_in } = tokenData;

    // Calculate expiration timestamp
    const expires_at = new Date(Date.now() + (expires_in || 5184000) * 1000).toISOString();

    // Fetch LinkedIn profile
    const userInfo = await linkedinApi.getUserInfo(access_token);
    const linkedinUserId = userInfo.sub;
    const name = userInfo.name || 'LinkedIn User';

    // We need the user_id. Since OAuth callback is a redirect (no Bearer token),
    // look up the most recent pending linkedin_oauth_state to find the user.
    const { data: stateRow } = await supabase
      .from('integrations')
      .select('user_id')
      .eq('provider', 'linkedin_oauth_state')
      .eq('is_active', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!stateRow) {
      return res.redirect(`${FRONTEND_URL}/settings?linkedin=error&reason=session_expired`);
    }

    const userId = stateRow.user_id;

    // Store LinkedIn credentials
    await supabase.from('integrations').upsert({
      user_id: userId,
      provider: 'linkedin',
      credentials: {
        access_token,
        linkedin_user_id: linkedinUserId,
        name,
        expires_at,
      },
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    // Clean up the state row
    await supabase.from('integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'linkedin_oauth_state');

    console.log(`[linkedin] OAuth connected for user ${userId} (${name})`);
    res.redirect(`${FRONTEND_URL}/settings?linkedin=connected`);
  } catch (err) {
    console.log('[linkedin] OAuth callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/settings?linkedin=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// Post to LinkedIn — text or text+image
router.post('/api/integrations/linkedin/post', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { text, imageUrl } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Fetch stored LinkedIn credentials
  const { data: integration, error: fetchErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'linkedin')
    .eq('is_active', true)
    .single();

  if (fetchErr || !integration) {
    return res.status(400).json({ error: 'LinkedIn not connected', code: 'linkedin_not_connected' });
  }

  const { access_token, linkedin_user_id, expires_at } = integration.credentials;

  // Check token expiration
  if (expires_at && new Date(expires_at) < new Date()) {
    return res.status(401).json({ error: 'LinkedIn token expired. Please reconnect.', code: 'linkedin_token_expired' });
  }

  try {
    let result;
    if (imageUrl) {
      result = await linkedinApi.postWithImage(access_token, linkedin_user_id, text, imageUrl);
    } else {
      result = await linkedinApi.postText(access_token, linkedin_user_id, text);
    }

    // Record the post in social_posts table
    await supabase.from('social_posts').insert({
      user_id: userId,
      platform: 'linkedin',
      external_post_id: result.postUrn || null,
      url: result.postUrl || null,
      caption: text.slice(0, 5000),
      thumbnail_url: imageUrl || null,
      published_at: new Date().toISOString(),
    });

    console.log(`[linkedin] Post published for user ${userId}: ${result.postUrl}`);
    res.json({ ok: true, postUrl: result.postUrl, postUrn: result.postUrn });
  } catch (err) {
    console.log(`[linkedin] Post failed for user ${userId}:`, err.message);
    res.status(500).json({ error: `Post failed: ${err.message}` });
  }
});

// Disconnect LinkedIn
router.delete('/api/integrations/linkedin', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'linkedin');

  if (error) return res.status(500).json({ error: error.message });

  console.log(`[linkedin] Disconnected for user ${userId}`);
  res.json({ ok: true });
});

// ─── List all user integrations (no keys in response) ───
router.get('/api/integrations', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ integrations: [] });

  const { data, error } = await supabase
    .from('integrations')
    .select('id, provider, is_active, metadata, last_synced_at, webhook_url, webhook_secret, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ integrations: data });
});

// ─── Connect an integration ───
router.post('/api/integrations/:provider/connect', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { provider } = req.params;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider: ${provider}` });
  }

  const { api_key, metadata: reqMetadata } = req.body;
  if (!api_key) return res.status(400).json({ error: 'api_key is required' });

  const service = services[provider];

  // Validate the API key against the external service
  try {
    console.log(`[integrations] Validating ${provider} API key for user ${userId}...`);
    const validationResult = await service.validate(api_key, reqMetadata);

    // Build integration record
    const record = {
      user_id: userId,
      provider,
      api_key,
      is_active: true,
      metadata: validationResult || {},
      updated_at: new Date().toISOString(),
    };

    // Generate webhook URL and secret for providers that support webhooks
    if (['shopify', 'kajabi', 'gohighlevel'].includes(provider)) {
      const baseUrl = process.env.API_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3001');
      record.webhook_url = `${baseUrl}/api/webhooks/${provider}/${userId}`;
      record.webhook_secret = crypto.randomBytes(16).toString('hex');
    }

    // Upsert to DB
    const { data, error } = await supabase
      .from('integrations')
      .upsert(record, { onConflict: 'user_id,provider' })
      .select('id, provider, is_active, metadata, last_synced_at, webhook_url, webhook_secret, created_at, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    console.log(`[integrations] ${provider} connected for user ${userId}`);

    // Trigger initial sync in background
    const integration = { ...data, api_key, user_id: userId };
    if (service.sync) {
      service.sync(integration).then(result => {
        console.log(`[integrations] ${provider} initial sync: ${result.synced}/${result.total}`);
      }).catch(err => {
        console.log(`[integrations] ${provider} initial sync failed: ${err.message}`);
      });
    }

    res.json({ integration: data });
  } catch (err) {
    console.log(`[integrations] ${provider} validation failed: ${err.message}`);
    res.status(400).json({ error: `Validation failed: ${err.message}` });
  }
});

// ─── Disconnect an integration ───
router.delete('/api/integrations/:provider', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { provider } = req.params;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider: ${provider}` });
  }

  // Delete integration (integration_data cascade-deletes)
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) return res.status(500).json({ error: error.message });

  console.log(`[integrations] ${provider} disconnected for user ${userId}`);
  res.json({ ok: true });
});

// ─── Manual re-sync ───
router.post('/api/integrations/:provider/sync', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { provider } = req.params;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider: ${provider}` });
  }

  const { data: integration, error: fetchErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (fetchErr || !integration) return res.status(404).json({ error: 'Integration not found' });

  const service = services[provider];
  if (!service.sync) return res.status(400).json({ error: 'Sync not supported for this provider' });

  try {
    const result = await service.sync({ ...integration, user_id: userId });
    res.json(result);
  } catch (err) {
    console.log(`[integrations] ${provider} sync failed: ${err.message}`);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// ─── Integration context for AI CEO ───
router.get('/api/integration-context', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ context: '' });

  const { data, error } = await supabase
    .from('integration_data')
    .select('provider, data_type, title, content, metadata, synced_at')
    .eq('user_id', userId)
    .order('synced_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) return res.json({ context: '' });

  // Group by provider
  const grouped = {};
  for (const row of data) {
    if (!grouped[row.provider]) grouped[row.provider] = [];
    grouped[row.provider].push(row);
  }

  const sections = [];

  // PurelyPersonal meetings (from meetings table)
  const { data: ppMeetings } = await supabase
    .from('meetings')
    .select('title, platform, started_at, duration_seconds, summary, action_items, participants')
    .eq('user_id', userId)
    .eq('recall_bot_status', 'processed')
    .order('created_at', { ascending: false })
    .limit(10);

  if (ppMeetings?.length) {
    sections.push('## PurelyPersonal Meeting Notes');
    for (const m of ppMeetings) {
      const date = m.started_at ? new Date(m.started_at).toLocaleDateString() : '';
      sections.push(`### ${m.title || 'Meeting'} (${m.platform || 'unknown'}) — ${date}`);
      if (m.summary?.overview) sections.push(`Summary: ${typeof m.summary.overview === 'string' ? m.summary.overview : JSON.stringify(m.summary.overview)}`);
      if (m.action_items?.length) {
        sections.push(`Action Items: ${m.action_items.map(a => a.text).join('; ')}`);
      }
      sections.push('');
    }
  }

  if (grouped.stripe?.length) {
    sections.push('## Stripe Data');
    const payments = grouped.stripe.filter(d => d.data_type === 'payment');
    const subs = grouped.stripe.filter(d => d.data_type === 'subscription');
    const customers = grouped.stripe.filter(d => d.data_type === 'customer');

    if (payments.length) {
      sections.push(`### Recent Payments (${payments.length})`);
      for (const p of payments.slice(0, 10)) {
        sections.push(`- ${p.title}`);
      }
    }
    if (subs.length) {
      sections.push(`### Active Subscriptions (${subs.length})`);
      for (const s of subs) {
        sections.push(`- ${s.title}`);
      }
    }
    if (customers.length) {
      sections.push(`### Customers (${customers.length})`);
      for (const c of customers.slice(0, 10)) {
        sections.push(`- ${c.title}${c.metadata?.email ? ` (${c.metadata.email})` : ''}`);
      }
    }
    sections.push('');
  }

  if (grouped.whop?.length) {
    sections.push('## Whop Data');
    for (const item of grouped.whop) {
      sections.push(`- [${item.data_type}] ${item.title}`);
    }
    sections.push('');
  }

  if (grouped.shopify?.length) {
    sections.push('## Shopify Data');
    const orders = grouped.shopify.filter(d => d.data_type === 'payment');
    const prods = grouped.shopify.filter(d => d.data_type === 'product');
    const custs = grouped.shopify.filter(d => d.data_type === 'customer');

    if (orders.length) {
      sections.push(`### Recent Orders (${orders.length})`);
      for (const o of orders.slice(0, 10)) {
        sections.push(`- ${o.title}`);
      }
    }
    if (prods.length) {
      sections.push(`### Products (${prods.length})`);
      for (const p of prods.slice(0, 10)) {
        sections.push(`- ${p.title}${p.metadata?.price ? ` ($${p.metadata.price})` : ''}`);
      }
    }
    if (custs.length) {
      sections.push(`### Customers (${custs.length})`);
      for (const c of custs.slice(0, 10)) {
        sections.push(`- ${c.title}${c.metadata?.email ? ` (${c.metadata.email})` : ''}`);
      }
    }
    sections.push('');
  }

  if (grouped.kajabi?.length) {
    sections.push('## Kajabi Data');
    const sales = grouped.kajabi.filter(d => d.data_type === 'payment');
    const offers = grouped.kajabi.filter(d => d.data_type === 'product');
    const subs = grouped.kajabi.filter(d => d.data_type === 'subscription');
    const members = grouped.kajabi.filter(d => d.data_type === 'customer');

    if (sales.length) {
      sections.push(`### Sales (${sales.length})`);
      for (const s of sales.slice(0, 10)) {
        sections.push(`- ${s.title}`);
      }
    }
    if (offers.length) {
      sections.push(`### Offers (${offers.length})`);
      for (const o of offers) {
        sections.push(`- ${o.title}`);
      }
    }
    if (subs.length) {
      sections.push(`### Subscriptions (${subs.length})`);
      for (const s of subs) {
        sections.push(`- ${s.title}`);
      }
    }
    if (members.length) {
      sections.push(`### Members (${members.length})`);
      for (const m of members.slice(0, 10)) {
        sections.push(`- ${m.title}${m.metadata?.email ? ` (${m.metadata.email})` : ''}`);
      }
    }
    sections.push('');
  }

  if (grouped.gohighlevel?.length) {
    sections.push('## GoHighLevel CRM');
    const contacts = grouped.gohighlevel.filter(d => d.data_type === 'contact');
    const opps = grouped.gohighlevel.filter(d => d.data_type === 'opportunity');
    const pipelines = grouped.gohighlevel.filter(d => d.data_type === 'pipeline');

    if (pipelines.length) {
      sections.push(`### Pipelines (${pipelines.length})`);
      for (const p of pipelines) {
        sections.push(`- ${p.title}`);
      }
    }
    if (opps.length) {
      sections.push(`### Opportunities (${opps.length})`);
      for (const o of opps.slice(0, 10)) {
        sections.push(`- ${o.title}${o.metadata?.monetary_value ? ` ($${o.metadata.monetary_value})` : ''}`);
      }
    }
    if (contacts.length) {
      sections.push(`### Contacts (${contacts.length})`);
      for (const c of contacts.slice(0, 10)) {
        sections.push(`- ${c.title}${c.metadata?.email ? ` (${c.metadata.email})` : ''}`);
      }
    }
    sections.push('');
  }

  res.json({ context: sections.join('\n') });
});

// ─── Deploy to Netlify ───
// Return current Netlify connection state + last deploy metadata so the
// frontend can pre-fill the "name your site" modal on redeploy.
router.get('/api/netlify/status', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ connected: false });

  const { data: integration } = await supabase
    .from('integrations')
    .select('is_active, metadata')
    .eq('user_id', userId)
    .eq('provider', 'netlify')
    .single();

  if (!integration || !integration.is_active) return res.json({ connected: false });

  res.json({
    connected: true,
    last_site_name: integration.metadata?.last_site_name || null,
    last_site_id: integration.metadata?.last_site_id || null,
  });
});

// Check if a site name is available. Used by the name-your-site modal for
// live feedback before the user hits Deploy.
router.get('/api/netlify/check-name', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const name = String(req.query.name || '');
  const v = netlify.validateName(name);
  if (!v.ok) {
    return res.json({ available: false, reason: v.reason });
  }

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'netlify')
    .eq('is_active', true)
    .single();

  if (!integration) {
    return res.status(400).json({ error: 'Netlify not connected.', code: 'netlify_not_connected' });
  }

  try {
    const result = await netlify.checkNameAvailable(integration.api_key, v.name);
    res.json({ ...result, normalized: v.name });
  } catch (err) {
    console.error(`[netlify] check-name failed for user ${userId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/netlify/deploy', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { html, siteName } = req.body;
  if (!html) return res.status(400).json({ error: 'html is required' });

  // Get Netlify integration
  const { data: integration, error: fetchErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'netlify')
    .eq('is_active', true)
    .single();

  if (fetchErr || !integration) {
    return res.status(400).json({
      error: 'Netlify not connected.',
      code: 'netlify_not_connected',
    });
  }

  // A user-provided name is required. No more random pp-<hash>-<timestamp>.
  const providedName = typeof siteName === 'string' ? siteName.toLowerCase().trim() : '';
  const v = netlify.validateName(providedName);
  if (!v.ok) {
    return res.status(400).json({
      error: 'A valid site name is required. Use lowercase letters, digits, and hyphens (1-63 chars).',
      code: 'netlify_invalid_name',
      reason: v.reason,
    });
  }

  // Determine which existing siteId (if any) to redeploy to. Only reuse the
  // stored site ID when the user kept the same name; otherwise we create a
  // fresh site under the new name so the URL matches what they picked.
  const storedSiteName = integration.metadata?.last_site_name || null;
  const reuseSiteId = storedSiteName === v.name ? integration.metadata?.last_site_id : null;

  try {
    const result = await netlify.deploy(integration.api_key, html, {
      siteName: v.name,
      siteId: reuseSiteId,
    });

    // Store site ID for future deploys to the same site
    await supabase
      .from('integrations')
      .update({
        metadata: { ...integration.metadata, last_site_id: result.site_id, last_site_name: result.site_name },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    console.log(`[netlify] Deployed for user ${userId}: ${result.url}`);
    res.json(result);
  } catch (err) {
    console.error(`[netlify] Deploy failed for user ${userId}:`, err.message);
    // 401/403 means the stored Netlify token was revoked or expired. Mark the
    // integration inactive and ask the user to reconnect.
    if (/\b401\b|\b403\b|Unauthorized|Forbidden/i.test(err.message)) {
      await supabase
        .from('integrations')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      return res.status(401).json({
        error: 'Netlify token rejected.',
        code: 'netlify_unauthorized',
      });
    }
    // 422 from Netlify's /sites endpoint: site name already in use.
    if (/\b422\b|already in use|must be unique|name.*taken/i.test(err.message)) {
      return res.status(409).json({
        error: `The name "${v.name}" is already taken on Netlify. Pick another one.`,
        code: 'netlify_name_taken',
      });
    }
    res.status(500).json({ error: `Deploy failed: ${err.message}` });
  }
});

export default router;
