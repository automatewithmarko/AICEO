import { Router } from 'express';
import { supabase } from '../services/storage.js';

const router = Router();

// ─── Helper: escape a value for CSV ───
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ─── 1. GET /api/forms — List user's forms (with response counts) ───
router.get('/api/forms', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

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

// ─── 2. POST /api/forms — Create form (with slug generation via RPC) ───
router.post('/api/forms', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { title } = req.body;
  const formTitle = title || 'Untitled Form';
  const baseSlug = formTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';

  // Generate unique slug via RPC
  const { data: slugData, error: slugError } = await supabase
    .rpc('generate_form_slug', { base_slug: baseSlug, uid: userId });

  const slug = slugData || `${baseSlug}-${Date.now()}`;

  const { data, error } = await supabase
    .from('forms')
    .insert({
      user_id: userId,
      title: formTitle,
      slug,
      questions: [],
      theme: 'minimal',
      status: 'draft',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ form: data });
});

// ─── 8. GET /api/forms/public/:slug — Get published form + branching rules (NO auth) ───
// Must be defined BEFORE /:id routes to avoid slug being matched as an id
router.get('/api/forms/public/:slug', async (req, res) => {
  const { slug } = req.params;

  const { data: form, error } = await supabase
    .from('forms')
    .select('id, title, description, questions, theme, thank_you_message, status, user_id')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !form) return res.status(404).json({ error: 'Form not found or not published' });

  // Get branching rules
  const { data: branching } = await supabase
    .from('form_branching_rules')
    .select('*')
    .eq('form_id', form.id)
    .order('order_index', { ascending: true });

  res.json({ form, branching: branching || [] });
});

// ─── 9. POST /api/forms/public/:slug/submit — Submit response + CRM auto-mapping (NO auth) ───
router.post('/api/forms/public/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const { answers } = req.body; // Array of { question_id, question_title, question_type, answer }

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers array is required' });
  }

  // Fetch form
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id, title, user_id, questions, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found or not published' });

  // ─── CRM auto-mapping ───
  let mappedEmail = null;
  let mappedPhone = null;
  let mappedName = null;
  let mappedBusiness = null;
  const unmappedAnswers = [];

  for (const ans of answers) {
    const type = ans.question_type || '';
    const titleLower = (ans.question_title || '').toLowerCase();
    const value = ans.answer;

    if (type === 'email' && !mappedEmail) {
      mappedEmail = value;
    } else if (type === 'phone' && !mappedPhone) {
      mappedPhone = value;
    } else if (type === 'short_text' && titleLower.includes('name') && !mappedName) {
      mappedName = value;
    } else if (type === 'short_text' && (titleLower.includes('business') || titleLower.includes('company')) && !mappedBusiness) {
      mappedBusiness = value;
    } else {
      unmappedAnswers.push(ans);
    }
  }

  // Also treat email/phone/name/business as unmapped if there were duplicates — but for notes we include ALL
  const allForNotes = answers.filter(ans => {
    const type = ans.question_type || '';
    const titleLower = (ans.question_title || '').toLowerCase();
    return !(type === 'email' && ans.answer === mappedEmail) &&
           !(type === 'phone' && ans.answer === mappedPhone) &&
           !(type === 'short_text' && titleLower.includes('name') && ans.answer === mappedName) &&
           !(type === 'short_text' && (titleLower.includes('business') || titleLower.includes('company')) && ans.answer === mappedBusiness);
  });

  // Build notes string
  const submittedDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let notesStr = '';
  if (allForNotes.length > 0) {
    notesStr = `\nForm: "${form.title}" (${submittedDate})\n` +
      allForNotes.map(a => `- ${a.question_title}: ${a.answer}`).join('\n');
  }

  let contactId = null;

  if (mappedEmail) {
    // Look up existing contact by email + form owner user_id
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, notes')
      .eq('user_id', form.user_id)
      .eq('email', mappedEmail.trim())
      .maybeSingle();

    if (existing) {
      // Update with new mapped fields, append to notes
      const updatedNotes = (existing.notes || '') + notesStr;
      const updatePayload = { updated_at: new Date().toISOString(), notes: updatedNotes };
      if (mappedPhone) updatePayload.phone = mappedPhone;
      if (mappedName) updatePayload.name = mappedName;
      if (mappedBusiness) updatePayload.business = mappedBusiness;

      await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', existing.id);

      contactId = existing.id;
    } else {
      // Create new contact
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          user_id: form.user_id,
          name: mappedName || '',
          email: mappedEmail.trim(),
          phone: mappedPhone || '',
          business: mappedBusiness || '',
          status: 'New Lead',
          tags: [],
          notes: notesStr,
          socials: { instagram: [], linkedin: [], x: [] },
          source: 'form',
        })
        .select('id')
        .single();

      if (newContact) contactId = newContact.id;
    }
  }

  // Save the form response
  const { data: response, error: respError } = await supabase
    .from('form_responses')
    .insert({
      form_id: form.id,
      answers,
      contact_id: contactId,
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (respError) return res.status(500).json({ error: respError.message });
  res.json({ ok: true, response });
});

