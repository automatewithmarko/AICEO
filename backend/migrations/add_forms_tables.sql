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
