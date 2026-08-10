-- Firm-level configuration (CPA account settings).
-- Stored as a single JSONB blob so new toggles can be added without a migration.
-- Read/merged with code-side defaults (lib/supabase/firm-settings.ts), so an empty
-- object means "all defaults".
--
-- First setting: skipDuplicateUploads (default true) — controls whether the portal
-- rejects a re-upload of identical file content within a tax year.

ALTER TABLE cpa_firms
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
