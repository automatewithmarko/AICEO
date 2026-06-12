import { Router } from 'express';
import OpenAI from 'openai';
import { supabase } from '../services/storage.js';
import { requireCredits, requireFeature } from '../middleware/gate.js';
import { MENTOR_BASE_URL } from '../agents/base-agent.js';

const router = Router();

// xAI's API is OpenAI-wire-compatible, so we keep the OpenAI SDK. Routing:
// when MENTOR_API_KEY is set, point at Mentor's /api/v1 (Mentor's
// /chat/completions accepts the Bearer header the SDK uses); otherwise
// fall back to direct xAI. Either MENTOR_API_KEY or XAI_API_KEY must be set.
const useMentor = Boolean(process.env.MENTOR_API_KEY);
const xai = new OpenAI({
  apiKey: useMentor ? process.env.MENTOR_API_KEY : process.env.XAI_API_KEY,
  baseURL: useMentor ? `${MENTOR_BASE_URL}/api/v1` : 'https://api.x.ai/v1',
});

// ─── Get revenue chart data ───
// Returns aggregated revenue from Stripe, Whop, and manual sales
router.get('/api/sales/revenue', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ data: [], totals: {} });

  const { view = 'Month', product: productFilter } = req.query;

  // Get all payment data from integrations
  const { data: payments } = await supabase
    .from('integration_data')
    .select('provider, data_type, title, content, metadata, synced_at')
    .eq('user_id', userId)
    .eq('data_type', 'payment')
    .order('synced_at', { ascending: true });

  // Get manual sales (filter by product if specified)
  let manualSalesQuery = supabase
    .from('manual_sales')
    .select('*')
    .eq('user_id', userId);
  if (productFilter && productFilter !== 'all') {
    manualSalesQuery = manualSalesQuery.eq('product_name', productFilter);
  }
  const { data: manualSales, error: manualError } = await manualSalesQuery.order('sold_at', { ascending: true });

  if (manualError) console.log('[sales-revenue] manual_sales query error:', manualError.message);
  console.log(`[sales-revenue] Found ${(manualSales || []).length} manual sales for user ${userId}`);

  // Build time buckets based on view
  const now = new Date();
  let buckets, dateFormat;

  if (view === 'Week') {
    // Last 7 days
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    buckets = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ label: days[d.getDay()], date: d, stripe: 0, whop: 0, shopify: 0, kajabi: 0, platform: 0 });
    }
    dateFormat = (ts) => {
      const d = new Date(ts * 1000 || ts);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
  } else if (view === 'Month') {
    // Last 12 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ label: months[d.getMonth()], date: d, stripe: 0, whop: 0, shopify: 0, kajabi: 0, platform: 0 });
    }
    dateFormat = (ts) => {
      const d = new Date(ts * 1000 || ts);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };
  } else {
    // Last 6 years
    buckets = [];
    for (let i = 5; i >= 0; i--) {
      const year = now.getFullYear() - i;
      buckets.push({ label: String(year), date: new Date(year, 0, 1), stripe: 0, whop: 0, shopify: 0, kajabi: 0, platform: 0 });
    }
    dateFormat = (ts) => {
      const d = new Date(ts * 1000 || ts);
      return String(d.getFullYear());
    };
  }

  // Helper to find bucket
  const findBucket = (timestamp) => {
    if (!timestamp) return null;
    const d = new Date(typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (isNaN(d.getTime())) return null; // invalid date
    if (view === 'Week') {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return buckets.find(b => {
        const bd = b.date;
        return `${bd.getFullYear()}-${bd.getMonth()}-${bd.getDate()}` === key;
      });
    } else if (view === 'Month') {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      return buckets.find(b => `${b.date.getFullYear()}-${b.date.getMonth()}` === key);
    } else {
      return buckets.find(b => b.label === String(d.getFullYear()));
    }
  };

  // Aggregate payments into buckets (with optional product filter)
  for (const p of (payments || [])) {
    // Filter by product name if specified
    if (productFilter && productFilter !== 'all') {
      const pName = productFilter.toLowerCase();
      const titleMatch = p.title && p.title.toLowerCase().includes(pName);
      const offerMatch = p.metadata?.offer_title && p.metadata.offer_title.toLowerCase() === pName;
      const metaProductMatch = p.metadata?.product_name && p.metadata.product_name.toLowerCase() === pName;
      const contentMatch = p.content && p.content.toLowerCase().includes(pName);
      if (!titleMatch && !offerMatch && !metaProductMatch && !contentMatch) continue;
    }
    const amount = (p.metadata?.amount || 0) / 100; // cents to dollars
    const ts = p.metadata?.created || p.synced_at;
    const bucket = findBucket(ts);
    if (bucket) {
      if (p.provider === 'stripe') bucket.stripe += amount;
      else if (p.provider === 'whop') bucket.whop += amount;
      else if (p.provider === 'shopify') bucket.shopify += amount;
      else if (p.provider === 'kajabi') bucket.kajabi += amount;
    }
  }

  // Aggregate manual sales
  for (const s of (manualSales || [])) {
    const rawAmount = Number(s.amount) || 0;
    const amount = rawAmount / 100; // cents to dollars
    const bucket = findBucket(s.sold_at || s.created_at);
    if (bucket) {
      bucket.platform += amount;
    } else {
      console.log(`[sales-revenue] No bucket for manual sale: sold_at=${s.sold_at}, amount=${rawAmount}, view=${view}`);
    }
  }

  // Round values
  const chartData = buckets.map(b => ({
    label: b.label,
    stripe: Math.round(b.stripe),
    whop: Math.round(b.whop),
    shopify: Math.round(b.shopify),
    kajabi: Math.round(b.kajabi),
    platform: Math.round(b.platform),
  }));

  // Totals
  const totals = {
    stripe: Math.round(buckets.reduce((s, b) => s + b.stripe, 0)),
    whop: Math.round(buckets.reduce((s, b) => s + b.whop, 0)),
    shopify: Math.round(buckets.reduce((s, b) => s + b.shopify, 0)),
    kajabi: Math.round(buckets.reduce((s, b) => s + b.kajabi, 0)),
    platform: Math.round(buckets.reduce((s, b) => s + b.platform, 0)),
  };

  console.log(`[sales-revenue] Totals: stripe=${totals.stripe}, platform=${totals.platform}, whop=${totals.whop}`);

  res.json({ data: chartData, totals });
});

