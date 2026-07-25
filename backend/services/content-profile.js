// Auto-synced "how this user actually posts" profile (founder ask,
// 2026-07-25): when BooSend (Instagram) and/or LinkedIn are connected, the
// backend should ALREADY KNOW what kind of content the user publishes —
// formats, cadence, caption style, topic lanes — without the user ever
// being asked.
//
// Sources:
//   - Instagram: BooSend automation API `GET /api/publishing/instagram/media`
//     (added 2026-07-25) — reads the last N posts of every connected IG
//     account via Meta Graph. Aggregated deterministically (no LLM) and
//     cached in integration_data (data_type 'content_profile').
//   - LinkedIn: the member-posts read scope (r_member_social) is
//     restricted by LinkedIn, so the honest signal is what the user has
//     published THROUGH AICEO — social_posts rows. Computed live (cheap).
//
// Consumption: getContentProfileBlock(userId, platformId) returns a
// compact prompt block (≤ ~1K chars). Stale-while-revalidate: reads are
// one DB query; a stale/missing IG profile kicks a background refresh and
// the current turn uses whatever exists.

import { supabase } from './storage.js';

const BOOSEND_API = 'https://boosend-automation-api-production.up.railway.app';
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // refresh at most daily
const MEDIA_SAMPLE = 25;
const MAX_ACCOUNTS = 3;

// ─── Instagram sync (BooSend) ────────────────────────────────────────────

