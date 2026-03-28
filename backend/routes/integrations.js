import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/storage.js';
import * as fireflies from '../services/integrations/fireflies.js';
import * as fathom from '../services/integrations/fathom.js';
import * as stripeInt from '../services/integrations/stripe-int.js';
import * as whop from '../services/integrations/whop.js';
import * as gohighlevel from '../services/integrations/gohighlevel.js';
import * as shopify from '../services/integrations/shopify.js';
import * as kajabi from '../services/integrations/kajabi.js';
import * as netlify from '../services/integrations/netlify.js';
import * as boosend from '../services/integrations/boosend.js';

const router = Router();

const services = { fireflies, fathom, stripe: stripeInt, whop, gohighlevel, shopify, kajabi, netlify, boosend };
const VALID_PROVIDERS = Object.keys(services);

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
    if (['fireflies', 'shopify', 'kajabi', 'gohighlevel'].includes(provider)) {
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

  if (grouped.fireflies?.length || grouped.fathom?.length) {
    const transcripts = [...(grouped.fireflies || []), ...(grouped.fathom || [])];
    sections.push('## Call Transcripts & Meeting Notes');
    for (const t of transcripts.slice(0, 10)) {
      sections.push(`### ${t.title}`);
      if (t.metadata?.summary) sections.push(`Summary: ${t.metadata.summary}`);
      if (t.content) sections.push(t.content.slice(0, 500));
      sections.push('');
    }
  }

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
    return res.status(400).json({ error: 'Netlify not connected. Connect it in Settings first.' });
  }

  try {
    const result = await netlify.deploy(integration.api_key, html, {
      siteName: siteName || `pp-${userId.slice(0, 8)}-${Date.now().toString(36)}`,
      siteId: integration.metadata?.last_site_id || null,
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
    res.status(500).json({ error: `Deploy failed: ${err.message}` });
  }
});

export default router;
