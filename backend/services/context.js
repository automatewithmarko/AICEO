// Server-side context loader — loads all business data for the CEO orchestrator
import { supabase } from './storage.js';

export async function loadUserContext(userId) {
  if (!userId || userId === 'anonymous') {
    return { brandDna: null, contentItems: [], salesData: null, products: [], contacts: [], outlierData: null, integrationCtx: '', soulNotes: [] };
  }

  // Parallel fetch all context data (including soul notes + active integrations)
  const [brandRes, contentRes, statsRes, revenueRes, callsRes, productsRes, contactsRes, creatorsRes, videosRes, integrationRes, soulRes, integrationsRes, emailAccRes, formsRes] = await Promise.allSettled([
    supabase.from('brand_dna').select('*').eq('user_id', userId).order('updated_at', { ascending: true }).limit(1),
    supabase.from('content_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('sales').select('amount, created_at').eq('user_id', userId),
    supabase.from('sales').select('amount, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('sales_calls').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('products').select('*').eq('user_id', userId),
    supabase.from('contacts').select('*').eq('user_id', userId).limit(50),
    supabase.from('outlier_creators').select('*').eq('user_id', userId),
    supabase.from('outlier_videos').select('*, outlier_creators!inner(username, display_name, avatar_url, platform, avg_views)').eq('user_id', userId).eq('is_outlier', true).order('views_multiplier', { ascending: false }).limit(15),
    supabase.from('integration_data').select('provider, data').eq('user_id', userId),
    supabase.from('soul_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('integrations').select('provider, is_active, metadata, last_synced_at').eq('user_id', userId),
    supabase.from('email_accounts').select('id, email, provider, display_name, is_active').eq('user_id', userId),
    supabase.from('forms').select('id, title, slug, status, questions').eq('user_id', userId).in('status', ['published', 'draft']).order('updated_at', { ascending: false }).limit(20),
  ]);

  const brandDna = brandRes.status === 'fulfilled' ? (brandRes.value.data?.[0] || null) : null;
  const contentItems = contentRes.status === 'fulfilled' ? (contentRes.value.data || []) : [];
  const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];
  const contacts = contactsRes.status === 'fulfilled' ? (contactsRes.value.data || []) : [];
  const soulNotes = soulRes.status === 'fulfilled' ? (soulRes.value.data || []) : [];

  // Build sales data
  let salesData = null;
  const salesRows = statsRes.status === 'fulfilled' ? (statsRes.value.data || []) : [];
  if (salesRows.length > 0) {
    const totalRevenue = salesRows.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    salesData = {
      stats: { total_revenue: totalRevenue, total_sales: salesRows.length, avg_deal_size: totalRevenue / salesRows.length },
      calls: callsRes.status === 'fulfilled' ? (callsRes.value.data || []) : [],
    };
  }

  // Build outlier data
  let outlierData = null;
  const creators = creatorsRes.status === 'fulfilled' ? (creatorsRes.value.data || []) : [];
  const videos = videosRes.status === 'fulfilled' ? (videosRes.value.data || []) : [];
  if (creators.length || videos.length) {
    outlierData = { creators, videos };
  }

  // Build integration context string
  let integrationCtx = '';
  const integrations = integrationRes.status === 'fulfilled' ? (integrationRes.value.data || []) : [];
  if (integrations.length > 0) {
    const parts = [];
    for (const intg of integrations) {
      if (intg.data && typeof intg.data === 'object') {
        parts.push(`--- ${intg.provider} ---`);
        parts.push(JSON.stringify(intg.data).slice(0, 2000));
      }
    }
    if (parts.length) integrationCtx = parts.join('\n');
  }

  // Active integrations & email accounts
  const activeIntegrations = integrationsRes.status === 'fulfilled' ? (integrationsRes.value.data || []) : [];
  const emailAccounts = emailAccRes.status === 'fulfilled' ? (emailAccRes.value.data || []) : [];
  const forms = formsRes.status === 'fulfilled' ? (formsRes.value.data || []) : [];

  return { brandDna, contentItems, salesData, products, contacts, outlierData, integrationCtx, soulNotes, activeIntegrations, emailAccounts, forms };
}

// Save a soul note
export async function saveSoulNote(userId, content, category = 'general') {
  const { data, error } = await supabase
    .from('soul_notes')
    .insert({ user_id: userId, content, category })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Delete a soul note
export async function deleteSoulNote(userId, noteId) {
  const { error } = await supabase
    .from('soul_notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// Load the user's active Marketing campaign brief — the shared offer +
// audience + tone + goal + key benefit that every marketing tool reuses
// so the user doesn't re-explain their campaign per tab. Returns null
// if the user has no brief yet or if the table is missing (migration
// not applied), so calling code can safely treat "no brief" as the
// empty-state default.
export async function loadActiveBrief(userId) {
  if (!userId || userId === 'anonymous') return null;
  const { data, error } = await supabase
    .from('user_marketing_briefs')
    .select('id, offer, audience, tone, goal, key_benefit, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Most common cause: migration hasn't been applied yet. Don't
    // crash the orchestrate path — just behave like there's no brief.
    if (!/relation .* does not exist/i.test(error.message || '')) {
      console.warn('[brief] load failed:', error.message);
    }
    return null;
  }
  if (!data) return null;
  // Strip null fields so the system-prompt builder can skip blank lines.
  const clean = {};
  for (const k of ['id', 'offer', 'audience', 'tone', 'goal', 'key_benefit', 'updated_at']) {
    if (data[k]) clean[k] = data[k];
  }
  return Object.keys(clean).length > 1 ? clean : null;
}

// Upsert the user's brief — exposed for both manual edits (PUT
// /api/marketing/brief) and the auto-capture path in the orchestrator
// after a discovery turn. UNIQUE (user_id) on the table means this
// reliably keeps "one active brief" semantics; passing only the
// fields you want to change keeps the rest intact.
export async function upsertActiveBrief(userId, fields) {
  if (!userId || userId === 'anonymous') return null;
  const payload = { user_id: userId, updated_at: new Date().toISOString() };
  for (const k of ['offer', 'audience', 'tone', 'goal', 'key_benefit']) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }
  const { data, error } = await supabase
    .from('user_marketing_briefs')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id, offer, audience, tone, goal, key_benefit, updated_at')
    .single();
  if (error) {
    if (!/relation .* does not exist/i.test(error.message || '')) {
      console.warn('[brief] upsert failed:', error.message);
    }
    return null;
  }
  return data;
}

// Clear the user's brief — UI "New brief" / "Clear brief" action.
export async function clearActiveBrief(userId) {
  if (!userId || userId === 'anonymous') return;
  const { error } = await supabase
    .from('user_marketing_briefs')
    .delete()
    .eq('user_id', userId);
  if (error && !/relation .* does not exist/i.test(error.message || '')) {
    console.warn('[brief] delete failed:', error.message);
  }
}

// Build the `=== ACTIVE CAMPAIGN BRIEF ===` block injected into every
// marketing agent's system prompt when a brief is set. Keeping it in
// one place means the agent prompts can stay tight: "If a brief is
// provided, skip your core discovery and only ask tool-specific
// questions." Returns empty string when no brief is present.
export function formatBriefForPrompt(brief) {
  if (!brief) return '';
  const lines = [];
  if (brief.offer) lines.push(`- Offer / topic: ${brief.offer}`);
  if (brief.audience) lines.push(`- Target audience: ${brief.audience}`);
  if (brief.tone) lines.push(`- Tone / voice: ${brief.tone}`);
  if (brief.goal) lines.push(`- Primary goal / CTA: ${brief.goal}`);
  if (brief.key_benefit) lines.push(`- Key benefit / promise: ${brief.key_benefit}`);
  if (lines.length === 0) return '';
  return [
    '=== ACTIVE CAMPAIGN BRIEF (OVERRIDES YOUR DISCOVERY FLOW) ===',
    'The user has already provided these campaign details once via their Campaign Brief panel or a prior tool, and explicitly does NOT want to re-answer them per tool. These fields are AUTHORITATIVE and OVERRIDE the "ask exactly 4 questions" rule in your default system prompt.',
    '',
    'STRICT BEHAVIOR:',
    '1. Do NOT ask for: offer, target audience, tone, goal, or key benefit. Treat them as already answered.',
    '2. You MAY ask ONE consolidated question only if the brief is missing a field that is genuinely essential for THIS specific tool (e.g. landing-page style picker, lead-magnet format, squeeze-page urgency element, story-sequence visual style + frame count, DM platform). Bundle multiple tool-specific unknowns into a single question with grouped options — never ask them sequentially.',
    '3. If the brief is rich enough to generate well, generate immediately without asking anything. Do not be cautious; the user explicitly chose to bypass discovery.',
    '',
    'Brief:',
    ...lines,
    '=== END BRIEF ===',
  ].join('\n');
}
