-- Add 'queued' to the extraction_status enum.
-- The app enqueues background extraction via Inngest and sets
-- extraction_status = 'queued' (lib/supabase/extraction.ts#markExtractionQueued),
-- but the enum defined in 001_initial_schema.sql only had
-- pending / processing / complete / failed. Writing 'queued' therefore fails with
-- invalid_text_representation unless the value was added manually. This makes it
-- reproducible.
--
-- IF NOT EXISTS makes this safe to run even if the value was already added by hand.
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value is
-- not used in the same transaction (it isn't here), so `supabase db push` is fine.

ALTER TYPE extraction_status ADD VALUE IF NOT EXISTS 'queued';