// ─── Get Stripe stats summary ───
router.get('/api/sales/stats', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ stats: {} });

  const { data: payments } = await supabase
    .from('integration_data')
    .select('provider, data_type, metadata')
    .eq('user_id', userId)
    .in('data_type', ['payment', 'subscription', 'customer']);

  const stats = {
    totalRevenue: 0,
    activeSubscriptions: 0,
    totalCustomers: 0,
    recentPayments: 0,
  };

  for (const p of (payments || [])) {
    if (p.data_type === 'payment' && p.metadata?.status === 'succeeded') {
      stats.totalRevenue += (p.metadata.amount || 0) / 100;
      stats.recentPayments++;
    }
    if (p.data_type === 'subscription') stats.activeSubscriptions++;
    if (p.data_type === 'customer') stats.totalCustomers++;
  }

  stats.totalRevenue = Math.round(stats.totalRevenue);
  res.json({ stats });
});

// Calls are listed with a `pp-` prefix (PurelyPersonal meetings); resolve
// back to the meetings row, scoped to the requesting user.
async function resolveMeeting(userId, id) {
  const rawId = String(id).replace(/^pp-/, '');
  const { data, error } = await supabase
    .from('meetings')
    .select('id, title, participants, duration_seconds, transcript_text, summary, action_items, metadata')
    .eq('id', rawId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

// Best available text for LLM analysis: full transcript, else summary.
function meetingTranscript(meeting) {
  let text = meeting.transcript_text;
  if (!text && meeting.summary) {
    text = typeof meeting.summary === 'string'
      ? meeting.summary
      : meeting.summary.overview || JSON.stringify(meeting.summary);
  }
  if (!text || !String(text).trim()) return null;
  const s = String(text);
  return s.length > 30000 ? s.slice(0, 30000) + '\n\n[...transcript truncated]' : s;
}

function meetingSummaryText(meeting) {
  if (typeof meeting.summary === 'string') return meeting.summary;
  return meeting.summary?.overview || (meeting.summary ? JSON.stringify(meeting.summary) : null);
}

// ─── Get calls (PurelyPersonal meetings only) ───
router.get('/api/sales/calls', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ calls: [] });

  const [meetingsRes, metaRes, contextRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, platform, started_at, duration_seconds, summary, action_items, recall_bot_status, metadata')
      .eq('user_id', userId)
      .in('recall_bot_status', ['processed', 'done'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('call_metadata').select('integration_data_id, call_type, status').eq('user_id', userId),
    supabase.from('sales_calls').select('meeting_id').eq('user_id', userId),
  ]);

  const ppMeetings = meetingsRes.data || [];
  const metaById = new Map((metaRes.data || []).map(m => [m.integration_data_id, m]));
  const inContext = new Set((contextRes.data || []).map(r => r.meeting_id));

  const calls = ppMeetings.map(m => ({
    id: `pp-${m.id}`,
    name: m.title || 'Meeting',
    date: m.started_at || '',
    summary: m.summary?.overview || '',
    recorder: 'purelypersonal',
    callType: metaById.get(m.id)?.call_type || 'Other',
    status: metaById.get(m.id)?.status || null,
    objections: m.metadata?.objections || null,
    in_context: inContext.has(m.id),
    platform: m.platform,
    meetingId: m.id,
  }));

  res.json({ calls });
});

