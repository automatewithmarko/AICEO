import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x'];

function getTimeframeStart(timeframe) {
  const d = new Date();
  switch (timeframe) {
    case 'month': d.setMonth(d.getMonth() - 1); break;
    case 'year':  d.setFullYear(d.getFullYear() - 1); break;
    case 'week':
    default:      d.setDate(d.getDate() - 7); break;
  }
  return d.toISOString();
}

function groupByPlatform(rows, platformField) {
  const out = Object.fromEntries(PLATFORMS.map((p) => [p, 0]));
  for (const row of rows) {
    const p = String(row[platformField] || '').toLowerCase();
    if (p in out) out[p] += 1;
  }
  return out;
}

// ── GET /api/dashboard-stats?timeframe=week|month|year ──
router.get('/api/dashboard-stats', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  const timeframe = ['week', 'month', 'year'].includes(req.query.timeframe)
    ? req.query.timeframe
    : 'week';
  const since = getTimeframeStart(timeframe);

  try {
    const [contactsRes, salesRes, sentEmailsRes, contentCreatedRes, socialPostsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase
        .from('sales')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase
        .from('emails')
        .select('to_emails, date')
        .eq('user_id', userId)
        .eq('folder', 'sent')
        .gte('date', since),
      supabase
        .from('content_sessions')
        .select('platform, created_at')
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase
        .from('social_posts')
        .select('platform, published_at')
        .eq('user_id', userId)
        .gte('published_at', since),
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

    res.json({
      timeframe,
      new_contacts: newContacts,
      revenue_generated: revenueGenerated,
      emails_sent: emailsSent,
      newsletters_sent: newslettersSent,
      content_created: contentCreated,
      content_published: contentPublished,
    });
  } catch (err) {
    console.error('[dashboard-stats] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
