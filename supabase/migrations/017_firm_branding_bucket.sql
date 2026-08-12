-- Public bucket for CPA firm logos (portal branding). File bytes live in Storage;
-- cpa_firms.branding.logoUrl stores the public URL (JSONB already exists).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firm-branding',
  'firm-branding',
  true,
  1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (public logos for client portal). Writes go through service role
-- from the app, so no broad insert/update policies for authenticated users.