// ─── 3. GET /api/forms/:id — Get form by ID (auth'd) ───
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

// ─── 4. PUT /api/forms/:id — Update form ───
router.put('/api/forms/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const allowed = ['title', 'description', 'slug', 'theme', 'questions', 'thank_you_message'];
  const updates = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('forms')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ form: data });
});

// ─── 5. DELETE /api/forms/:id — Delete form ───
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

// ─── 6. POST /api/forms/:id/publish — Set status to 'published' ───
router.post('/api/forms/:id/publish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('forms')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ form: data });
});

// ─── 7. POST /api/forms/:id/unpublish — Set status to 'draft' ───
router.post('/api/forms/:id/unpublish', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data, error } = await supabase
    .from('forms')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ form: data });
});

// ─── 12. GET /api/forms/:id/responses/csv — Export CSV (must be before /:id/responses) ───
router.get('/api/forms/:id/responses/csv', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Verify ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id, title, questions')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found' });

  const { data: responses, error } = await supabase
    .from('form_responses')
    .select('*')
    .eq('form_id', form.id)
    .order('submitted_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Build headers from form questions
  const questions = form.questions || [];
  const questionTitles = questions.map(q => q.title || q.id || '');
  const questionIds = questions.map(q => q.id);

  const headers = ['Submitted', ...questionTitles];
  const rows = [headers.map(csvEscape).join(',')];

  for (const resp of responses || []) {
    const answers = resp.answers || [];
    const answerMap = {};
    for (const ans of answers) {
      answerMap[ans.question_id] = ans.answer;
    }

    const submittedAt = resp.submitted_at
      ? new Date(resp.submitted_at).toLocaleString('en-US', { timeZone: 'UTC' })
      : '';

    const row = [
      csvEscape(submittedAt),
      ...questionIds.map(qid => csvEscape(answerMap[qid] ?? '')),
    ];
    rows.push(row.join(','));
  }

  const csv = rows.join('\r\n');
  const filename = `${form.title.replace(/[^a-z0-9]/gi, '_')}_responses.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── 10. GET /api/forms/:id/responses — List responses (auth'd) ───
router.get('/api/forms/:id/responses', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Verify form ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found' });

  const { data, error } = await supabase
    .from('form_responses')
    .select('*')
    .eq('form_id', form.id)
    .order('submitted_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ responses: data });
});

// ─── 11. DELETE /api/forms/:id/responses/:rid — Delete response ───
router.delete('/api/forms/:id/responses/:rid', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Verify form ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found' });

  const { error } = await supabase
    .from('form_responses')
    .delete()
    .eq('id', req.params.rid)
    .eq('form_id', form.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── 13. GET /api/forms/:id/branching — Get branching rules ───
router.get('/api/forms/:id/branching', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Verify form ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found' });

  const { data, error } = await supabase
    .from('form_branching_rules')
    .select('*')
    .eq('form_id', form.id)
    .order('order_index', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ branching: data || [] });
});

// ─── 14. PUT /api/forms/:id/branching — Save branching rules (full replace) ───
router.put('/api/forms/:id/branching', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { rules } = req.body; // Array of branching rule objects
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array is required' });

  // Verify form ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (formError || !form) return res.status(404).json({ error: 'Form not found' });

  // Full replace: delete existing rules then insert new ones
  const { error: deleteError } = await supabase
    .from('form_branching_rules')
    .delete()
    .eq('form_id', form.id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  if (rules.length > 0) {
    const rows = rules.map((rule, idx) => ({
      form_id: form.id,
      order_index: idx,
      ...rule,
    }));

    const { data, error } = await supabase
      .from('form_branching_rules')
      .insert(rows)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ branching: data });
  }

  res.json({ branching: [] });
});

export default router;
