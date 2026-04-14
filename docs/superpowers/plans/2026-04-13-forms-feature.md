# Forms Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Typeform-style form builder and player integrated into AICEO with CRM auto-mapping, branching logic, and embeddable public forms.

**Architecture:** Port OpenForm's form builder and player concepts into AICEO's React+Vite+Express+Supabase stack. New Supabase tables for forms, responses, and branching rules. Backend route handles CRUD + public submission with CRM auto-mapping. Frontend adds Forms list, FormBuilder (3-panel), FormPlayer (Typeform-style), and FormResponses pages.

**Tech Stack:** React 19, Vite, Express, Supabase (PostgreSQL), framer-motion, lucide-react, CSS modules

**Spec:** `docs/superpowers/specs/2026-04-13-forms-feature-design.md`

---

## File Structure

### New Files

```
backend/migrations/add_forms_tables.sql    -- DB migration (3 tables, RLS, triggers, indexes)
backend/routes/forms.js                     -- All form API endpoints (CRUD, publish, submit, responses, branching, CSV)

src/lib/forms-api.js                        -- Frontend API client for forms endpoints

src/pages/Forms.jsx                         -- Forms list page
src/pages/Forms.css
src/pages/FormBuilder.jsx                   -- 3-panel form builder
src/pages/FormBuilder.css
src/pages/FormPlayer.jsx                    -- Public Typeform-style player
src/pages/FormPlayer.css
src/pages/FormResponses.jsx                 -- Responses table + CSV export
src/pages/FormResponses.css

src/components/forms/QuestionEditor.jsx     -- Edit panel for a single question (type-specific settings)
src/components/forms/QuestionRenderer.jsx   -- Renders question inputs (all 13 types) for player + preview
src/components/forms/QuestionCard.jsx       -- Draggable sidebar card
src/components/forms/ThemePicker.jsx        -- 6-theme grid selector
src/components/forms/FormSettings.jsx       -- Slug, description, thank-you message editor
src/components/forms/BranchingEditor.jsx    -- Branching rule editor for yes/no + dropdown
src/components/forms/AddQuestionDialog.jsx  -- Type picker modal (13 types in 3-col grid)
src/components/forms/FormPreview.jsx        -- Live preview panel
src/components/forms/formThemes.js          -- Theme definitions + CSS variable generator
src/components/forms/questionTypes.js       -- Question type registry (13 types with metadata/defaults)
src/components/forms/forms.css              -- Shared CSS for form components
```

### Modified Files

```
src/App.jsx                                 -- Add routes: /forms, /forms/:id/edit, /forms/:id/responses, /f/:slug
src/components/Sidebar.jsx                  -- Add "Forms" nav item between Inbox and CRM
backend/server.js                           -- Mount forms routes
package.json                                -- Add framer-motion dependency
```

---

## Task 1: Database Migration

**Files:**
- Create: `backend/migrations/add_forms_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Forms table
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Form',
  description TEXT,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  theme TEXT NOT NULL DEFAULT 'minimal' CHECK (theme IN ('midnight', 'ocean', 'sunset', 'forest', 'lavender', 'minimal')),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  thank_you_message TEXT NOT NULL DEFAULT 'Thank you for your response!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_forms_user_slug ON forms(user_id, slug);
CREATE INDEX idx_forms_user_id ON forms(user_id);
CREATE INDEX idx_forms_status ON forms(status);

-- Form responses table
CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_responses_form_id ON form_responses(form_id);
CREATE INDEX idx_form_responses_submitted_at ON form_responses(submitted_at DESC);
CREATE INDEX idx_form_responses_contact_id ON form_responses(contact_id);

-- Form branching rules table
CREATE TABLE IF NOT EXISTS form_branching_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  question_id UUID NOT NULL,
  answer_value TEXT NOT NULL,
  target_question_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_branching_form_question ON form_branching_rules(form_id, question_id);

-- Auto-update updated_at trigger for forms
CREATE OR REPLACE FUNCTION update_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW
  EXECUTE FUNCTION update_forms_updated_at();

-- Generate unique slug per user
CREATE OR REPLACE FUNCTION generate_form_slug(base_slug TEXT, uid UUID)
RETURNS TEXT AS $$
DECLARE
  candidate TEXT;
  counter INT := 0;
BEGIN
  candidate := base_slug;
  LOOP
    IF NOT EXISTS (SELECT 1 FROM forms WHERE user_id = uid AND slug = candidate) THEN
      RETURN candidate;
    END IF;
    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own forms"
  ON forms FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view published forms"
  ON forms FOR SELECT
  USING (status = 'published');

ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Form owners can view responses"
  ON form_responses FOR SELECT
  USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_responses.form_id AND forms.user_id = auth.uid()));

CREATE POLICY "Form owners can delete responses"
  ON form_responses FOR DELETE
  USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_responses.form_id AND forms.user_id = auth.uid()));

CREATE POLICY "Anyone can submit responses to published forms"
  ON form_responses FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_responses.form_id AND forms.status = 'published'));

ALTER TABLE form_branching_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Form owners can manage branching rules"
  ON form_branching_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_branching_rules.form_id AND forms.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_branching_rules.form_id AND forms.user_id = auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/add_forms_tables.sql
git commit -m "feat(forms): add database migration for forms, responses, and branching rules"
```

---

## Task 2: Question Types Registry & Theme Definitions

**Files:**
- Create: `src/components/forms/questionTypes.js`
- Create: `src/components/forms/formThemes.js`

- [ ] **Step 1: Create question types registry**

Create `src/components/forms/questionTypes.js`:

```javascript
import {
  Type, AlignLeft, Mail, Phone, Hash, Calendar,
  ChevronDown, CheckSquare, ThumbsUp, Star,
  SlidersHorizontal, Upload, Link,
} from 'lucide-react';

export const QUESTION_TYPES = [
  { type: 'short_text', label: 'Short Text', description: 'Single line text input', icon: Type, defaultSettings: { placeholder: 'Type your answer here...' } },
  { type: 'long_text', label: 'Long Text', description: 'Multi-line text area', icon: AlignLeft, defaultSettings: { placeholder: 'Type your answer here...' } },
  { type: 'email', label: 'Email', description: 'Email address input', icon: Mail, defaultSettings: { placeholder: 'name@example.com' } },
  { type: 'phone', label: 'Phone', description: 'Phone number input', icon: Phone, defaultSettings: { placeholder: '+1 (555) 000-0000' } },
  { type: 'number', label: 'Number', description: 'Numeric input', icon: Hash, defaultSettings: { placeholder: '0' } },
  { type: 'date', label: 'Date', description: 'Date picker', icon: Calendar, defaultSettings: {} },
  { type: 'dropdown', label: 'Dropdown', description: 'Single select from options', icon: ChevronDown, defaultSettings: {}, defaultOptions: ['Option 1', 'Option 2', 'Option 3'] },
  { type: 'checkboxes', label: 'Checkboxes', description: 'Multi-select from options', icon: CheckSquare, defaultSettings: {}, defaultOptions: ['Option 1', 'Option 2', 'Option 3'] },
  { type: 'yes_no', label: 'Yes / No', description: 'Binary yes or no choice', icon: ThumbsUp, defaultSettings: {} },
  { type: 'rating', label: 'Rating', description: 'Star rating scale', icon: Star, defaultSettings: { min: 1, max: 5 } },
  { type: 'opinion_scale', label: 'Opinion Scale', description: 'Numbered scale', icon: SlidersHorizontal, defaultSettings: { min: 1, max: 10 } },
  { type: 'file_upload', label: 'File Upload', description: 'Upload files (images, PDFs)', icon: Upload, defaultSettings: { maxSizeMB: 10 } },
  { type: 'url', label: 'Website URL', description: 'URL input with validation', icon: Link, defaultSettings: { placeholder: 'https://' } },
];

export function getQuestionType(type) {
  return QUESTION_TYPES.find((qt) => qt.type === type);
}

export function createQuestion(type) {
  const qt = getQuestionType(type);
  if (!qt) throw new Error(`Unknown question type: ${type}`);
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    description: '',
    required: false,
    options: qt.defaultOptions ? [...qt.defaultOptions] : [],
    settings: { ...qt.defaultSettings },
  };
}
```

