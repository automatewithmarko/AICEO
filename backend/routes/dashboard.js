// Dashboard stats — rebuilt 2026-07-28 (audit: docs + founder directive).
// Every number now reads the table that actually holds the truth:
//   revenue     → integration_data payments + manual_sales (NOT the dead
//                 `sales` table, which nothing writes — it was always $0)
//   published   → social_posts WHERE status='published' (drafts/scheduled
//                 no longer count), grouped platform × normalized type
//   generated   → generated_content ledger (real pieces, not chat rows)
//   + upcoming schedule, failed posts, credit spend — the surfaces a
//   CMO/CFO/seller actually acts on.
import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { normalizeContentType } from '../services/generated-content.js';

const router = Router();

const PLATFORMS = ['instagram', 'linkedin', 'facebook', 'x', 'tiktok', 'youtube'];

function getTimeframeRange(timeframe, from, to, tzOffsetMin) {
  // tz_offset = JS getTimezoneOffset() minutes (UTC minus local). All
  // preset windows anchor to the USER's local midnight — the server runs
  // UTC, so without this a +05:00 founder's "today" started at 5am local
  // and week/month counts never matched what they remembered doing.
  const off = Number.isFinite(Number(tzOffsetMin)) ? Number(tzOffsetMin) : 0;
  if (timeframe === 'custom') {
    let since = null;
    let until = null;
    if (from) {
      const d = new Date(from);
      // Bare dates are the user's LOCAL days.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(from))) d.setTime(d.getTime() + off * 60_000);
      since = d.toISOString();
    }
    if (to) {
      const d = new Date(to);
      // Include the ENTIRE final local day — bare dates parse to
      // T00:00:00Z and silently excluded the range's last day (audit C).
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
        d.setUTCHours(23, 59, 59, 999);
        d.setTime(d.getTime() + off * 60_000);
      }
      until = d.toISOString();
    }
    return { since, until };
  }
  if (timeframe === 'all') return { since: null, until: null };
  // User-local midnight of TODAY, expressed in UTC.
  const shifted = new Date(Date.now() - off * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  const localMidnightUtc = shifted.getTime() + off * 60_000;
  const DAY = 86_400_000;
  const backDays = timeframe === 'today' ? 0 : (timeframe === 'month' ? 29 : 6);
  return { since: new Date(localMidnightUtc - backDays * DAY).toISOString(), until: null };
}

function emptyPlatformMap() {
  return Object.fromEntries(PLATFORMS.map((p) => [p, { total: 0, byType: {} }]));
}

function addToPlatformMap(map, platform, type) {
  const p = String(platform || '').toLowerCase();
  if (!(p in map)) return;
  map[p].total += 1;
  const t = normalizeContentType(type);
  map[p].byType[t] = (map[p].byType[t] || 0) + 1;
}

