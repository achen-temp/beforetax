-- Portal link token for client OTP entry (separate from hashed OTP)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_clients_portal_token ON clients(portal_token);
