-- Manual correction of extracted values (CPA + client).
--
-- document_fields.value_* is the EFFECTIVE, editable value; documents.extracted_data
-- keeps the immutable AI snapshot, so an edit never loses the original AI read.
--
-- Existing columns already support CPA sign-off: is_verified / verified_by /
-- verified_at. These two add the client-side correction signal:
--   client_edited -> the taxpayer changed this value; it's a correction PENDING CPA
--                    review, NOT a professional sign-off (verified stays false).
--   edited_at     -> when the value was last hand-edited (by either party), for UI.

ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS client_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
