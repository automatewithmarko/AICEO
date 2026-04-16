import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

// ── GET /api/artifact-versions?session_id=...&agent=... ──
// Lists versions for a session, most recent first. Content is excluded from
// the list response to keep the payload small — fetch by id when restoring.
router.get('/api/artifact-versions', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.json({ versions: [] });

  const sessionId = req.query.session_id;
  const agent = req.query.agent;

  let query = supabase
    .from('artifact_versions')
    .select('id, session_id, agent_name, message_id, version_number, summary, is_revert, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (sessionId) query = query.eq('session_id', sessionId);
  if (agent) query = query.eq('agent_name', agent);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ versions: data || [] });
});

// ── GET /api/artifact-versions/:id ──
// Returns one version with full content. Used for preview + restoration.
router.get('/api/artifact-versions/:id', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('artifact_versions')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Version not found' });
  res.json({ version: data });
});

// ── POST /api/artifact-versions/:id/restore ──
// Creates a new version pointing to the old content so history stays linear
// and the user can revert the revert.
router.post('/api/artifact-versions/:id/restore', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: src, error: fetchErr } = await supabase
    .from('artifact_versions')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();
  if (fetchErr || !src) return res.status(404).json({ error: 'Version not found' });

  const { data: latest } = await supabase
    .from('artifact_versions')
    .select('version_number')
    .eq('user_id', userId)
    .eq('session_id', src.session_id)
    .eq('agent_name', src.agent_name)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = ((latest?.[0]?.version_number) || 0) + 1;

  const { data: inserted, error: insertErr } = await supabase
    .from('artifact_versions')
    .insert({
      user_id: userId,
      session_id: src.session_id,
      agent_name: src.agent_name,
      message_id: src.message_id,
      version_number: nextVersion,
      content: src.content,
      summary: `Reverted to v${src.version_number}${src.summary ? ` — ${src.summary}` : ''}`,
      is_revert: true,
    })
    .select()
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });
  res.json({ version: inserted });
});

export default router;
