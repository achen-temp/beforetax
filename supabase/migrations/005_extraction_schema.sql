-- Extraction schema: owner dimension, normalized document_fields, dedup, checklist
-- See docs/database-schema.md

-- 1. New enum for taxpayer/spouse dimension
CREATE TYPE document_owner AS ENUM (
  'unknown', 'taxpayer', 'spouse', 'joint', 'dependent'
);

-- 2. clients — household / return details
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS filing_status TEXT,
  ADD COLUMN IF NOT EXISTS taxpayer_name TEXT,
  ADD COLUMN IF NOT EXISTS spouse_name TEXT;

-- 3. tax_years — checklist drives completion % and missing-doc detection
ALTER TABLE tax_years
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. documents — owner, file dedup, and switch file_type enum -> text
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS owner document_owner NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Convert file_type from enum to free text (validated in app code)
ALTER TABLE documents
  ALTER COLUMN file_type DROP DEFAULT;
ALTER TABLE documents
  ALTER COLUMN file_type TYPE TEXT USING file_type::TEXT;
ALTER TABLE documents
  ALTER COLUMN file_type SET DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_documents_hash
  ON documents(tax_year_id, file_hash);

-- 5. document_fields — normalized extraction line items (effective values)
CREATE TABLE document_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  tax_year_id UUID NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  owner document_owner NOT NULL DEFAULT 'unknown',
  form_type TEXT NOT NULL,
  box TEXT,
  line_index INTEGER NOT NULL DEFAULT 0,
  code TEXT,
  field_key TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'text',

  value_number NUMERIC,
  value_text TEXT,
  value_date DATE,

  source_json_path TEXT,
  confidence NUMERIC(3, 2),

  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES cpa_users(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_fields_line
    UNIQUE (document_id, owner, field_key, box, line_index)
);

CREATE INDEX idx_document_fields_firm_id ON document_fields(firm_id);
CREATE INDEX idx_document_fields_lookup
  ON document_fields(tax_year_id, owner, field_key);

ALTER TABLE document_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm_isolation" ON document_fields
  FOR ALL USING (
    firm_id = (SELECT firm_id FROM cpa_users WHERE id = auth.uid())
  );

-- 6. conflicts — per-person conflicts (field_name -> field_key + owner)
ALTER TABLE conflicts
  RENAME COLUMN field_name TO field_key;
ALTER TABLE conflicts
  ADD COLUMN IF NOT EXISTS owner document_owner NOT NULL DEFAULT 'unknown';