// ─── Get single call detail (for external recording detail page) ───
router.get('/api/sales/calls/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: record, error } = await supabase
    .from('integration_data')
    .select('id, provider, title, content, metadata, synced_at')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !record) return res.status(404).json({ error: 'Recording not found' });

  res.json({
    call: {
      id: record.id,
      title: record.title,
      content: record.content,
      provider: record.provider,
      date: record.metadata?.date || record.synced_at,
      duration: record.metadata?.duration || 0,
      summary: record.metadata?.summary || '',
      action_items: record.metadata?.action_items || '',
    },
  });
});

// ─── Update call metadata ───
router.patch('/api/sales/calls/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { call_type, status } = req.body;

  // PurelyPersonal meeting ids arrive prefixed with `pp-`, but
  // integration_data_id is a uuid column — strip the prefix or the
  // upsert fails with a 22P02 (invalid uuid) error.
  const rawId = String(req.params.id).replace(/^pp-/, '');

  const { data, error } = await supabase
    .from('call_metadata')
    .upsert({
      user_id: userId,
      integration_data_id: rawId,
      call_type: call_type || 'Other',
      status: status || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,integration_data_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ metadata: data });
});

// ─── Generate action items for external recording ───
router.post('/api/sales/calls/:id/generate-action-items', requireFeature('call_intelligence'), requireCredits('call_intelligence'), async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: record, error } = await supabase
    .from('integration_data')
    .select('id, content, metadata')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !record) return res.status(404).json({ error: 'Recording not found' });
  if (!record.content) return res.json({ action_items: [] });

  const transcript = record.content.length > 30000
    ? record.content.slice(0, 30000) + '\n\n[...transcript truncated]'
    : record.content;

  try {
    const completion = await xai.chat.completions.create({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        { role: 'system', content: 'You are an expert at extracting action items from meeting transcripts. Return valid JSON only with an "action_items" key.' },
        { role: 'user', content: `Analyze this meeting transcript and extract ALL action items, to-dos, commitments, and follow-ups. Be thorough — even implicit commitments like "I'll send that over" or "let's circle back on that" count as action items.

For each action item, identify:
- text: a short, clear title of what needs to be done (1 sentence max)
- description: a brief explanation with context about why this task matters or how to approach it (1-2 sentences)
- assignee: who is responsible (use the speaker name if mentioned, otherwise "Unassigned")
- due_date: any mentioned deadline (null if none)
- completed: always false

Return a JSON object with an "action_items" key containing the array.

Format: {"action_items": [{"text": "...", "description": "...", "assignee": "...", "due_date": null, "completed": false}]}

If genuinely no action items exist, return: {"action_items": []}

Transcript:
${transcript}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.action_items || [];

    // Save action items back to integration_data metadata
    const updatedMetadata = { ...(record.metadata || {}), action_items: items };
    await supabase
      .from('integration_data')
      .update({ metadata: updatedMetadata })
      .eq('id', req.params.id);

    res.json({ action_items: items });
  } catch (err) {
    console.error('[sales] Action items generation failed:', err.message);
    res.status(500).json({ error: 'Failed to generate action items' });
  }
});

// ─── Analyze objections (Call Intelligence card action) ───
router.post('/api/sales/calls/:id/analyze-objections', requireFeature('call_intelligence'), requireCredits('call_intelligence'), async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const meeting = await resolveMeeting(userId, req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Call not found' });

  const transcript = meetingTranscript(meeting);
  if (!transcript) return res.status(422).json({ error: 'No transcript available for this call yet' });

  try {
    const completion = await xai.chat.completions.create({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        { role: 'system', content: 'You are an elite sales coach who analyzes sales call transcripts for objections. Return valid JSON only with an "objections" key.' },
        { role: 'user', content: `Analyze this sales call transcript and find EVERY objection the prospect raised — price, timing, trust, authority ("need to ask my partner/boss"), competitors, "need to think about it", and any hesitation that slowed the deal.

For each objection identify:
- objection: short name for the objection (max 8 words)
- customer_quote: the closest verbatim quote from the prospect
- how_it_was_handled: 1-2 sentences on what the seller actually did (or "Not addressed")
- suggested_response: 1-2 sentences on a stronger way to handle it next time

Return: {"objections": [{"objection": "...", "customer_quote": "...", "how_it_was_handled": "...", "suggested_response": "..."}]}
If there are genuinely no objections, return {"objections": []}.

Transcript:
${transcript}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const objections = Array.isArray(parsed) ? parsed : parsed.objections || [];

    // Cache on the meeting so the modal reopens without re-running (and
    // re-charging) the analysis — GET /api/sales/calls returns it.
    const updatedMetadata = { ...(meeting.metadata || {}), objections, objections_at: new Date().toISOString() };
    await supabase.from('meetings').update({ metadata: updatedMetadata }).eq('id', meeting.id);

    res.json({ objections });
  } catch (err) {
    console.error('[sales] Objection analysis failed:', err.message);
    res.status(500).json({ error: 'Failed to analyze objections' });
  }
});

// ─── Write follow-up email from a call ───
router.post('/api/sales/calls/:id/write-email', requireFeature('call_intelligence'), requireCredits('call_intelligence'), async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const meeting = await resolveMeeting(userId, req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Call not found' });

  const transcript = meetingTranscript(meeting);
  if (!transcript) return res.status(422).json({ error: 'No transcript available for this call yet' });

  const participants = Array.isArray(meeting.participants)
    ? meeting.participants.map(p => (typeof p === 'string' ? p : p?.name)).filter(Boolean).join(', ')
    : '';

  try {
    const completion = await xai.chat.completions.create({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        { role: 'system', content: 'You write concise, natural follow-up emails after sales/business calls. Return valid JSON only with "subject" and "body" keys.' },
        { role: 'user', content: `Write a follow-up email for this call${meeting.title ? ` ("${meeting.title}")` : ''}${participants ? ` with participants: ${participants}` : ''}.

Requirements:
- Ground it ONLY in what was actually discussed — recap the key points in 1-2 sentences, restate the value, address any open concern, and end with ONE clear next step.
- Plain text body, short paragraphs separated by blank lines. No HTML, no markdown.
- Warm and human, not salesy. 120 words max.
- If the recipient's name is clear from the transcript use it; otherwise open with "Hi,".
- Sign off generically (e.g. "Best,") without inventing a sender name.

Return: {"subject": "...", "body": "..."}

Transcript:
${transcript}` },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    if (!parsed.body) throw new Error('empty draft');
    res.json({ subject: parsed.subject || `Follow-up: ${meeting.title || 'our call'}`, body: parsed.body });
  } catch (err) {
    console.error('[sales] Follow-up email generation failed:', err.message);
    res.status(500).json({ error: 'Failed to write follow-up email' });
  }
});

// ─── Add call to AI CEO context ───
// Copies the meeting into sales_calls, which the CEO orchestrator
// (services/context.js) and stagedemo assistant load on every chat.
// No LLM involved, so no feature/credit gate — auth only.
router.post('/api/sales/calls/:id/add-to-context', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const meeting = await resolveMeeting(userId, req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Call not found' });

  const { data: existing } = await supabase
    .from('sales_calls')
    .select('id')
    .eq('user_id', userId)
    .eq('meeting_id', meeting.id)
    .maybeSingle();
  if (existing) return res.json({ ok: true, already: true });

  const { error } = await supabase.from('sales_calls').insert({
    user_id: userId,
    meeting_id: meeting.id,
    title: meeting.title || 'Meeting',
    summary: meetingSummaryText(meeting),
    action_items: meeting.action_items || [],
    participants: meeting.participants || [],
    duration: meeting.duration_seconds || null,
  });
  // 23505 = unique violation: a concurrent click already added it — fine.
  if (error && error.code !== '23505') {
    console.error('[sales] add-to-context failed:', error.message);
    return res.status(500).json({ error: 'Failed to add call to context' });
  }
  res.json({ ok: true, already: false });
});

// ─── Get products (from Whop + manual) ───
router.get('/api/sales/products', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ products: [] });

  // Integration products (Whop, Shopify, Kajabi)
  const { data: integrationProducts } = await supabase
    .from('integration_data')
    .select('id, title, provider, metadata')
    .eq('user_id', userId)
    .eq('data_type', 'product')
    .in('provider', ['whop', 'shopify', 'kajabi']);

  // User-created products (have price_cents)
  const { data: userProducts } = await supabase
    .from('products')
    .select('id, name, price_cents, pricing_options')
    .eq('user_id', userId);

  // Get unique product names from manual sales
  const { data: manualProducts } = await supabase
    .from('manual_sales')
    .select('product_name')
    .eq('user_id', userId);

  const productSet = new Set();
  const products = [{ id: 'all', name: 'All Products' }];

  // User-created products first (they have reliable prices)
  for (const up of (userProducts || [])) {
    if (!productSet.has(up.name)) {
      productSet.add(up.name);
      const priceCents = up.price_cents || up.pricing_options?.[0]?.price_cents;
      products.push({ id: up.id, name: up.name, source: 'platform', price: priceCents ? (priceCents / 100) : null });
    }
  }

  for (const ip of (integrationProducts || [])) {
    if (!productSet.has(ip.title)) {
      productSet.add(ip.title);
      // Try to extract price from metadata (varies by provider)
      const rawPrice = ip.metadata?.price ?? ip.metadata?.price_cents ?? ip.metadata?.amount;
      let price = null;
      if (rawPrice != null) {
        const num = Number(rawPrice);
        // If it looks like cents (> 100), convert to dollars
        price = num > 0 ? (num >= 100 && Number.isInteger(num) ? num / 100 : num) : null;
      }
      products.push({ id: ip.id, name: ip.title, source: ip.provider, price });
    }
  }

  for (const ms of (manualProducts || [])) {
    if (!productSet.has(ms.product_name)) {
      productSet.add(ms.product_name);
      products.push({ id: `manual-${ms.product_name}`, name: ms.product_name, source: 'manual', price: null });
    }
  }

  res.json({ products });
});

