// Server-side context loader — loads all business data for the CEO orchestrator
import { supabase } from './storage.js';

export async function loadUserContext(userId) {
  if (!userId || userId === 'anonymous') {
    return { brandDna: null, contentItems: [], salesData: null, products: [], contacts: [], outlierData: null, integrationCtx: '', soulNotes: [] };
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
    supabase.from('integration_data').select('provider, data').eq('user_id', userId),
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

  return { brandDna, contentItems, salesData, products, contacts, outlierData, integrationCtx, soulNotes, activeIntegrations, emailAccounts };
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
