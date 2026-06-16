import { Router } from 'express';
import { loadActiveBrief, upsertActiveBrief, clearActiveBrief } from '../services/context.js';

const router = Router();

// GET /api/marketing/brief — load the user's current active campaign
// brief, or { brief: null } if they don't have one yet. Used by the
// Marketing UI to populate the CampaignBriefCard on page mount.
router.get('/api/marketing/brief', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.json({ brief: null });
  const brief = await loadActiveBrief(userId);
  res.json({ brief });
});

// PUT /api/marketing/brief — upsert one or more fields on the active
// brief. Pass only the fields you want to change; the rest stay intact.
// Empty strings on a field clear that field (treated as "user removed it"),
// while undefined / missing keys leave the existing value alone.
router.put('/api/marketing/brief', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const body = req.body || {};
  const patch = {};
  for (const key of ['offer', 'audience', 'tone', 'goal', 'key_benefit']) {
    if (key in body) {
      const value = typeof body[key] === 'string' ? body[key].trim() : null;
      patch[key] = value || null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No brief fields provided' });
  }

  const brief = await upsertActiveBrief(userId, patch);
  if (!brief) return res.status(500).json({ error: 'Failed to save brief' });
  res.json({ brief });
});

// DELETE /api/marketing/brief — clear the active brief entirely. Used by
// the "New brief" / "Clear" action when the user is starting a fresh
// campaign and wants the agent to ask discovery questions again.
router.delete('/api/marketing/brief', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });
  await clearActiveBrief(userId);
  res.json({ ok: true });
});

export default router;