// ─── Add manual sale ───
router.post('/api/sales', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { product_name, buyer_name, amount } = req.body;
  if (!product_name || !amount) {
    return res.status(400).json({ error: 'product_name and amount are required' });
  }

  const parsedAmount = Math.round(Number(amount) * 100); // dollars to cents
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a valid positive number' });
  }

  console.log(`[sales] Adding manual sale: product=${product_name}, amount_input=${amount}, amount_cents=${parsedAmount}`);

  const { data, error } = await supabase.from('manual_sales').insert({
    user_id: userId,
    product_name,
    buyer_name: buyer_name || '',
    amount: parsedAmount, // stored in cents
    sold_at: new Date().toISOString(),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ sale: data });
});

// ─── Trigger re-sync of integration data ───
router.post('/api/sales/sync', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Import dynamically to avoid circular deps
  const { default: integrationRoutes } = await import('./integrations.js');

  // Get connected integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  const results = {};
  for (const int of (integrations || [])) {
    try {
      let service;
      if (int.provider === 'stripe') service = (await import('../services/integrations/stripe-int.js'));
      else if (int.provider === 'whop') service = (await import('../services/integrations/whop.js'));
      else if (int.provider === 'shopify') service = (await import('../services/integrations/shopify.js'));
      else if (int.provider === 'kajabi') service = (await import('../services/integrations/kajabi.js'));
      else continue;

      const result = await service.sync({ ...int, user_id: userId });
      results[int.provider] = result;
    } catch (err) {
      results[int.provider] = { error: err.message };
    }
  }

  res.json({ results });
});

export default router;
