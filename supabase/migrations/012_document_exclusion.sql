-- Reversible "skip" for documents. A skipped document stays stored and viewable
-- but is dropped from the assembled tax data, checklist rollups, review counts,
-- and any export. Both CPAs and portal clients can skip/restore their own docs.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_by_role TEXT,
  ADD COLUMN IF NOT EXISTS excluded_by UUID;

-- Recreate the clients worklist view so skipped documents no longer count toward
-- doc/review/failed tallies or the derived status. (Identical to 011 except the
-- doc_review filter now also requires excluded_at IS NULL.)
CREATE OR REPLACE VIEW client_summaries AS
WITH current_ty AS (
  SELECT DISTINCT ON (client_id) id, client_id, year, status
  FROM tax_years
  ORDER BY client_id, year DESC
),
doc_review AS (
  SELECT
    d.id,
    d.tax_year_id,
    d.created_at,
    (d.extraction_status IN ('pending', 'processing', 'queued')) AS is_processing,
    (d.extraction_status = 'failed') AS is_failed,
    (
      d.extraction_status = 'failed'
      OR d.segmentation_uncertain
      OR EXISTS (
        SELECT 1 FROM document_fields f
        WHERE f.document_id = d.id AND f.is_verified = false
      )
    ) AS needs_review,
    EXISTS (
      SELECT 1 FROM document_fields f
      WHERE f.document_id = d.id
        AND f.is_verified = false
        AND f.confidence IS NOT NULL
        AND f.confidence < 0.90
    ) AS has_lowconf
  FROM documents d
  WHERE d.is_container = false
    AND d.excluded_at IS NULL
),
doc_stats AS (
  SELECT
    dr.tax_year_id,
    count(*) AS doc_count,
    count(*) FILTER (WHERE dr.is_processing) AS processing_count,
    count(*) FILTER (WHERE dr.needs_review) AS review_count,
    count(*) FILTER (WHERE dr.is_failed) AS failed_count,
    count(*) FILTER (WHERE dr.has_lowconf) AS lowconf_count,
    max(dr.created_at) AS last_doc_at
  FROM doc_review dr
  GROUP BY dr.tax_year_id
)
SELECT
  c.id,
  c.firm_id,
  c.name,
  c.email,
  c.phone,
  c.created_at,
  c.last_accessed_at,
  c.portal_token,
  ct.year AS tax_year,
  COALESCE(ds.doc_count, 0) AS doc_count,
  COALESCE(ds.processing_count, 0) AS processing_count,
  COALESCE(ds.review_count, 0) AS review_count,
  COALESCE(ds.failed_count, 0) AS failed_count,
  COALESCE(ds.lowconf_count, 0) AS lowconf_count,
  GREATEST(c.last_accessed_at, ds.last_doc_at) AS last_activity_at,
  CASE
    WHEN COALESCE(ds.doc_count, 0) = 0 THEN 'not_started'
    WHEN COALESCE(ds.review_count, 0) > 0 THEN 'needs_review'
    WHEN COALESCE(ds.processing_count, 0) > 0 THEN 'in_progress'
    ELSE 'complete'
  END AS status,
  CASE
    WHEN COALESCE(ds.doc_count, 0) = 0 THEN 2
    WHEN COALESCE(ds.review_count, 0) > 0 THEN 0
    WHEN COALESCE(ds.processing_count, 0) > 0 THEN 1
    ELSE 3
  END AS status_rank
FROM clients c
LEFT JOIN current_ty ct ON ct.client_id = c.id
LEFT JOIN doc_stats ds ON ds.tax_year_id = ct.id;
