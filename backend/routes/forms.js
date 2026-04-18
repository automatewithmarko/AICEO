import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

// ─── List user's forms ───
router.get('/api/forms', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ forms: [] });

  const { data, error } = await supabase
    .from('forms')
    .select('id, title, slug, status, theme, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Get response counts per form
  const formIds = data.map((f) => f.id);
  let responseCounts = {};
  if (formIds.length > 0) {
    const { data: counts } = await supabase
      .from('form_responses')
      .select('form_id')
      .in('form_id', formIds);
    if (counts) {
      for (const row of counts) {
        responseCounts[row.form_id] = (responseCounts[row.form_id] || 0) + 1;
      }
    }
  }

  const forms = data.map((f) => ({ ...f, responseCount: responseCounts[f.id] || 0 }));
  res.json({ forms });
});

// ─── Create form ───
router.post('/api/forms', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { title } = req.body;
  const formTitle = title || 'Untitled Form';
  const baseSlug = formTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';

  // Generate unique slug
  const { data: slugResult } = await supabase.rpc('generate_form_slug', { base_slug: baseSlug, uid: userId });
  const slug = slugResult || `${baseSlug}-${Date.now()}`;

  const { data, error } = await supabase
    .from('forms')
    .insert({ user_id: userId, title: formTitle, slug, questions: [], status: 'draft', theme: 'minimal' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ form: data });
});

// ─── Get published form (public, no auth) ───
router.get('/api/forms/public/:slug', async (req, res) => {
  const { data, error } = await supabase
    .from('forms')
    .select('id, title, description, slug, theme, questions, thank_you_message')
    .eq('slug', req.params.slug)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Form not found' });

  // Get branching rules
  const { data: rules } = await supabase
    .from('form_branching_rules')
    .select('question_id, answer_value, target_question_id')
    .eq('form_id', data.id);

  res.json({ form: data, branchingRules: rules || [] });
});

// ─── Submit response (public, no auth) ───
router.post('/api/forms/public/:slug/submit', async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers object required' });

  // Look up form
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .select('id, user_id, title, questions, submission_tags')
    .eq('slug', req.params.slug)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();

  if (formErr || !form) return res.status(404).json({ error: 'Form not found' });

  // CRM auto-mapping
  let contactId = null;
  const questions = form.questions || [];
  let mappedEmail = null;
  let mappedPhone = null;
  let mappedFirstName = null;
  let mappedLastName = null;
  let mappedName = null;
  let mappedBusiness = null;
  let mappedSocials = { instagram: [], linkedin: [], x: [] };
  const unmappedAnswers = [];

  for (const q of questions) {
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') continue;
    const strVal = String(val).trim();

    // Explicit contact field types (highest priority)
    if (q.type === 'contact_email') { mappedEmail = strVal; }
    else if (q.type === 'contact_phone') { mappedPhone = strVal; }
    else if (q.type === 'contact_first_name') { mappedFirstName = strVal; }
    else if (q.type === 'contact_last_name') { mappedLastName = strVal; }
    else if (q.type === 'contact_full_name') { mappedName = strVal; }
    else if (q.type === 'contact_business') { mappedBusiness = strVal; }
    else if (q.type === 'contact_instagram') { mappedSocials.instagram = [strVal]; }
    else if (q.type === 'contact_linkedin') { mappedSocials.linkedin = [strVal]; }
    else if (q.type === 'contact_x') { mappedSocials.x = [strVal]; }
    // Fallback: generic email/phone types also map
    else if (q.type === 'email' && !mappedEmail) { mappedEmail = strVal; }
    else if (q.type === 'phone' && !mappedPhone) { mappedPhone = strVal; }
    else {
      const displayVal = Array.isArray(val) ? val.join(', ') : (typeof val === 'object' ? val.name || JSON.stringify(val) : strVal);
      unmappedAnswers.push(`- ${q.title}: ${displayVal}`);
    }
  }

  // Combine first + last name if full name wasn't provided
  if (!mappedName && (mappedFirstName || mappedLastName)) {
    mappedName = [mappedFirstName, mappedLastName].filter(Boolean).join(' ');
  }

  const submissionTags = Array.isArray(form.submission_tags) ? form.submission_tags.filter(t => typeof t === 'string' && t.trim()) : [];

  // Attempt CRM contact creation/update
  if (mappedEmail) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, notes, tags')
      .eq('user_id', form.user_id)
      .eq('email', mappedEmail)
      .maybeSingle();

    const noteBlock = unmappedAnswers.length > 0
      ? `\nForm: "${form.title}" (${new Date().toISOString().slice(0, 10)})\n${unmappedAnswers.join('\n')}`
      : '';

    const hasSocials = mappedSocials.instagram.length || mappedSocials.linkedin.length || mappedSocials.x.length;

    if (existing) {
      const updates = {};
      if (mappedPhone) updates.phone = mappedPhone;
      if (mappedName) updates.name = mappedName;
      if (mappedBusiness) updates.business = mappedBusiness;
      if (noteBlock) updates.notes = (existing.notes || '') + noteBlock;
      if (hasSocials) updates.socials = mappedSocials;
      if (submissionTags.length > 0) {
        const merged = [...new Set([...(existing.tags || []), ...submissionTags])];
        if (merged.length !== (existing.tags || []).length) updates.tags = merged;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('contacts').update(updates).eq('id', existing.id);
      }
      contactId = existing.id;
    } else {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          user_id: form.user_id,
          email: mappedEmail,
          phone: mappedPhone || '',
          name: mappedName || '',
          business: mappedBusiness || '',
          status: 'New Lead',
          tags: submissionTags,
          notes: noteBlock,
          socials: hasSocials ? mappedSocials : { instagram: [], linkedin: [], x: [] },
          source: 'form',
        })
        .select('id')
        .single();

      if (newContact) contactId = newContact.id;
    }
  }

  // Insert response
  const { data: response, error: insertErr } = await supabase
    .from('form_responses')
    .insert({ form_id: form.id, answers, contact_id: contactId })
    .select('id, submitted_at')
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });
  res.json({ ok: true, responseId: response.id });
});

