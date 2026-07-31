-- Content-based upload dedup.
-- migration 005 added `file_hash` + a non-unique lookup index but never populated
-- or enforced it. The app now computes a SHA-256 of the file in the browser and
-- sends it on upload. Enforce one row per identical file within a tax year so a
-- race (double-click / two tabs) can't slip a duplicate past the app-level check.
--
-- Partial predicate:
--   * file_hash IS NOT NULL      -> legacy/email rows without a hash are unaffected
--   * extraction_status <> 'failed' -> a failed upload doesn't block re-uploading
--                                      the same file

DROP INDEX IF EXISTS idx_documents_hash;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_hash
  ON documents (tax_year_id, file_hash)
  WHERE file_hash IS NOT NULL AND extraction_status <> 'failed';
