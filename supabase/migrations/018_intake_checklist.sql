-- CPA intake checklist (tax-prep "what to bring"), separate from tax_years.checklist
-- which is DocumentType-based and used only by tax-data assembly.
-- Shape: [{ id, categoryId, label, status }] — see lib/tax/intake-checklist.ts

ALTER TABLE tax_years
  ADD COLUMN IF NOT EXISTS intake_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
