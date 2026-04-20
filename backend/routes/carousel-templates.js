import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

// ─── List user's saved carousel design-system templates ───
router.get('/api/carousel-templates', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ templates: [] });

  const { data, error } = await supabase
    .from('carousel_templates')
    .select('id, name, design_system, preview_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ templates: data || [] });
});

// ─── Save a new template from a locked design system ───
router.post('/api/carousel-templates', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { name, design_system, preview_url } = req.body || {};
  if (!name || !design_system) {
    return res.status(400).json({ error: 'name and design_system required' });
  }

  const { data, error } = await supabase
    .from('carousel_templates')
    .insert({
      user_id: userId,
      name: String(name).slice(0, 120),
      design_system,
      preview_url: preview_url || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ template: data });
});

// ─── Delete a template ───
router.delete('/api/carousel-templates/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('carousel_templates')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
