-- Tax Intake Platform — initial schema
-- Every table has firm_id + RLS for multi-tenant isolation

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE cpa_user_role AS ENUM ('owner', 'staff');
CREATE TYPE tax_year_status AS ENUM ('collecting', 'processing', 'review', 'complete');
CREATE TYPE document_file_type AS ENUM (
  'w2', '1099_div', '1099_int', '1099_nec', '1099_misc', '1099_r', '1098', 'k1', 'other'
);
CREATE TYPE document_source AS ENUM ('portal', 'email');
CREATE TYPE extraction_status AS ENUM ('pending', 'processing', 'complete', 'failed');

-- cpa_firms
CREATE TABLE cpa_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  branding JSONB DEFAULT '{}'::jsonb,
  gmail_refresh_token TEXT,
  outlook_refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cpa_users (id = auth.users.id)
CREATE TABLE cpa_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role cpa_user_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cpa_users_firm_id ON cpa_users(firm_id);

-- clients
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  is_email_monitored BOOLEAN NOT NULL DEFAULT true,
  otp_token TEXT,
  otp_expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_id, email)
);

CREATE INDEX idx_clients_firm_id ON clients(firm_id);

-- tax_years
CREATE TABLE tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  status tax_year_status NOT NULL DEFAULT 'collecting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, year)
);

CREATE INDEX idx_tax_years_firm_id ON tax_years(firm_id);
CREATE INDEX idx_tax_years_client_id ON tax_years(client_id);

-- documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  file_type document_file_type NOT NULL DEFAULT 'other',
  source document_source NOT NULL DEFAULT 'portal',
  email_message_id TEXT,
  email_subject TEXT,
  extraction_status extraction_status NOT NULL DEFAULT 'pending',
  extracted_data JSONB,
  raw_claude_response JSONB,
  confidence_score NUMERIC(3, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_firm_id ON documents(firm_id);
CREATE INDEX idx_documents_tax_year_id ON documents(tax_year_id);
CREATE INDEX idx_documents_client_id ON documents(client_id);

-- conflicts
CREATE TABLE conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  values JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES cpa_users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conflicts_firm_id ON conflicts(firm_id);
CREATE INDEX idx_conflicts_tax_year_id ON conflicts(tax_year_id);

-- email_events
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL,
  subject TEXT,
  sender_email TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  attachments_found INTEGER NOT NULL DEFAULT 0,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_events_firm_id ON email_events(firm_id);
CREATE INDEX idx_email_events_client_id ON email_events(client_id);

-- Row Level Security
ALTER TABLE cpa_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpa_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Helper: current user's firm_id
CREATE OR REPLACE FUNCTION current_firm_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM cpa_users WHERE id = auth.uid()
$$;

-- RLS policies
CREATE POLICY "firm_isolation" ON cpa_firms
  FOR ALL USING (id = current_firm_id());

CREATE POLICY "firm_isolation" ON cpa_users
  FOR ALL USING (firm_id = current_firm_id());

CREATE POLICY "firm_isolation" ON clients
  FOR ALL USING (firm_id = current_firm_id());

CREATE POLICY "firm_isolation" ON tax_years
  FOR ALL USING (firm_id = current_firm_id());

CREATE POLICY "firm_isolation" ON documents
  FOR ALL USING (firm_id = current_firm_id());

CREATE POLICY "firm_isolation" ON conflicts
  FOR ALL USING (firm_id = current_firm_id());

CREATE POLICY "firm_isolation" ON email_events
  FOR ALL USING (firm_id = current_firm_id());

-- Storage bucket (run in Supabase dashboard or via API if preferred)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