function classifyIgMedia(item) {
  if (item?.media_product_type === 'REELS') return 'reel';
  if (item?.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (item?.media_type === 'VIDEO') return 'reel';
  return 'image';
}

function firstLine(text, cap = 110) {
  const line = String(text || '').split('\n').find((l) => l.trim()) || '';
  return line.length > cap ? `${line.slice(0, cap)}…` : line;
}

function aggregateIgMedia(username, media) {
  const counts = { reel: 0, carousel: 0, image: 0 };
  let captionChars = 0;
  let withHashtags = 0;
  let top = null;
  for (const item of media) {
    counts[classifyIgMedia(item)] += 1;
    const cap = String(item.caption || '');
    captionChars += cap.length;
    if (cap.includes('#')) withHashtags += 1;
    if ((item.like_count || 0) >= (top?.like_count || 0)) top = item;
  }
  const total = media.length;
  // Cadence from the sampled window: posts per week across the span
  // between oldest and newest sampled post.
  let perWeek = null;
  if (total >= 2) {
    const times = media.map((i) => Date.parse(i.timestamp)).filter(Number.isFinite);
    const spanMs = Math.max(...times) - Math.min(...times);
    if (spanMs > 0) perWeek = total / (spanMs / (7 * 24 * 60 * 60 * 1000));
  }
  return {
    username,
    total,
    counts,
    perWeek: perWeek ? Number(perWeek.toFixed(1)) : null,
    avgCaptionLen: total ? Math.round(captionChars / total) : 0,
    hashtagPosts: withHashtags,
    recentCaptions: media.slice(0, 3).map((i) => firstLine(i.caption)).filter(Boolean),
    topPost: top ? { caption: firstLine(top.caption), likes: top.like_count || 0, comments: top.comments_count || 0 } : null,
    lastPostAt: media[0]?.timestamp || null,
  };
}

function igProfileToText(p) {
  const pct = (n) => (p.total ? Math.round((n / p.total) * 100) : 0);
  let s = `Instagram @${p.username} — last ${p.total} posts: ${p.counts.reel} reels (${pct(p.counts.reel)}%), ${p.counts.carousel} carousels (${pct(p.counts.carousel)}%), ${p.counts.image} single images (${pct(p.counts.image)}%)`;
  if (p.perWeek) s += `; ≈${p.perWeek} posts/week`;
  s += `; avg caption ${p.avgCaptionLen} chars; hashtags on ${p.hashtagPosts}/${p.total} posts.`;
  if (p.lastPostAt) {
    const d = new Date(p.lastPostAt);
    if (!Number.isNaN(d.getTime())) s += ` Most recent post: ${d.toISOString().slice(0, 10)}.`;
  }
  if (p.recentCaptions.length) s += `\nRecent captions (newest first): ${p.recentCaptions.map((c) => `"${c}"`).join(' | ')}`;
  if (p.topPost?.caption) s += `\nTop performer: "${p.topPost.caption}" (${p.topPost.likes} likes, ${p.topPost.comments} comments)`;
  return s;
}

// One in-flight sync per user so a burst of chat turns can't stampede
// BooSend / the Graph API.
const inflight = new Map();

export async function syncInstagramContentProfile(userId) {
  if (inflight.has(userId)) return inflight.get(userId);
  const job = (async () => {
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, api_key')
      .eq('user_id', userId)
      .eq('provider', 'boosend')
      .eq('is_active', true)
      .single();
    if (!integration?.api_key) return { synced: 0, skipped: 'boosend not connected' };

    const headers = { 'x-api-key': integration.api_key, 'Content-Type': 'application/json' };
    const acctRes = await fetch(`${BOOSEND_API}/api/publishing/instagram/accounts`, { headers });
    if (!acctRes.ok) throw new Error(`BooSend accounts HTTP ${acctRes.status}`);
    const accounts = (await acctRes.json())?.accounts || [];

    let synced = 0;
    for (const account of accounts.slice(0, MAX_ACCOUNTS)) {
      const url = new URL('/api/publishing/instagram/media', BOOSEND_API);
      url.searchParams.set('instagram_account_id', account.id);
      url.searchParams.set('limit', String(MEDIA_SAMPLE));
      const mediaRes = await fetch(url.toString(), { headers });
      const mediaData = await mediaRes.json().catch(() => ({}));
      if (!mediaRes.ok || !mediaData?.success) {
        console.warn(`[content-profile] IG media fetch failed for @${account.username}: ${mediaData?.error || mediaRes.status}`);
        continue;
      }
      const profile = aggregateIgMedia(account.username || mediaData.username, mediaData.media || []);
      const { error } = await supabase.from('integration_data').upsert({
        user_id: userId,
        integration_id: integration.id,
        provider: 'boosend',
        data_type: 'content_profile',
        external_id: `ig_profile_${account.id}`,
        title: `IG content profile @${profile.username}`,
        content: igProfileToText(profile),
        metadata: profile,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
      if (error) console.warn(`[content-profile] upsert failed: ${error.message}`);
      else synced += 1;
    }
    console.log(`[content-profile] IG profile synced for user ${userId.slice(0, 8)}: ${synced} account(s)`);
    return { synced };
  })().finally(() => inflight.delete(userId));
  inflight.set(userId, job);
  return job;
}

// ─── LinkedIn (derived from posts published through AICEO) ──────────────

async function linkedinProfileText(userId) {
  const { data: posts } = await supabase
    .from('social_posts')
    .select('caption, content_type, published_at')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);
  if (!posts?.length) return null;
  const types = {};
  for (const p of posts) {
    const t = p.content_type || 'text post';
    types[t] = (types[t] || 0) + 1;
  }
  const typeStr = Object.entries(types).map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`).join(', ');
  const recent = posts.slice(0, 2).map((p) => `"${firstLine(p.caption, 90)}"`).filter((s) => s !== '""');
  let s = `LinkedIn (published via AICEO, last ${posts.length}): ${typeStr}.`;
  if (recent.length) s += ` Recent: ${recent.join(' | ')}`;
  return s;
}

// Upcoming scheduled posts (the content calendar) — lets both chats
// answer "what do I have scheduled?" and plan around existing slots
// instead of double-booking days (founder ask 2026-07-26).
async function scheduledPostsText(userId, platformId = null) {
  let q = supabase
    .from('social_posts')
    .select('platform, caption, content_type, scheduled_at')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);
  if (platformId) q = q.eq('platform', platformId);
  const { data: posts } = await q;
  if (!posts?.length) return null;
  const lines = posts.map((p) => {
    const when = p.scheduled_at ? String(p.scheduled_at).replace('T', ' ').slice(0, 16) + ' UTC' : '?';
    return `- [${p.platform || '?'}] ${when}${p.content_type ? ` (${p.content_type})` : ''}: "${firstLine(p.caption, 70)}"`;
  });
  return `UPCOMING SCHEDULED POSTS (${posts.length} on the calendar — do not double-book these slots; reference them when planning):\n${lines.join('\n')}`;
}

// Recent posts published THROUGH AICEO, all platforms, with dates — lets
// the CEO answer "when was my last post" for anything shipped from here.
async function aiceoPublishedPostsText(userId) {
  const { data: posts } = await supabase
    .from('social_posts')
    .select('platform, caption, content_type, published_at')
    .eq('user_id', userId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(8);
  if (!posts?.length) return null;
  const lines = posts.map((p) => {
    const date = p.published_at ? String(p.published_at).slice(0, 10) : 'unknown date';
    return `- [${p.platform || '?'}] ${date}${p.content_type ? ` (${p.content_type})` : ''}: "${firstLine(p.caption, 80)}"`;
  });
  return `Posts published through AICEO (newest first):\n${lines.join('\n')}`;
}

// ─── Prompt block ────────────────────────────────────────────────────────

export async function getContentProfileBlock(userId, platformId = null) {
  const parts = [];

  if (!platformId || platformId === 'instagram') {
    const { data: rows } = await supabase
      .from('integration_data')
      .select('content, synced_at')
      .eq('user_id', userId)
      .eq('data_type', 'content_profile')
      .order('synced_at', { ascending: false });
    const fresh = rows?.filter((r) => r.content) || [];
    for (const r of fresh.slice(0, MAX_ACCOUNTS)) parts.push(r.content);
    const newest = fresh[0]?.synced_at ? Date.parse(fresh[0].synced_at) : 0;
    if (!fresh.length || Date.now() - newest > PROFILE_TTL_MS) {
      // Stale-while-revalidate — never block the chat turn on Meta.
      syncInstagramContentProfile(userId).catch((err) =>
        console.warn(`[content-profile] background IG sync failed: ${err.message}`));
    }
  }

  if (!platformId || platformId === 'linkedin') {
    try {
      const li = await linkedinProfileText(userId);
      if (li) parts.push(li);
    } catch { /* derived signal only — never break the turn */ }
  }

  // CEO surface (no platform pinned): include the cross-platform list of
  // posts published through AICEO, with dates.
  if (!platformId) {
    try {
      const published = await aiceoPublishedPostsText(userId);
      if (published) parts.push(published);
    } catch { /* derived signal only — never break the turn */ }
  }

  // Upcoming calendar — platform-scoped on /Content, everything for the
  // CEO. Both chats can now answer "what do I have scheduled?".
  try {
    const upcoming = await scheduledPostsText(userId, platformId);
    if (upcoming) parts.push(upcoming);
  } catch { /* derived signal only — never break the turn */ }

  if (!parts.length) return '';
  return `\n\n=== HOW THIS USER ACTUALLY POSTS (auto-synced from their connected accounts — you DO have this visibility) ===\n`
    + parts.join('\n')
    + `\nUse this data confidently: you CAN tell the user what they post, how often, their recent captions, their top performer, when their most recent post went out (refreshed roughly daily), and what's scheduled on their content calendar. Never claim you have "no access" to their posts or schedule while this block is present. When they don't specify a format or topic, default to the formats and topic lanes they already publish — do NOT ask.\n`;
}