// ─── Get form by ID (auth'd) ───
router.get('/api/forms/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Form not found' });
  res.json({ form: data });
});

// ─── Update form ───
router.put('/api/forms/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { title, description, slug, theme, questions, thank_you_message, submission_tags } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (slug !== undefined) updates.slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (theme !== undefined) updates.theme = theme;
  if (questions !== undefined) updates.questions = questions;
  if (thank_you_message !== undefined) updates.thank_you_message = thank_you_message;
  if (submission_tags !== undefined) {
    updates.submission_tags = Array.isArray(submission_tags)
      ? submission_tags.map(t => String(t).trim()).filter(Boolean)
      : [];
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  const { data, error } = await supabase
    .from('forms')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Form not found' });
  res.json({ form: data });
});

// ─── Delete form ───
router.delete('/api/forms/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Publish form ───
router.post('/api/forms/:id/publish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('forms')
    .update({ status: 'published' })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Form not found' });
  res.json({ form: data });
});

// ─── Unpublish form ───
router.post('/api/forms/:id/unpublish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('forms')
    .update({ status: 'draft' })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Form not found' });
  res.json({ form: data });
});

// ─── Export CSV (auth'd) — must be before /:id/responses ───
router.get('/api/forms/:id/responses/csv', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: form } = await supabase
    .from('forms')
    .select('id, questions')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { data: responses } = await supabase
    .from('form_responses')
    .select('answers, submitted_at')
    .eq('form_id', req.params.id)
    .order('submitted_at', { ascending: false });

  const questions = form.questions || [];
  const headers = ['Submitted', ...questions.map((q) => q.title || q.type)];

  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = (responses || []).map((r) => {
    const vals = [new Date(r.submitted_at).toISOString()];
    for (const q of questions) {
      const val = r.answers?.[q.id];
      if (Array.isArray(val)) vals.push(val.join('; '));
      else if (typeof val === 'object' && val !== null) vals.push(val.name || JSON.stringify(val));
      else vals.push(val ?? '');
    }
    return vals.map(escapeCSV).join(',');
  });

  const csv = [headers.map(escapeCSV).join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="responses.csv"`);
  res.send(csv);
});

// ─── List responses (auth'd) ───
router.get('/api/forms/:id/responses', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Verify form ownership
  const { data: form } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { data, error } = await supabase
    .from('form_responses')
    .select('id, answers, contact_id, submitted_at')
    .eq('form_id', req.params.id)
    .order('submitted_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ responses: data || [] });
});

// ─── Delete response (auth'd) ───
router.delete('/api/forms/:id/responses/:rid', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: form } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { error } = await supabase
    .from('form_responses')
    .delete()
    .eq('id', req.params.rid)
    .eq('form_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Get branching rules ───
router.get('/api/forms/:id/branching', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: form } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { data, error } = await supabase
    .from('form_branching_rules')
    .select('*')
    .eq('form_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ rules: data || [] });
});

// ─── Save branching rules (full replace) ───
router.put('/api/forms/:id/branching', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: form } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' });

  // Delete existing rules
  await supabase.from('form_branching_rules').delete().eq('form_id', req.params.id);

  // Insert new rules
  if (rules.length > 0) {
    const rows = rules.map((r) => ({
      form_id: req.params.id,
      question_id: r.question_id,
      answer_value: r.answer_value,
      target_question_id: r.target_question_id,
    }));

    const { error } = await supabase.from('form_branching_rules').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

export default router;
