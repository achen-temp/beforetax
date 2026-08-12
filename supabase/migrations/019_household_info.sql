-- Year-scoped household / "Your info" for the taxpayer portal.
-- Separate from clients.filing_status (legacy display fields); this JSON is the
-- source of truth for the questionnaire and prior-return prefills.

ALTER TABLE tax_years
  ADD COLUMN IF NOT EXISTS household_info JSONB NOT NULL DEFAULT '{}'::jsonb;