- [ ] **Step 2: Create theme definitions**

Create `src/components/forms/formThemes.js`:

```javascript
export const THEMES = {
  midnight: { name: 'Midnight', primary: '#8B5CF6', background: '#1a1a2e', text: '#ffffff', accent: '#a78bfa', font: 'Inter' },
  ocean: { name: 'Ocean', primary: '#0EA5E9', background: '#0c1929', text: '#ffffff', accent: '#38bdf8', font: 'Inter' },
  sunset: { name: 'Sunset', primary: '#F97316', background: '#fffbeb', text: '#1a1a1a', accent: '#fb923c', font: 'Inter' },
  forest: { name: 'Forest', primary: '#22C55E', background: '#0a1f0a', text: '#ffffff', accent: '#4ade80', font: 'Inter' },
  lavender: { name: 'Lavender', primary: '#A855F7', background: '#faf5ff', text: '#1a1a1a', accent: '#c084fc', font: 'Inter' },
  minimal: { name: 'Minimal', primary: '#000000', background: '#ffffff', text: '#1a1a1a', accent: '#6b7280', font: 'Inter' },
};

export function getThemeVars(themeKey) {
  const theme = THEMES[themeKey] || THEMES.minimal;
  return {
    '--theme-primary': theme.primary,
    '--theme-background': theme.background,
    '--theme-text': theme.text,
    '--theme-accent': theme.accent,
    '--theme-font': theme.font,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/questionTypes.js src/components/forms/formThemes.js
git commit -m "feat(forms): add question types registry and theme definitions"
```

---

## Task 3: Backend API Routes

**Files:**
- Create: `backend/routes/forms.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create the forms route file**

Create `backend/routes/forms.js`:

```javascript
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

  const { title, description, slug, theme, questions, thank_you_message } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (slug !== undefined) updates.slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (theme !== undefined) updates.theme = theme;
  if (questions !== undefined) updates.questions = questions;
  if (thank_you_message !== undefined) updates.thank_you_message = thank_you_message;

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
    .select('id, user_id, title, questions')
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
  let mappedName = null;
  let mappedBusiness = null;
  const unmappedAnswers = [];

  for (const q of questions) {
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') continue;

    if (q.type === 'email') {
      mappedEmail = String(val).trim();
    } else if (q.type === 'phone') {
      mappedPhone = String(val).trim();
    } else if (q.type === 'short_text' && /name/i.test(q.title)) {
      mappedName = String(val).trim();
    } else if (q.type === 'short_text' && /business|company/i.test(q.title)) {
      mappedBusiness = String(val).trim();
    } else {
      const displayVal = Array.isArray(val) ? val.join(', ') : (typeof val === 'object' ? val.name || JSON.stringify(val) : String(val));
      unmappedAnswers.push(`- ${q.title}: ${displayVal}`);
    }
  }

  // Attempt CRM contact creation/update
  if (mappedEmail) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, notes')
      .eq('user_id', form.user_id)
      .eq('email', mappedEmail)
      .maybeSingle();

    const noteBlock = unmappedAnswers.length > 0
      ? `\nForm: "${form.title}" (${new Date().toISOString().slice(0, 10)})\n${unmappedAnswers.join('\n')}`
      : '';

    if (existing) {
      const updates = {};
      if (mappedPhone) updates.phone = mappedPhone;
      if (mappedName) updates.name = mappedName;
      if (mappedBusiness) updates.business = mappedBusiness;
      if (noteBlock) updates.notes = (existing.notes || '') + noteBlock;
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
          tags: [],
          notes: noteBlock,
          socials: { instagram: [], linkedin: [], x: [] },
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

  // Verify form ownership
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

// ─── Export CSV (auth'd) ───
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
  res.setHeader('Content-Disposition', `attachment; filename="${form.questions?.[0]?.title || 'form'}-responses.csv"`);
  res.send(csv);
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
```

- [ ] **Step 2: Mount forms routes in server.js**

In `backend/server.js`, add the import at the top with the other route imports:

```javascript
import formRoutes from './routes/forms.js';
```

Add the route mounting block before the webhook routes (before `// ─── Webhook routes`):

```javascript
// ─── Forms routes (auth required for management, public for player) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/forms') && !req.path.startsWith('/api/forms/public')) {
    return requireAuth(req, res, next);
  }
  next();
});
app.use(formRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/forms.js backend/server.js
git commit -m "feat(forms): add backend API routes for forms CRUD, publishing, submissions, and branching"
```

---

## Task 4: Frontend API Client

**Files:**
- Create: `src/lib/forms-api.js`

- [ ] **Step 1: Create the forms API client**

Create `src/lib/forms-api.js`:

```javascript
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function apiCall(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function listForms() {
  return apiCall('/api/forms');
}

export async function createForm(title) {
  return apiCall('/api/forms', { method: 'POST', body: JSON.stringify({ title }) });
}

export async function getForm(id) {
  return apiCall(`/api/forms/${id}`);
}

export async function updateForm(id, updates) {
  return apiCall(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteForm(id) {
  return apiCall(`/api/forms/${id}`, { method: 'DELETE' });
}

export async function publishForm(id) {
  return apiCall(`/api/forms/${id}/publish`, { method: 'POST' });
}

export async function unpublishForm(id) {
  return apiCall(`/api/forms/${id}/unpublish`, { method: 'POST' });
}

export async function getPublicForm(slug) {
  const res = await fetch(`${API_URL}/api/forms/public/${slug}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Form not found' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function submitFormResponse(slug, answers) {
  const res = await fetch(`${API_URL}/api/forms/public/${slug}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Submission failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getFormResponses(id) {
  return apiCall(`/api/forms/${id}/responses`);
}

export async function deleteFormResponse(formId, responseId) {
  return apiCall(`/api/forms/${formId}/responses/${responseId}`, { method: 'DELETE' });
}

export async function exportFormCSV(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/forms/${id}/responses/csv`, { headers });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'responses.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getBranchingRules(id) {
  return apiCall(`/api/forms/${id}/branching`);
}

export async function saveBranchingRules(id, rules) {
  return apiCall(`/api/forms/${id}/branching`, { method: 'PUT', body: JSON.stringify({ rules }) });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/forms-api.js
git commit -m "feat(forms): add frontend API client for forms endpoints"
```

---

## Task 5: Routing & Sidebar Navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Install framer-motion**

```bash
npm install framer-motion
```

- [ ] **Step 2: Update App.jsx with form routes**

Add imports at the top of `src/App.jsx`:

```javascript
import Forms from './pages/Forms';
import FormBuilder from './pages/FormBuilder';
import FormResponses from './pages/FormResponses';
import FormPlayer from './pages/FormPlayer';
```

Add the public form route alongside the shared meeting route (outside Layout, accessible without auth):

```javascript
<Route path="/f/:slug" element={<FormPlayer />} />
```

Add these three routes inside the `<Route element={<Layout />}>` block, before the CRM route:

```javascript
<Route path="/forms" element={<Forms />} />
<Route path="/forms/:id/edit" element={<FormBuilder />} />
<Route path="/forms/:id/responses" element={<FormResponses />} />
```

- [ ] **Step 3: Add Forms nav item to Sidebar.jsx**

In `src/components/Sidebar.jsx`, add a `FormsIcon` function alongside the other icon functions:

```javascript
function FormsIcon({ size = 20 }) {
  return <ImgIcon src="/icon-forms.png" alt="Forms" size={size} />;
}
```

Add the Forms nav item to the `navItems` array, between the Inbox item and the CRM item:

```javascript
{ to: '/forms', label: 'Forms', icon: FormsIcon },
```

Note: We'll need a `/public/icon-forms.png` icon. If unavailable, fallback to a lucide icon instead by replacing `FormsIcon` with:

```javascript
import { ClipboardList } from 'lucide-react';
// Then in navItems:
{ to: '/forms', label: 'Forms', icon: ({ size }) => <ClipboardList size={size} /> },
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/Sidebar.jsx package.json package-lock.json
git commit -m "feat(forms): add routing, sidebar navigation, and framer-motion dependency"
```

---

## Task 6: Forms List Page

**Files:**
- Create: `src/pages/Forms.jsx`
- Create: `src/pages/Forms.css`

- [ ] **Step 1: Create the Forms list page**

Create `src/pages/Forms.jsx`:

```javascript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit3, BarChart3, Link2, Trash2, FileText } from 'lucide-react';
import { listForms, createForm, deleteForm } from '../lib/forms-api';
import './Forms.css';

