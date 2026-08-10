-- Per-client worklist summary for the CPA clients page. One row per client,
-- scoped to the client's most recent tax year, with document/review rollups and
-- a derived status so a firm with hundreds of clients can be triaged (not just
-- listed). Consumed by lib/supabase/clients.ts via the service-role client.

CREATE OR REPLACE VIEW client_summaries AS
WITH current_ty AS (
  -- The client's latest tax year (most clients have exactly one).
  SELECT DISTINCT ON (client_id) id, client_id, year, status
  FROM tax_years
  ORDER BY client_id, year DESC
),
doc_review AS (
  -- One row per real (non-container) document with its review signals.
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
  -- Lower rank sorts first: surface the review queue at the top by default.
  CASE
    WHEN COALESCE(ds.doc_count, 0) = 0 THEN 2
    WHEN COALESCE(ds.review_count, 0) > 0 THEN 0
    WHEN COALESCE(ds.processing_count, 0) > 0 THEN 1
    ELSE 3
  END AS status_rank
FROM clients c
LEFT JOIN current_ty ct ON ct.client_id = c.id
LEFT JOIN doc_stats ds ON ds.tax_year_id = ct.id;

-- Status tallies for the filter tabs, honoring the same text search as the list.
CREATE OR REPLACE FUNCTION get_client_status_counts(p_firm_id uuid, p_search text DEFAULT NULL)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT cs.status, count(*)::bigint
  FROM client_summaries cs
  WHERE cs.firm_id = p_firm_id
    AND (
      p_search IS NULL OR p_search = ''
      OR cs.name ILIKE '%' || p_search || '%'
      OR cs.email ILIKE '%' || p_search || '%'
    )
  GROUP BY cs.status;
$$;
