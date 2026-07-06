-- Private bucket for client tax document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;
