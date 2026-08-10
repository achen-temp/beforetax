-- Document segmentation: one uploaded file may contain several distinct tax forms
-- (e.g. two employers' W-2s + a 1099 scanned together). The worker detects this,
-- and splits the upload into one CHILD document per form, each covering a subset
-- of the original file's pages. The original row becomes a CONTAINER (not itself
-- extracted); its children carry the extracted data.
--
--   parent_document_id      -> the container row this child was split from (NULL for
--                              normal/standalone docs and for containers themselves)
--   page_numbers            -> 1-based pages of the parent file this child covers
--                              (supports non-contiguous pages, e.g. {1,3})
--   is_container            -> true for a split parent; excluded from doc lists and
--                              never field-extracted
--   segmentation_uncertain  -> AI/OCR disagreed on the split (or extraction didn't
--                              match the predicted form) -> surface for CPA review

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS page_numbers INTEGER[],
  ADD COLUMN IF NOT EXISTS is_container BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS segmentation_uncertain BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_document_id);
