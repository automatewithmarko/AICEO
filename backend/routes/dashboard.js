import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x'];

function getTimeframeRange(timeframe, from, to) {
  if (timeframe === 'custom') {
    return {
      since: from ? new Date(from).toISOString() : null,
      until: to ? new Date(to).toISOString() : null,
    };
  }
  const d = new Date();
  switch (timeframe) {
    case 'today': d.setHours(0, 0, 0, 0); break;
    case 'month': d.setMonth(d.getMonth() - 1); break;
    case 'all':   return { since: null, until: null };
    case 'week':
    default:      d.setDate(d.getDate() - 7); break;
  }
  return { since: d.toISOString(), until: null };
}

function groupByPlatform(rows, platformField) {
  const out = Object.fromEntries(PLATFORMS.map((p) => [p, 0]));
  for (const row of rows) {
    const p = String(row[platformField] || '').toLowerCase();
    if (p in out) out[p] += 1;
  }
  return out;
}

// Bucket rows into a continuous time series so the chart x-axis never has
// gaps. Granularity is picked from the timeframe: 'today' → hourly, anything
// longer → daily. Value is summed per bucket (set valueField = null to count
// rows instead).
function bucketTimeSeries(rows, { timestampField, valueField, since, until, granularity }) {
  const addHour = (d) => { d.setHours(d.getHours() + 1, 0, 0, 0); };
  const addDay = (d) => { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); };
  const keyOf = granularity === 'hour'
    ? (d) => d.toISOString().slice(0, 13) + ':00'
    : (d) => d.toISOString().slice(0, 10);
  const step = granularity === 'hour' ? addHour : addDay;

  // Establish the window start/end — fall back to the row range if no bound.
  const rowTimes = rows
    .map((r) => r[timestampField])
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  const startMs = since
    ? new Date(since).getTime()
    : (rowTimes.length ? Math.min(...rowTimes) : Date.now());
  const endMs = until ? new Date(until).getTime() : Date.now();

  const map = new Map();
  const cur = new Date(startMs);
  if (granularity === 'hour') cur.setMinutes(0, 0, 0);
  else cur.setHours(0, 0, 0, 0);
  // Safety cap at 400 buckets so "all" on a long history doesn't explode.
  let guard = 400;
  while (cur.getTime() <= endMs && guard-- > 0) {
    map.set(keyOf(cur), { date: keyOf(cur), value: 0 });
    step(cur);
  }

  for (const row of rows) {
    const t = row[timestampField];
    if (!t) continue;
    const key = keyOf(new Date(t));
    const bucket = map.get(key) || { date: key, value: 0 };
    bucket.value += valueField ? (Number(row[valueField]) || 0) : 1;
    map.set(key, bucket);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── GET /api/dashboard-stats?timeframe=week|month|year ──
router.get('/api/dashboard-stats', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  const timeframe = ['today', 'week', 'month', 'all', 'custom'].includes(req.query.timeframe)
    ? req.query.timeframe
    : 'week';
  const { since, until } = getTimeframeRange(timeframe, req.query.from, req.query.to);

  // Helper: apply a createdAt column range onto a query builder. Null bounds
  // mean "unbounded" so "All" includes rows that have null timestamps too.
  const inRange = (q, col) => {
    let out = q;
    if (since) out = out.gte(col, since);
    if (until) out = out.lte(col, until);
    return out;
  };

  try {
    const [contactsRes, salesRes, sentEmailsRes, contentCreatedRes, socialPostsRes] = await Promise.all([
      inRange(
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        'created_at'
      ),
      inRange(
        supabase.from('sales').select('amount, created_at').eq('user_id', userId),
        'created_at'
      ),
      inRange(
        supabase.from('emails').select('to_emails, date').eq('user_id', userId).eq('folder', 'sent'),
        'date'
      ),
      inRange(
        supabase.from('content_sessions').select('platform, created_at').eq('user_id', userId),
        'created_at'
      ),
      inRange(
        supabase.from('social_posts').select('platform, published_at').eq('user_id', userId),
        'published_at'
      ),
    ]);

    const newContacts = contactsRes.count || 0;

    const revenueGenerated = (salesRes.data || []).reduce(
      (sum, s) => sum + (Number(s.amount) || 0),
      0
    );

    const sentEmails = sentEmailsRes.data || [];
    const emailsSent = sentEmails.length;
    const newslettersSent = sentEmails.filter(
      (e) => Array.isArray(e.to_emails) && e.to_emails.length >= 2
    ).length;

    const contentCreated = groupByPlatform(contentCreatedRes.data || [], 'platform');
    // social_posts table may not exist yet until migration is applied — treat as empty.
    const socialPostsRows = socialPostsRes.error ? [] : (socialPostsRes.data || []);
    const contentPublished = groupByPlatform(socialPostsRows, 'platform');

    // Time-series for the revenue chart. Hourly for "today", daily otherwise.
    const granularity = timeframe === 'today' ? 'hour' : 'day';
    const revenueSeries = bucketTimeSeries(salesRes.data || [], {
      timestampField: 'created_at',
      valueField: 'amount',
      since,
      until,
      granularity,
    });

    res.json({
      timeframe,
      granularity,
      new_contacts: newContacts,
      revenue_generated: revenueGenerated,
      emails_sent: emailsSent,
      newsletters_sent: newslettersSent,
      content_created: contentCreated,
      content_published: contentPublished,
      revenue_series: revenueSeries,
    });
  } catch (err) {
    console.error('[dashboard-stats] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
