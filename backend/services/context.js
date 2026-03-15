// Server-side context loader — loads all business data for the CEO orchestrator
import { supabase } from './storage.js';

export async function loadUserContext(userId) {
  if (!userId || userId === 'anonymous') {
    return { brandDna: null, contentItems: [], salesData: null, products: [], contacts: [], outlierData: null, revenueAnalytics: null, soulNotes: [] };
  }

  // Parallel fetch all context data (including soul notes + active integrations)
  const [brandRes, contentRes, statsRes, revenueRes, callsRes, productsRes, contactsRes, creatorsRes, videosRes, integrationRes, soulRes, integrationsRes, emailAccRes] = await Promise.allSettled([
    supabase.from('brand_dna').select('*').eq('user_id', userId).single(),
    supabase.from('content_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('sales').select('amount, created_at').eq('user_id', userId),
    supabase.from('sales').select('amount, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('sales_calls').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('products').select('*').eq('user_id', userId),
    supabase.from('contacts').select('*').eq('user_id', userId).limit(50),
    supabase.from('outlier_creators').select('*').eq('user_id', userId),
    supabase.from('outlier_videos').select('*, outlier_creators!inner(username, display_name, avatar_url, platform, avg_views)').eq('user_id', userId).eq('is_outlier', true).order('views_multiplier', { ascending: false }).limit(15),
    supabase.from('integration_data').select('provider, data_type, title, metadata, synced_at').eq('user_id', userId),
    supabase.from('soul_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('integrations').select('provider, is_active, metadata, last_synced_at').eq('user_id', userId),
    supabase.from('email_accounts').select('id, email, provider, display_name, is_active').eq('user_id', userId),
  ]);

  const brandDna = brandRes.status === 'fulfilled' ? brandRes.value.data : null;
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

  // Compute revenue analytics from integration data
  const integrationRows = integrationRes.status === 'fulfilled' ? (integrationRes.value.data || []) : [];
  const revenueAnalytics = computeRevenueAnalytics(integrationRows);

  // Active integrations & email accounts
  const activeIntegrations = integrationsRes.status === 'fulfilled' ? (integrationsRes.value.data || []) : [];
  const emailAccounts = emailAccRes.status === 'fulfilled' ? (emailAccRes.value.data || []) : [];

  return { brandDna, contentItems, salesData, products, contacts, outlierData, revenueAnalytics, soulNotes, activeIntegrations, emailAccounts };
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

// Compute revenue analytics from integration_data rows
function computeRevenueAnalytics(rows) {
  if (!rows.length) return null;

  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);

  const payments = rows.filter(r => r.data_type === 'payment');
  const subscriptions = rows.filter(r => r.data_type === 'subscription');
  const customers = rows.filter(r => r.data_type === 'customer');
  const memberships = rows.filter(r => r.data_type === 'membership');

  const getTimestamp = (p) => {
    const created = p.metadata?.created;
    if (!created) return new Date(p.synced_at).getTime();
    return typeof created === 'number' && created < 1e12 ? created * 1000 : new Date(created).getTime();
  };

  // Revenue from succeeded payments
  const succeededPayments = payments.filter(p => p.metadata?.status === 'succeeded');
  const totalRevenue = succeededPayments.reduce((sum, p) => sum + ((p.metadata?.amount || 0) / 100), 0);

  // Last 30 days revenue + growth
  const recentPayments = succeededPayments.filter(p => getTimestamp(p) >= thirtyDaysAgo);
  const revenueLast30 = recentPayments.reduce((sum, p) => sum + ((p.metadata?.amount || 0) / 100), 0);

  const prevPeriodPayments = succeededPayments.filter(p => {
    const ts = getTimestamp(p);
    return ts >= sixtyDaysAgo && ts < thirtyDaysAgo;
  });
  const revenuePrev30 = prevPeriodPayments.reduce((sum, p) => sum + ((p.metadata?.amount || 0) / 100), 0);

  let growthPct = null;
  if (revenuePrev30 > 0) {
    growthPct = Math.round(((revenueLast30 - revenuePrev30) / revenuePrev30) * 100);
  }

  // MRR from active subscriptions
  const activeSubscriptions = subscriptions.filter(s =>
    s.metadata?.status === 'active' || s.metadata?.status === 'trialing'
  );
  let mrr = 0;
  for (const sub of activeSubscriptions) {
    const amount = (sub.metadata?.amount || 0) / 100;
    const interval = sub.metadata?.interval || 'month';
    if (interval === 'year') mrr += amount / 12;
    else if (interval === 'week') mrr += amount * 4.33;
    else mrr += amount;
  }

  // Per-provider revenue breakdown
  const providerRevenue = {};
  for (const p of succeededPayments) {
    providerRevenue[p.provider] = (providerRevenue[p.provider] || 0) + ((p.metadata?.amount || 0) / 100);
  }

  // Last 5 transactions
  const recentTxns = succeededPayments
    .sort((a, b) => getTimestamp(b) - getTimestamp(a))
    .slice(0, 5)
    .map(p => ({
      title: p.title,
      amount: (p.metadata?.amount || 0) / 100,
      provider: p.provider,
    }));

  // Whop memberships
  const activeMemberships = memberships.filter(m =>
    m.metadata?.status === 'active' || m.metadata?.status === 'completed'
  );

  return {
    totalRevenue: Math.round(totalRevenue),
    revenueLast30: Math.round(revenueLast30),
    growthPct,
    mrr: Math.round(mrr),
    activeSubscriptions: activeSubscriptions.length,
    totalCustomers: customers.length,
    activeMemberships: activeMemberships.length,
    providerRevenue,
    recentTxns,
  };
}