export default function Forms() {
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    try {
      const { forms } = await listForms();
      setForms(forms);
    } catch (err) {
      console.error('Failed to load forms:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const { form } = await createForm('Untitled Form');
      navigate(`/forms/${form.id}/edit`);
    } catch (err) {
      console.error('Failed to create form:', err);
      setCreating(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this form and all its responses?')) return;
    try {
      await deleteForm(id);
      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error('Failed to delete form:', err);
    }
  }

  function handleCopyLink(e, slug) {
    e.stopPropagation();
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url);
  }

  const statusColors = {
    draft: '#6b7280',
    published: '#22c55e',
    closed: '#ef4444',
  };

  if (loading) {
    return (
      <div className="forms-page">
        <div className="forms-header">
          <h1>Forms</h1>
        </div>
        <div className="forms-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="forms-page">
      <div className="forms-header">
        <h1>Forms</h1>
        <button className="forms-create-btn" onClick={handleCreate} disabled={creating}>
          <Plus size={18} />
          {creating ? 'Creating...' : 'Create Form'}
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="forms-empty">
          <FileText size={48} strokeWidth={1} />
          <h3>No forms yet</h3>
          <p>Create your first form to start collecting responses</p>
          <button className="forms-create-btn" onClick={handleCreate} disabled={creating}>
            <Plus size={18} />
            Create Form
          </button>
        </div>
      ) : (
        <div className="forms-grid">
          {forms.map((form) => (
            <div
              key={form.id}
              className="form-card"
              onClick={() => navigate(`/forms/${form.id}/edit`)}
            >
              <div className="form-card-header">
                <h3 className="form-card-title">{form.title}</h3>
                <span
                  className="form-card-status"
                  style={{ backgroundColor: statusColors[form.status] + '20', color: statusColors[form.status] }}
                >
                  {form.status}
                </span>
              </div>
              <div className="form-card-meta">
                <span>{form.responseCount} response{form.responseCount !== 1 ? 's' : ''}</span>
                <span>{new Date(form.created_at).toLocaleDateString()}</span>
              </div>
              <div className="form-card-actions">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/edit`); }} title="Edit">
                  <Edit3 size={16} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/responses`); }} title="Responses">
                  <BarChart3 size={16} />
                </button>
                {form.status === 'published' && (
                  <button onClick={(e) => handleCopyLink(e, form.slug)} title="Copy link">
                    <Link2 size={16} />
                  </button>
                )}
                <button onClick={(e) => handleDelete(e, form.id)} title="Delete" className="form-card-delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the Forms list CSS**

Create `src/pages/Forms.css`:

```css
.forms-page {
  padding: 32px;
  max-width: 1200px;
}

.forms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.forms-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

.forms-create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--accent-primary, #6366f1);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.forms-create-btn:hover {
  opacity: 0.9;
}

.forms-create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.forms-loading {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #6b7280);
}

.forms-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--text-secondary, #6b7280);
}

.forms-empty h3 {
  font-size: 18px;
  color: var(--text-primary, #1a1a1a);
  margin: 0;
}

.forms-empty p {
  margin: 0 0 12px;
}

.forms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.form-card {
  background: var(--bg-white, #fff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-card:hover {
  border-color: var(--accent-primary, #6366f1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.form-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.form-card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #1a1a1a);
}

.form-card-status {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: capitalize;
  white-space: nowrap;
}

.form-card-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 16px;
}

.form-card-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--border-light, #e5e7eb);
  padding-top: 12px;
}

.form-card-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.15s;
}

.form-card-actions button:hover {
  background: var(--bg-light, #f9fafb);
  color: var(--text-primary, #1a1a1a);
}

.form-card-delete:hover {
  color: #ef4444 !important;
  border-color: #ef4444 !important;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Forms.jsx src/pages/Forms.css
git commit -m "feat(forms): add forms list page with create, delete, and copy link"
```

---

## Task 7: Form Builder - Shared Components

**Files:**
- Create: `src/components/forms/forms.css`
- Create: `src/components/forms/QuestionCard.jsx`
- Create: `src/components/forms/AddQuestionDialog.jsx`
- Create: `src/components/forms/ThemePicker.jsx`
- Create: `src/components/forms/FormSettings.jsx`

- [ ] **Step 1: Create shared forms CSS**

Create `src/components/forms/forms.css`:

```css
/* ─── Question Card (sidebar) ─── */
.question-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-white, #fff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
  user-select: none;
}

.question-card:hover {
  border-color: var(--accent-primary, #6366f1);
}

.question-card--selected {
  border-color: var(--accent-primary, #6366f1);
  background: #f0f0ff;
}

.question-card-number {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  min-width: 20px;
}

.question-card-icon {
  color: var(--accent-primary, #6366f1);
  flex-shrink: 0;
}

.question-card-info {
  flex: 1;
  min-width: 0;
}

.question-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1a1a1a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.question-card-type {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
}

.question-card-badges {
  display: flex;
  gap: 4px;
  align-items: center;
}

.question-card-required {
  font-size: 10px;
  font-weight: 600;
  color: #ef4444;
  background: #fef2f2;
  padding: 1px 5px;
  border-radius: 3px;
}

.question-card-delete {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.question-card:hover .question-card-delete {
  opacity: 1;
}

.question-card-delete:hover {
  color: #ef4444;
}

/* ─── Add Question Dialog ─── */
.add-question-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.add-question-dialog {
  background: var(--bg-white, #fff);
  border-radius: 16px;
  padding: 24px;
  width: 560px;
  max-height: 80vh;
  overflow-y: auto;
}

.add-question-dialog h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 20px;
}

.add-question-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.add-question-type {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.add-question-type:hover {
  border-color: var(--accent-primary, #6366f1);
  background: #f8f7ff;
}

.add-question-type-icon {
  color: var(--accent-primary, #6366f1);
}

.add-question-type-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.add-question-type-desc {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
}

/* ─── Theme Picker ─── */
.theme-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.theme-card {
  padding: 12px;
  border: 2px solid var(--border-light, #e5e7eb);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: transparent;
  text-align: left;
}

.theme-card:hover {
  border-color: var(--accent-primary, #6366f1);
}

.theme-card--active {
  border-color: var(--accent-primary, #6366f1);
  background: #f8f7ff;
}

.theme-card-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary, #1a1a1a);
}

.theme-card-swatches {
  display: flex;
  gap: 4px;
}

.theme-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* ─── Form Settings ─── */
.form-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-settings-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 6px;
}

.form-settings-field input,
.form-settings-field textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
  background: var(--bg-white, #fff);
  resize: vertical;
}

.form-settings-field input:focus,
.form-settings-field textarea:focus {
  outline: none;
  border-color: var(--accent-primary, #6366f1);
}

.form-settings-hint {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-top: 4px;
}
```

- [ ] **Step 2: Create QuestionCard component**

Create `src/components/forms/QuestionCard.jsx`:

```javascript
import { X } from 'lucide-react';
import { getQuestionType } from './questionTypes';

export default function QuestionCard({ question, index, selected, onClick, onDelete }) {
  const qt = getQuestionType(question.type);
  const Icon = qt?.icon;

  return (
    <div
      className={`question-card ${selected ? 'question-card--selected' : ''}`}
      onClick={onClick}
    >
      <span className="question-card-number">{index + 1}</span>
      {Icon && <Icon size={16} className="question-card-icon" />}
      <div className="question-card-info">
        <div className="question-card-title">{question.title || 'Untitled'}</div>
        <div className="question-card-type">{qt?.label || question.type}</div>
      </div>
      <div className="question-card-badges">
        {question.required && <span className="question-card-required">Required</span>}
      </div>
      <button
        className="question-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete question"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create AddQuestionDialog component**

Create `src/components/forms/AddQuestionDialog.jsx`:

```javascript
import { QUESTION_TYPES } from './questionTypes';

export default function AddQuestionDialog({ onSelect, onClose }) {
  return (
    <div className="add-question-overlay" onClick={onClose}>
      <div className="add-question-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Add Question</h3>
        <div className="add-question-grid">
          {QUESTION_TYPES.map((qt) => (
            <button
              key={qt.type}
              className="add-question-type"
              onClick={() => onSelect(qt.type)}
            >
              <qt.icon size={24} className="add-question-type-icon" />
              <span className="add-question-type-label">{qt.label}</span>
              <span className="add-question-type-desc">{qt.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ThemePicker component**

Create `src/components/forms/ThemePicker.jsx`:

```javascript
import { THEMES } from './formThemes';

export default function ThemePicker({ value, onChange }) {
  return (
    <div className="theme-picker">
      {Object.entries(THEMES).map(([key, theme]) => (
        <button
          key={key}
          className={`theme-card ${value === key ? 'theme-card--active' : ''}`}
          onClick={() => onChange(key)}
        >
          <div className="theme-card-name">{theme.name}</div>
          <div className="theme-card-swatches">
            <div className="theme-swatch" style={{ backgroundColor: theme.primary }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.background }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.text }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.accent }} />
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create FormSettings component**

Create `src/components/forms/FormSettings.jsx`:

```javascript
export default function FormSettings({ slug, description, thankYouMessage, onChange }) {
  return (
    <div className="form-settings">
      <div className="form-settings-field">
        <label>Form URL Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => onChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, ''))}
        />
        <div className="form-settings-hint">
          Your form will be available at /f/{slug}
        </div>
      </div>
      <div className="form-settings-field">
        <label>Description</label>
        <textarea
          rows={3}
          value={description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Optional form description..."
        />
      </div>
      <div className="form-settings-field">
        <label>Thank You Message</label>
        <textarea
          rows={3}
          value={thankYouMessage}
          onChange={(e) => onChange('thank_you_message', e.target.value)}
          placeholder="Thank you for your response!"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/forms/
git commit -m "feat(forms): add shared form components - QuestionCard, AddQuestionDialog, ThemePicker, FormSettings"
```

---

## Task 8: Question Editor & Branching Editor

**Files:**
- Create: `src/components/forms/QuestionEditor.jsx`
- Create: `src/components/forms/BranchingEditor.jsx`

- [ ] **Step 1: Create QuestionEditor**

Create `src/components/forms/QuestionEditor.jsx`:

```javascript
import { Trash2, Plus, X } from 'lucide-react';
import { getQuestionType } from './questionTypes';
import BranchingEditor from './BranchingEditor';

export default function QuestionEditor({ question, questions, branchingRules, onUpdate, onDelete, onBranchingChange }) {
  const qt = getQuestionType(question.type);
  const Icon = qt?.icon;
  const hasOptions = question.type === 'dropdown' || question.type === 'checkboxes';
  const hasMinMax = question.type === 'rating' || question.type === 'opinion_scale';
  const hasPlaceholder = ['short_text', 'long_text', 'email', 'phone', 'number', 'url'].includes(question.type);
  const hasBranching = question.type === 'yes_no' || question.type === 'dropdown';

  function updateField(field, value) {
    onUpdate({ ...question, [field]: value });
  }

  function updateSetting(key, value) {
    onUpdate({ ...question, settings: { ...question.settings, [key]: value } });
  }

  function updateOption(index, value) {
    const options = [...question.options];
    options[index] = value;
    onUpdate({ ...question, options });
  }

  function addOption() {
    onUpdate({ ...question, options: [...question.options, `Option ${question.options.length + 1}`] });
  }

  function removeOption(index) {
    onUpdate({ ...question, options: question.options.filter((_, i) => i !== index) });
  }

  return (
    <div className="question-editor">
      <div className="question-editor-header">
        {Icon && <Icon size={18} />}
        <span className="question-editor-type-label">{qt?.label}</span>
      </div>

      <div className="question-editor-field">
        <label>Question Title</label>
        <textarea
          value={question.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Enter your question..."
          rows={2}
        />
      </div>

      <div className="question-editor-field">
        <label>Description (optional)</label>
        <textarea
          value={question.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Add a description..."
          rows={2}
        />
      </div>

      {hasPlaceholder && (
        <div className="question-editor-field">
          <label>Placeholder</label>
          <input
            type="text"
            value={question.settings?.placeholder || ''}
            onChange={(e) => updateSetting('placeholder', e.target.value)}
          />
        </div>
      )}

      {hasOptions && (
        <div className="question-editor-field">
          <label>Options</label>
          <div className="question-editor-options">
            {question.options.map((opt, i) => (
              <div key={i} className="question-editor-option">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                <button onClick={() => removeOption(i)} className="question-editor-option-remove">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button onClick={addOption} className="question-editor-add-option">
              <Plus size={14} /> Add option
            </button>
          </div>
        </div>
      )}

      {hasMinMax && (
        <div className="question-editor-row">
          <div className="question-editor-field">
            <label>Min</label>
            <input
              type="number"
              value={question.settings?.min ?? 1}
              onChange={(e) => updateSetting('min', Number(e.target.value))}
            />
          </div>
          <div className="question-editor-field">
            <label>Max</label>
            <input
              type="number"
              value={question.settings?.max ?? (question.type === 'rating' ? 5 : 10)}
              onChange={(e) => updateSetting('max', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {question.type === 'file_upload' && (
        <div className="question-editor-field">
          <label>Max file size (MB)</label>
          <input
            type="number"
            value={question.settings?.maxSizeMB ?? 10}
            onChange={(e) => updateSetting('maxSizeMB', Number(e.target.value))}
          />
        </div>
      )}

      <div className="question-editor-toggle">
        <label>
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => updateField('required', e.target.checked)}
          />
          Required
        </label>
      </div>

      {hasBranching && (
        <BranchingEditor
          question={question}
          questions={questions}
          rules={branchingRules.filter((r) => r.question_id === question.id)}
          onChange={onBranchingChange}
        />
      )}

      <button className="question-editor-delete" onClick={onDelete}>
        <Trash2 size={16} />
        Delete Question
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create BranchingEditor**

Create `src/components/forms/BranchingEditor.jsx`:

```javascript
import { Plus, X } from 'lucide-react';

export default function BranchingEditor({ question, questions, rules, onChange }) {
  const answerOptions = question.type === 'yes_no'
    ? ['Yes', 'No']
    : question.options || [];

  const otherQuestions = questions.filter((q) => q.id !== question.id);

  function addRule() {
    onChange([
      ...rules,
      { question_id: question.id, answer_value: answerOptions[0] || '', target_question_id: otherQuestions[0]?.id || '' },
    ]);
  }

  function updateRule(index, field, value) {
    const updated = rules.map((r, i) => i === index ? { ...r, [field]: value } : r);
    onChange(updated);
  }

  function removeRule(index) {
    onChange(rules.filter((_, i) => i !== index));
  }

  if (otherQuestions.length === 0) return null;

  return (
    <div className="branching-editor">
      <label className="branching-editor-label">Branching Logic</label>
      <div className="branching-editor-hint">Skip to a specific question based on the answer</div>

      {rules.map((rule, i) => (
        <div key={i} className="branching-rule">
          <span>If</span>
          <select
            value={rule.answer_value}
            onChange={(e) => updateRule(i, 'answer_value', e.target.value)}
          >
            {answerOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <span>go to</span>
          <select
            value={rule.target_question_id}
            onChange={(e) => updateRule(i, 'target_question_id', e.target.value)}
          >
            {otherQuestions.map((q, qi) => (
              <option key={q.id} value={q.id}>
                {qi + 1}. {q.title || 'Untitled'}
              </option>
            ))}
          </select>
          <button onClick={() => removeRule(i)} className="branching-rule-remove">
            <X size={14} />
          </button>
        </div>
      ))}

      <button onClick={addRule} className="branching-add-rule">
        <Plus size={14} /> Add rule
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for QuestionEditor and BranchingEditor**

Append to `src/components/forms/forms.css`:

```css
/* ─── Question Editor ─── */
.question-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.question-editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-primary, #6366f1);
  font-size: 14px;
  font-weight: 600;
}

.question-editor-type-label {
  color: var(--accent-primary, #6366f1);
}

.question-editor-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 6px;
}

.question-editor-field input,
.question-editor-field textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
  background: var(--bg-white, #fff);
  resize: vertical;
}

.question-editor-field input:focus,
.question-editor-field textarea:focus {
  outline: none;
  border-color: var(--accent-primary, #6366f1);
}

.question-editor-row {
  display: flex;
  gap: 12px;
}

.question-editor-row .question-editor-field {
  flex: 1;
}

.question-editor-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.question-editor-option {
  display: flex;
  gap: 8px;
  align-items: center;
}

.question-editor-option input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
}

.question-editor-option-remove {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 4px;
}

.question-editor-option-remove:hover {
  color: #ef4444;
}

.question-editor-add-option {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px dashed var(--border-light, #e5e7eb);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}

.question-editor-add-option:hover {
  border-color: var(--accent-primary, #6366f1);
  color: var(--accent-primary, #6366f1);
}

.question-editor-toggle label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.question-editor-delete {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: none;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;
  margin-top: 8px;
}

.question-editor-delete:hover {
  background: #fef2f2;
}

/* ─── Branching Editor ─── */
.branching-editor {
  border-top: 1px solid var(--border-light, #e5e7eb);
  padding-top: 16px;
}

.branching-editor-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.branching-editor-hint {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin: 4px 0 12px;
}

.branching-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.branching-rule select {
  padding: 4px 8px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  max-width: 160px;
}

.branching-rule-remove {
  display: flex;
  background: none;
  border: none;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 2px;
}

.branching-rule-remove:hover {
  color: #ef4444;
}

.branching-add-rule {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--accent-primary, #6366f1);
  cursor: pointer;
  padding: 0;
}

.branching-add-rule:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/forms/QuestionEditor.jsx src/components/forms/BranchingEditor.jsx src/components/forms/forms.css
git commit -m "feat(forms): add QuestionEditor and BranchingEditor components"
```

---

## Task 9: Question Renderer

**Files:**
- Create: `src/components/forms/QuestionRenderer.jsx`

- [ ] **Step 1: Create QuestionRenderer**

Create `src/components/forms/QuestionRenderer.jsx`:

```javascript
import { useState } from 'react';
import { Star, Upload, Check } from 'lucide-react';

export default function QuestionRenderer({ question, value, onChange, themeVars }) {
  const [dragOver, setDragOver] = useState(false);

  const inputStyle = {
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${themeVars?.['--theme-accent'] || '#6b7280'}`,
    color: themeVars?.['--theme-text'] || '#1a1a1a',
    fontSize: '20px',
    padding: '8px 0',
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
  };

  switch (question.type) {
    case 'short_text':
    case 'email':
    case 'phone':
    case 'url':
    case 'number':
      return (
        <input
          type={question.type === 'number' ? 'number' : 'text'}
          style={inputStyle}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.settings?.placeholder || ''}
          autoFocus
        />
      );

    case 'long_text':
      return (
        <textarea
          style={{ ...inputStyle, borderBottom: 'none', border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`, borderRadius: '8px', padding: '12px', minHeight: '120px', resize: 'none' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.settings?.placeholder || ''}
          autoFocus
        />
      );

    case 'date':
      return (
        <input
          type="date"
          style={{ ...inputStyle, fontSize: '18px' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      );

    case 'dropdown':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {(question.options || []).map((opt, i) => (
            <button
              key={i}
              onClick={() => onChange(opt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 18px',
                border: `1px solid ${value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '8px',
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                color: themeVars?.['--theme-text'] || '#1a1a1a',
                fontSize: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`,
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                color: value === opt ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
              }}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
              {value === opt && <Check size={18} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      );

    case 'checkboxes':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {(question.options || []).map((opt, i) => {
            const selected = Array.isArray(value) && value.includes(opt);
            return (
              <button
                key={i}
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(selected ? current.filter((v) => v !== opt) : [...current, opt]);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 18px',
                  border: `1px solid ${selected ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                  borderRadius: '8px',
                  background: selected ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                  color: themeVars?.['--theme-text'] || '#1a1a1a',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '24px', height: '24px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                  border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`,
                  background: selected ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                  color: selected ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
                }}>
                  {selected ? <Check size={14} /> : String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      );

    case 'yes_no':
      return (
        <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              style={{
                flex: 1,
                padding: '20px',
                border: `2px solid ${value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '12px',
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                color: themeVars?.['--theme-text'] || '#1a1a1a',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case 'rating': {
      const max = question.settings?.max || 5;
      const min = question.settings?.min || 1;
      return (
        <div style={{ display: 'flex', gap: '8px' }}>
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 0.15s' }}
            >
              <Star
                size={32}
                fill={value >= n ? (themeVars?.['--theme-primary'] || '#6366f1') : 'none'}
                color={value >= n ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#d1d5db')}
              />
            </button>
          ))}
        </div>
      );
    }

    case 'opinion_scale': {
      const max = question.settings?.max || 10;
      const min = question.settings?.min || 1;
      return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{
                width: '44px', height: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${value === n ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '8px',
                background: value === n ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                color: value === n ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
                fontSize: '16px', fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    case 'file_upload':
      return (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) onChange({ name: file.name, type: file.type, size: file.size, file });
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf';
            input.onchange = (e) => {
              const file = e.target.files[0];
              if (file) onChange({ name: file.name, type: file.type, size: file.size, file });
            };
            input.click();
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '40px', border: `2px dashed ${dragOver ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
            borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.15s',
            color: themeVars?.['--theme-text'] || '#6b7280',
          }}
        >
          <Upload size={32} />
          {value?.name ? (
            <span>{value.name} ({(value.size / 1024 / 1024).toFixed(1)}MB)</span>
          ) : (
            <span>Click or drag to upload</span>
          )}
        </div>
      );

    default:
      return <div>Unsupported question type: {question.type}</div>;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/forms/QuestionRenderer.jsx
git commit -m "feat(forms): add QuestionRenderer with all 13 question types"
```

---

## Task 10: Form Preview Component

**Files:**
- Create: `src/components/forms/FormPreview.jsx`

- [ ] **Step 1: Create FormPreview**

Create `src/components/forms/FormPreview.jsx`:

```javascript
import { getThemeVars } from './formThemes';
import QuestionRenderer from './QuestionRenderer';
import { ArrowRight } from 'lucide-react';

export default function FormPreview({ questions, theme, selectedQuestionId, onSelectQuestion }) {
  const themeVars = getThemeVars(theme);

  return (
    <div
      className="form-preview"
      style={{
        ...themeVars,
        backgroundColor: themeVars['--theme-background'],
        color: themeVars['--theme-text'],
        fontFamily: themeVars['--theme-font'],
        padding: '32px',
        borderRadius: '12px',
        minHeight: '100%',
        overflowY: 'auto',
      }}
    >
      {questions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.5 }}>
          <p>Add questions to see a preview</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '600px', margin: '0 auto' }}>
          {questions.map((q, i) => (
            <div
              key={q.id}
              onClick={() => onSelectQuestion(q.id)}
              style={{
                cursor: 'pointer',
                padding: '20px',
                borderRadius: '12px',
                border: selectedQuestionId === q.id ? `2px solid ${themeVars['--theme-primary']}` : '2px solid transparent',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ArrowRight size={16} color={themeVars['--theme-primary']} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: themeVars['--theme-primary'] }}>
                  {i + 1}
                </span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>
                {q.title || 'Untitled'}
                {q.required && <span style={{ color: themeVars['--theme-primary'] }}> *</span>}
              </h3>
              {q.description && (
                <p style={{ fontSize: '14px', opacity: 0.7, margin: '0 0 16px' }}>{q.description}</p>
              )}
              <div style={{ pointerEvents: 'none', opacity: 0.6 }}>
                <QuestionRenderer question={q} value={undefined} onChange={() => {}} themeVars={themeVars} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/forms/FormPreview.jsx
git commit -m "feat(forms): add FormPreview component with themed rendering"
```

---

## Task 11: Form Builder Page

**Files:**
- Create: `src/pages/FormBuilder.jsx`
- Create: `src/pages/FormBuilder.css`

- [ ] **Step 1: Create FormBuilder page**

Create `src/pages/FormBuilder.jsx`:

```javascript
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Reorder } from 'framer-motion';
import {
  Save, Eye, Link2, Code, BarChart3,
  ChevronRight, Palette, Settings as SettingsIcon, List, Plus,
} from 'lucide-react';
import { getForm, updateForm, publishForm, unpublishForm, getBranchingRules, saveBranchingRules } from '../lib/forms-api';
import { createQuestion } from '../components/forms/questionTypes';
import QuestionCard from '../components/forms/QuestionCard';
import QuestionEditor from '../components/forms/QuestionEditor';
import AddQuestionDialog from '../components/forms/AddQuestionDialog';
import ThemePicker from '../components/forms/ThemePicker';
import FormSettings from '../components/forms/FormSettings';
import FormPreview from '../components/forms/FormPreview';
import '../components/forms/forms.css';
import './FormBuilder.css';

export default function FormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('questions');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [branchingRules, setBranchingRules] = useState([]);
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [{ form: f }, { rules }] = await Promise.all([
          getForm(id),
          getBranchingRules(id),
        ]);
        setForm(f);
        setBranchingRules(rules);
        if (f.questions?.length > 0) setSelectedQuestionId(f.questions[0].id);
      } catch (err) {
        console.error('Failed to load form:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const selectedQuestion = form?.questions?.find((q) => q.id === selectedQuestionId);

  function updateLocal(updates) {
    setForm((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }

  function updateQuestions(newQuestions) {
    updateLocal({ questions: newQuestions });
  }

  function updateQuestion(updated) {
    updateQuestions(form.questions.map((q) => q.id === updated.id ? updated : q));
  }

  function deleteQuestion(qId) {
    updateQuestions(form.questions.filter((q) => q.id !== qId));
    setBranchingRules((prev) => prev.filter((r) => r.question_id !== qId && r.target_question_id !== qId));
    if (selectedQuestionId === qId) {
      setSelectedQuestionId(form.questions.find((q) => q.id !== qId)?.id || null);
    }
  }

  function addQuestion(type) {
    const q = createQuestion(type);
    updateQuestions([...form.questions, q]);
    setSelectedQuestionId(q.id);
    setShowAddDialog(false);
  }

  function handleBranchingChange(rulesForQuestion) {
    setBranchingRules((prev) => {
      const otherRules = prev.filter((r) => r.question_id !== selectedQuestionId);
      return [...otherRules, ...rulesForQuestion];
    });
    setDirty(true);
  }

  const handleSave = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        updateForm(id, {
          title: form.title,
          description: form.description,
          slug: form.slug,
          theme: form.theme,
          questions: form.questions,
          thank_you_message: form.thank_you_message,
        }),
        saveBranchingRules(id, branchingRules),
      ]);
      setDirty(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [form, branchingRules, id, saving]);

  async function handlePublish() {
    try {
      if (dirty) await handleSave();
      const { form: updated } = form.status === 'published'
        ? await unpublishForm(id)
        : await publishForm(id);
      setForm(updated);
    } catch (err) {
      console.error('Failed to publish:', err);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`);
  }

  if (loading) {
    return <div className="form-builder-loading">Loading...</div>;
  }

  if (!form) {
    return <div className="form-builder-loading">Form not found</div>;
  }

  const embedCode = `<iframe src="${window.location.origin}/f/${form.slug}" width="100%" height="600" frameborder="0"></iframe>`;

  return (
    <div className="form-builder">
      {/* Header */}
      <div className="form-builder-header">
        <div className="form-builder-header-left">
          <input
            className="form-builder-title-input"
            value={form.title}
            onChange={(e) => updateLocal({ title: e.target.value })}
            placeholder="Form title..."
          />
          <span className={`form-builder-status form-builder-status--${form.status}`}>
            {form.status}
          </span>
          {dirty && <span className="form-builder-unsaved">Unsaved changes</span>}
        </div>
        <div className="form-builder-header-right">
          <button className="form-builder-btn" onClick={handleSave} disabled={saving || !dirty}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="form-builder-btn" onClick={handlePublish}>
            {form.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          {form.status === 'published' && (
            <>
              <button className="form-builder-btn" onClick={copyLink} title="Copy link">
                <Link2 size={16} /> Copy Link
              </button>
              <button className="form-builder-btn" onClick={() => window.open(`/f/${form.slug}`, '_blank')} title="View form">
                <Eye size={16} /> View
              </button>
              <button className="form-builder-btn" onClick={() => setShowEmbed(!showEmbed)} title="Embed code">
                <Code size={16} /> Embed
              </button>
            </>
          )}
          <button className="form-builder-btn" onClick={() => navigate(`/forms/${id}/responses`)} title="Responses">
            <BarChart3 size={16} /> Responses
          </button>
        </div>
      </div>

      {/* Embed modal */}
      {showEmbed && (
        <div className="form-builder-embed-bar">
          <code>{embedCode}</code>
          <button onClick={() => { navigator.clipboard.writeText(embedCode); }}>Copy</button>
        </div>
      )}

      {/* Main 3-panel layout */}
      <div className="form-builder-body">
        {/* Left sidebar */}
        <div className="form-builder-sidebar">
          <div className="form-builder-sidebar-tabs">
            <button className={sidebarTab === 'questions' ? 'active' : ''} onClick={() => setSidebarTab('questions')}>
              <List size={16} /> Questions
            </button>
            <button className={sidebarTab === 'design' ? 'active' : ''} onClick={() => setSidebarTab('design')}>
              <Palette size={16} /> Design
            </button>
            <button className={sidebarTab === 'settings' ? 'active' : ''} onClick={() => setSidebarTab('settings')}>
              <SettingsIcon size={16} /> Settings
            </button>
          </div>

          <div className="form-builder-sidebar-content">
            {sidebarTab === 'questions' && (
              <>
                <Reorder.Group
                  axis="y"
                  values={form.questions}
                  onReorder={updateQuestions}
                  className="form-builder-question-list"
                >
                  {form.questions.map((q, i) => (
                    <Reorder.Item key={q.id} value={q}>
                      <QuestionCard
                        question={q}
                        index={i}
                        selected={selectedQuestionId === q.id}
                        onClick={() => setSelectedQuestionId(q.id)}
                        onDelete={() => deleteQuestion(q.id)}
                      />
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <button className="form-builder-add-btn" onClick={() => setShowAddDialog(true)}>
                  <Plus size={16} /> Add Question
                </button>
              </>
            )}

            {sidebarTab === 'design' && (
              <ThemePicker value={form.theme} onChange={(theme) => updateLocal({ theme })} />
            )}

            {sidebarTab === 'settings' && (
              <FormSettings
                slug={form.slug}
                description={form.description}
                thankYouMessage={form.thank_you_message}
                onChange={(field, value) => updateLocal({ [field]: value })}
              />
            )}
          </div>
        </div>

        {/* Center: Question Editor */}
        <div className="form-builder-editor">
          {selectedQuestion ? (
            <QuestionEditor
              key={selectedQuestion.id}
              question={selectedQuestion}
              questions={form.questions}
              branchingRules={branchingRules}
              onUpdate={updateQuestion}
              onDelete={() => deleteQuestion(selectedQuestion.id)}
              onBranchingChange={handleBranchingChange}
            />
          ) : (
            <div className="form-builder-editor-empty">
              <p>Select a question to edit, or add a new one</p>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="form-builder-preview">
          <FormPreview
            questions={form.questions}
            theme={form.theme}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={setSelectedQuestionId}
          />
        </div>
      </div>

      {/* Add question dialog */}
      {showAddDialog && (
        <AddQuestionDialog
          onSelect={addQuestion}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create FormBuilder CSS**

Create `src/pages/FormBuilder.css`:

```css
.form-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.form-builder-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #6b7280);
}

/* Header */
.form-builder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  gap: 16px;
  flex-shrink: 0;
}

.form-builder-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.form-builder-title-input {
  font-size: 18px;
  font-weight: 700;
  border: none;
  background: transparent;
  color: var(--text-primary, #1a1a1a);
  outline: none;
  padding: 4px 0;
  min-width: 200px;
  max-width: 400px;
}

.form-builder-status {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: capitalize;
}

.form-builder-status--draft { background: #f3f4f6; color: #6b7280; }
.form-builder-status--published { background: #dcfce7; color: #16a34a; }
.form-builder-status--closed { background: #fee2e2; color: #dc2626; }

.form-builder-unsaved {
  font-size: 12px;
  color: #f59e0b;
  font-style: italic;
}

.form-builder-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.form-builder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-white, #fff);
  color: var(--text-primary, #1a1a1a);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.form-builder-btn:hover {
  background: var(--bg-light, #f9fafb);
}

.form-builder-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Embed bar */
.form-builder-embed-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: #f9fafb;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
}

.form-builder-embed-bar code {
  flex: 1;
  font-size: 12px;
  background: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  overflow-x: auto;
  white-space: nowrap;
}

.form-builder-embed-bar button {
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

/* 3-panel body */
.form-builder-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Left sidebar */
.form-builder-sidebar {
  width: 280px;
  border-right: 1px solid var(--border-light, #e5e7eb);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.form-builder-sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
}

.form-builder-sidebar-tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.form-builder-sidebar-tabs button.active {
  color: var(--accent-primary, #6366f1);
  border-bottom-color: var(--accent-primary, #6366f1);
}

.form-builder-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.form-builder-question-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-builder-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  margin-top: 10px;
  border: 1px dashed var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.form-builder-add-btn:hover {
  border-color: var(--accent-primary, #6366f1);
  color: var(--accent-primary, #6366f1);
}

/* Center: Editor */
.form-builder-editor {
  width: 384px;
  border-right: 1px solid var(--border-light, #e5e7eb);
  overflow-y: auto;
  flex-shrink: 0;
}

.form-builder-editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

/* Right: Preview */
.form-builder-preview {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/FormBuilder.jsx src/pages/FormBuilder.css
git commit -m "feat(forms): add FormBuilder page with 3-panel layout, save, publish, and embed"
```

---

## Task 12: Form Player Page

**Files:**
- Create: `src/pages/FormPlayer.jsx`
- Create: `src/pages/FormPlayer.css`

- [ ] **Step 1: Create FormPlayer page**

Create `src/pages/FormPlayer.jsx`:

```javascript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { getPublicForm, submitFormResponse } from '../lib/forms-api';
import { getThemeVars } from '../components/forms/formThemes';
import QuestionRenderer from '../components/forms/QuestionRenderer';
import './FormPlayer.css';

const AUTO_ADVANCE_TYPES = ['dropdown', 'yes_no', 'opinion_scale'];

export default function FormPlayer() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [branchingRules, setBranchingRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validationError, setValidationError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState(1);
  const [questionHistory, setQuestionHistory] = useState([0]);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    async function load() {
      try {
        const { form: f, branchingRules: rules } = await getPublicForm(slug);
        setForm(f);
        setBranchingRules(rules || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const questions = form?.questions || [];
  const currentQuestion = questions[currentIndex];
  const themeVars = form ? getThemeVars(form.theme) : {};
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function validate(question, value) {
    if (question.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
      return 'This field is required';
    }
    if (value && question.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address';
    }
    if (value && question.type === 'phone' && !/^[+]?[\d\s\-().]+$/.test(value)) {
      return 'Please enter a valid phone number';
    }
    if (value && question.type === 'url') {
      try { new URL(value); } catch { return 'Please enter a valid URL'; }
    }
    if (value && question.type === 'number' && isNaN(Number(value))) {
      return 'Please enter a valid number';
    }
    return '';
  }

  function getNextIndex(fromIndex, answerValue) {
    const q = questions[fromIndex];
    if (q && (q.type === 'yes_no' || q.type === 'dropdown') && answerValue !== undefined) {
      const rule = branchingRules.find(
        (r) => r.question_id === q.id && r.answer_value === String(answerValue)
      );
      if (rule) {
        const targetIdx = questions.findIndex((qu) => qu.id === rule.target_question_id);
        if (targetIdx !== -1) return targetIdx;
      }
    }
    return fromIndex + 1;
  }

  const goNext = useCallback((skipValidation = false) => {
    if (!currentQuestion) return;
    const val = answers[currentQuestion.id];

    if (!skipValidation) {
      const err = validate(currentQuestion, val);
      if (err) { setValidationError(err); return; }
    }
    setValidationError('');

    if (isLast) {
      handleSubmit();
      return;
    }

    const nextIdx = getNextIndex(currentIndex, val);
    if (nextIdx < questions.length) {
      setDirection(1);
      setCurrentIndex(nextIdx);
      setQuestionHistory((prev) => [...prev, nextIdx]);
    }
  }, [currentQuestion, answers, currentIndex, isLast, questions, branchingRules]);

  function goPrev() {
    if (questionHistory.length <= 1) return;
    setDirection(-1);
    const newHistory = questionHistory.slice(0, -1);
    setQuestionHistory(newHistory);
    setCurrentIndex(newHistory[newHistory.length - 1]);
    setValidationError('');
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitFormResponse(slug, answers);
      setSubmitted(true);
    } catch (err) {
      setValidationError(err.message);
      setSubmitting(false);
    }
  }

  function handleAnswerChange(value) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    setValidationError('');

    if (AUTO_ADVANCE_TYPES.includes(currentQuestion.type) && value !== undefined && value !== '') {
      setTimeout(() => {
        const nextIdx = getNextIndex(currentIndex, value);
        if (nextIdx < questions.length) {
          setDirection(1);
          setCurrentIndex(nextIdx);
          setQuestionHistory((prev) => [...prev, nextIdx]);
        } else {
          handleSubmit();
        }
      }, 300);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (submitted) return;
      if (e.key === 'Enter') {
        if (currentQuestion?.type === 'long_text' && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, submitted, currentQuestion]);

  // Scroll navigation
  useEffect(() => {
    function handleWheel(e) {
      if (submitted) return;
      const now = Date.now();
      if (now - lastScrollTime.current < 500) return;
      if (Math.abs(e.deltaY) < 50) return;
      lastScrollTime.current = now;
      if (e.deltaY > 0) goNext();
      else goPrev();
    }
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [goNext, submitted]);

  if (loading) {
    return <div className="form-player" style={{ ...themeVars, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>Loading...</span></div>;
  }

  if (error) {
    return <div className="form-player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>{error}</span></div>;
  }

  if (submitted) {
    return (
      <div className="form-player" style={{ ...themeVars, backgroundColor: themeVars['--theme-background'], color: themeVars['--theme-text'] }}>
        <div className="form-player-thankyou">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="form-player-check"
            style={{ backgroundColor: themeVars['--theme-primary'] }}
          >
            <Check size={40} color="#fff" />
          </motion.div>
          <h2>{form.thank_you_message}</h2>
          <p style={{ opacity: 0.5, fontSize: '14px' }}>Made with AICU</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-player" style={{ ...themeVars, backgroundColor: themeVars['--theme-background'], color: themeVars['--theme-text'], fontFamily: themeVars['--theme-font'] }}>
      {/* Progress bar */}
      <div className="form-player-progress">
        <div className="form-player-progress-bar" style={{ width: `${progress}%`, backgroundColor: themeVars['--theme-primary'] }} />
      </div>

      {/* Question area */}
      <div className="form-player-content">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentQuestion?.id}
            custom={direction}
            initial={{ y: direction * 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: direction * -50, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="form-player-question"
          >
            <div className="form-player-question-number" style={{ color: themeVars['--theme-primary'] }}>
              {currentIndex + 1} →
            </div>
            <h2 className="form-player-question-title">
              {currentQuestion?.title || 'Untitled'}
              {currentQuestion?.required && <span style={{ color: themeVars['--theme-primary'] }}> *</span>}
            </h2>
            {currentQuestion?.description && (
              <p className="form-player-question-desc">{currentQuestion.description}</p>
            )}
            <div className="form-player-input">
              <QuestionRenderer
                question={currentQuestion}
                value={answers[currentQuestion?.id]}
                onChange={handleAnswerChange}
                themeVars={themeVars}
              />
            </div>
            {validationError && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="form-player-error"
              >
                {validationError}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navigation */}
      <div className="form-player-footer">
        {!AUTO_ADVANCE_TYPES.includes(currentQuestion?.type) && (
          <button
            className="form-player-ok-btn"
            onClick={() => goNext()}
            style={{ backgroundColor: themeVars['--theme-primary'], color: '#fff' }}
          >
            {isLast ? (submitting ? 'Submitting...' : 'Submit') : 'OK'} ✓
          </button>
        )}
        <span className="form-player-hint" style={{ color: themeVars['--theme-accent'] }}>
          press <strong>Enter ↵</strong>
        </span>
        <div className="form-player-nav-arrows">
          <button onClick={goPrev} disabled={questionHistory.length <= 1} style={{ color: themeVars['--theme-text'] }}>
            <ChevronUp size={18} />
          </button>
          <button onClick={() => goNext()} style={{ color: themeVars['--theme-text'] }}>
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FormPlayer CSS**

Create `src/pages/FormPlayer.css`:

```css
.form-player {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.form-player-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.form-player-progress-bar {
  height: 100%;
  transition: width 0.3s ease;
}

.form-player-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  overflow-y: auto;
}

.form-player-question {
  max-width: 640px;
  width: 100%;
}

.form-player-question-number {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}

.form-player-question-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px;
  line-height: 1.3;
}

.form-player-question-desc {
  font-size: 16px;
  opacity: 0.6;
  margin: 0 0 24px;
}

.form-player-input {
  margin-top: 24px;
}

.form-player-error {
  color: #ef4444;
  font-size: 14px;
  margin-top: 12px;
}

.form-player-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 40px;
  flex-shrink: 0;
}

.form-player-ok-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.form-player-ok-btn:hover {
  opacity: 0.9;
}

.form-player-hint {
  font-size: 13px;
}

.form-player-nav-arrows {
  display: flex;
  margin-left: auto;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  overflow: hidden;
}

.form-player-nav-arrows button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.form-player-nav-arrows button:hover {
  opacity: 1;
}

.form-player-nav-arrows button:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.form-player-nav-arrows button:first-child {
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

/* Thank you screen */
.form-player-thankyou {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 20px;
  text-align: center;
}

.form-player-check {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-player-thankyou h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/FormPlayer.jsx src/pages/FormPlayer.css
git commit -m "feat(forms): add FormPlayer with Typeform-style UX, branching, animations, and keyboard nav"
```

---

## Task 13: Form Responses Page

**Files:**
- Create: `src/pages/FormResponses.jsx`
- Create: `src/pages/FormResponses.css`

- [ ] **Step 1: Create FormResponses page**

Create `src/pages/FormResponses.jsx`:

```javascript
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Download, Search, User } from 'lucide-react';
import { getForm, getFormResponses, deleteFormResponse, exportFormCSV } from '../lib/forms-api';
import './FormResponses.css';

export default function FormResponses() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [{ form: f }, { responses: r }] = await Promise.all([
          getForm(id),
          getFormResponses(id),
        ]);
        setForm(f);
        setResponses(r);
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleDelete(rid) {
    if (!confirm('Delete this response?')) return;
    try {
      await deleteFormResponse(id, rid);
      setResponses((prev) => prev.filter((r) => r.id !== rid));
    } catch (err) {
      console.error('Failed to delete response:', err);
    }
  }

  const questions = form?.questions || [];

  const filtered = responses.filter((r) => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return Object.values(r.answers || {}).some((v) => {
      const str = Array.isArray(v) ? v.join(' ') : String(v ?? '');
      return str.toLowerCase().includes(lc);
    });
  });

  function formatAnswer(val) {
    if (val === undefined || val === null) return '-';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return val.name || JSON.stringify(val);
    return String(val);
  }

  if (loading) {
    return <div className="form-responses-page"><div className="form-responses-loading">Loading...</div></div>;
  }

  return (
    <div className="form-responses-page">
      <div className="form-responses-header">
        <button className="form-responses-back" onClick={() => navigate(`/forms/${id}/edit`)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{form?.title || 'Form'} - Responses</h1>
          <span className="form-responses-count">{responses.length} response{responses.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="form-responses-actions">
          <div className="form-responses-search">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search responses..."
            />
          </div>
          <button className="form-responses-export" onClick={() => exportFormCSV(id)}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="form-responses-empty">
          {responses.length === 0 ? 'No responses yet' : 'No matches found'}
        </div>
      ) : (
        <div className="form-responses-table-wrap">
          <table className="form-responses-table">
            <thead>
              <tr>
                <th>Submitted</th>
                {questions.map((q) => (
                  <th key={q.id}>{q.title || q.type}</th>
                ))}
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.submitted_at).toLocaleString()}</td>
                  {questions.map((q) => (
                    <td key={q.id}>{formatAnswer(r.answers?.[q.id])}</td>
                  ))}
                  <td>
                    {r.contact_id ? (
                      <Link to="/crm" className="form-responses-contact-link">
                        <User size={14} /> View
                      </Link>
                    ) : '-'}
                  </td>
                  <td>
                    <button className="form-responses-delete" onClick={() => handleDelete(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create FormResponses CSS**

Create `src/pages/FormResponses.css`:

```css
.form-responses-page {
  padding: 32px;
  max-width: 1400px;
}

.form-responses-loading {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #6b7280);
}

.form-responses-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.form-responses-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-white, #fff);
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.form-responses-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.form-responses-count {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.form-responses-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.form-responses-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-white, #fff);
  color: var(--text-secondary, #6b7280);
}

.form-responses-search input {
  border: none;
  outline: none;
  font-size: 14px;
  background: transparent;
  color: var(--text-primary, #1a1a1a);
  width: 200px;
}

.form-responses-export {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-white, #fff);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.form-responses-export:hover {
  background: var(--bg-light, #f9fafb);
}

.form-responses-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #6b7280);
}

.form-responses-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 12px;
}

.form-responses-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.form-responses-table th {
  text-align: left;
  padding: 12px 16px;
  background: var(--bg-light, #f9fafb);
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  white-space: nowrap;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
}

.form-responses-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  color: var(--text-primary, #1a1a1a);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-responses-table tr:last-child td {
  border-bottom: none;
}

.form-responses-contact-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-primary, #6366f1);
  text-decoration: none;
  font-weight: 500;
}

.form-responses-delete {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 4px;
}

.form-responses-delete:hover {
  color: #ef4444;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/FormResponses.jsx src/pages/FormResponses.css
git commit -m "feat(forms): add FormResponses page with search, CSV export, and CRM contact links"
```
