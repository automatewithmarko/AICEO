-- Links external recordings (Fireflies/Fathom from integration_data) to CRM contacts
-- Parallel to meeting_contacts which only works with the meetings table

CREATE TABLE IF NOT EXISTS external_recording_contacts (
  integration_data_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'participant',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (integration_data_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_rec_contacts_contact ON external_recording_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_ext_rec_contacts_user ON external_recording_contacts (user_id);