// Continuous time series (no x-axis gaps). 'today' → hourly, else daily.
function bucketTimeSeries(points, { since, until, granularity }) {
  const addHour = (d) => { d.setHours(d.getHours() + 1, 0, 0, 0); };
  const addDay = (d) => { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); };
  const keyOf = granularity === 'hour'
    ? (d) => d.toISOString().slice(0, 13) + ':00'
    : (d) => d.toISOString().slice(0, 10);
  const step = granularity === 'hour' ? addHour : addDay;

  const times = points.map((p) => p.ts).filter(Boolean);
  const startMs = since ? new Date(since).getTime() : (times.length ? Math.min(...times) : Date.now());
  const endMs = until ? new Date(until).getTime() : Date.now();

  const map = new Map();
  const cur = new Date(startMs);
  if (granularity === 'hour') cur.setMinutes(0, 0, 0);
  else cur.setHours(0, 0, 0, 0);
  let guard = 400;
  while (cur.getTime() <= endMs && guard-- > 0) {
    map.set(keyOf(cur), { date: keyOf(cur), value: 0 });
    step(cur);
  }
  for (const p of points) {
    if (!p.ts) continue;
    const key = keyOf(new Date(p.ts));
    // Rows beyond the 400-bucket guard are dropped rather than creating
    // orphan sparse buckets after a dense run (audit G).
    const bucket = map.get(key);
    if (bucket) bucket.value += p.value;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Payment rows → { ts(ms), value(dollars) }. metadata.amount is CENTS;
// metadata.created is unix SECONDS (Stripe convention, same handling as
// routes/sales.js dateFormat).
function paymentPoint(row) {
  const meta = row.metadata || {};
  const created = meta.created ? Number(meta.created) * 1000 : new Date(row.synced_at).getTime();
  return { ts: created, value: (Number(meta.amount) || 0) / 100 };
}

// ── GET /api/dashboard-stats?timeframe=today|week|month|all|custom ──
router.get('/api/dashboard-stats', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  const timeframe = ['today', 'week', 'month', 'all', 'custom'].includes(req.query.timeframe)
    ? req.query.timeframe
    : 'week';
  const { since, until } = getTimeframeRange(timeframe, req.query.from, req.query.to, req.query.tz_offset);

  const inRange = (q, col) => {
    let out = q;
    if (since) out = out.gte(col, since);
    if (until) out = out.lte(col, until);
    return out;
  };

  try {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400_000).toISOString();
    const [
      contactsRes, paymentsRes, manualSalesRes, sentEmailsRes,
      generatedRes, publishedRes, scheduledRes, failedRes, creditsRes, sessionsRes,
    ] = await Promise.all([
      inRange(supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId), 'created_at'),
      supabase.from('integration_data').select('metadata, synced_at').eq('user_id', userId).eq('data_type', 'payment'),
      supabase.from('manual_sales').select('amount, sold_at').eq('user_id', userId),
      inRange(supabase.from('emails').select('to_emails, date').eq('user_id', userId).eq('folder', 'sent'), 'date'),
      inRange(supabase.from('generated_content').select('platform, content_type, created_at').eq('user_id', userId), 'created_at'),
      inRange(
        supabase.from('social_posts').select('platform, content_type, published_at').eq('user_id', userId).eq('status', 'published'),
        'published_at'
      ),
      supabase.from('social_posts')
        .select('id, platform, content_type, caption, scheduled_at, thumbnail_url')
        .eq('user_id', userId).eq('status', 'scheduled')
        .gte('scheduled_at', now.toISOString()).lte('scheduled_at', in7d)
        .order('scheduled_at', { ascending: true }).limit(10),
      supabase.from('social_posts')
        .select('id, platform, content_type, caption, last_error, scheduled_at')
        .eq('user_id', userId).eq('status', 'failed')
        .order('scheduled_at', { ascending: false }).limit(5),
      inRange(supabase.from('credit_transactions').select('amount, reason, created_at').eq('user_id', userId).lt('amount', 0), 'created_at'),
      inRange(supabase.from('content_sessions').select('platform, created_at').eq('user_id', userId), 'created_at'),
    ]);

    // ── Revenue: payments (cents→dollars) + manual sales, range-filtered ──
    const sinceMs = since ? new Date(since).getTime() : null;
    const untilMs = until ? new Date(until).getTime() : null;
    const inMsRange = (ts) => (sinceMs === null || ts >= sinceMs) && (untilMs === null || ts <= untilMs);
    const payPoints = (paymentsRes.data || []).map(paymentPoint).filter((p) => inMsRange(p.ts));
    const manualPoints = (manualSalesRes.data || [])
      .map((m) => ({ ts: new Date(m.sold_at).getTime(), value: (Number(m.amount) || 0) / 100 }))
      .filter((p) => p.ts && inMsRange(p.ts));
    const revenuePoints = [...payPoints, ...manualPoints];
    const revenueGenerated = Math.round(revenuePoints.reduce((s, p) => s + p.value, 0) * 100) / 100;

    const sentEmails = sentEmailsRes.data || [];
    const newslettersSent = sentEmails.filter((e) => Array.isArray(e.to_emails) && e.to_emails.length >= 2).length;

    // ── Content: generated (ledger) + published (real publishes only) ──
    const contentGenerated = emptyPlatformMap();
    for (const row of (generatedRes.error ? [] : generatedRes.data || [])) {
      addToPlatformMap(contentGenerated, row.platform, row.content_type);
    }
    const contentPublished = emptyPlatformMap();
    for (const row of (publishedRes.error ? [] : publishedRes.data || [])) {
      addToPlatformMap(contentPublished, row.platform, row.content_type);
    }
    // Legacy compat: flat totals per platform (the old response shape).
    const flatten = (m) => Object.fromEntries(Object.entries(m).map(([p, v]) => [p, v.total]));

    const granularity = timeframe === 'today' ? 'hour' : 'day';
    const revenueSeries = bucketTimeSeries(revenuePoints, { since, until, granularity });

    const creditsSpent = (creditsRes.error ? [] : creditsRes.data || [])
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

    res.json({
      timeframe,
      granularity,
      new_contacts: contactsRes.count || 0,
      revenue_generated: revenueGenerated,
      emails_sent: sentEmails.length,
      newsletters_sent: newslettersSent,
      // New shape: { platform: { total, byType: { text_post: n, ... } } }
      content_generated: contentGenerated,
      content_published_detail: contentPublished,
      // Old flat shape kept so nothing breaks mid-deploy.
      content_created: flatten(contentGenerated),
      content_published: flatten(contentPublished),
      chats_started: (sessionsRes.data || []).length,
      revenue_series: revenueSeries,
      upcoming_posts: scheduledRes.error ? [] : (scheduledRes.data || []).map((p) => ({
        id: p.id, platform: p.platform, content_type: normalizeContentType(p.content_type),
        caption: String(p.caption || '').slice(0, 120), scheduled_at: p.scheduled_at, thumbnail_url: p.thumbnail_url || null,
      })),
      failed_posts: failedRes.error ? [] : (failedRes.data || []).map((p) => ({
        id: p.id, platform: p.platform, content_type: normalizeContentType(p.content_type),
        caption: String(p.caption || '').slice(0, 120), error: String(p.last_error || '').slice(0, 160), scheduled_at: p.scheduled_at,
      })),
      credits_spent: creditsSpent,
    });
  } catch (err) {
    console.error('[dashboard-stats] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
