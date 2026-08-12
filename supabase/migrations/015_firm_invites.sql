-- Firm team invites: owner invites colleagues by email; they join via token link
-- (never self-serve join / second firm signup).

CREATE TABLE firm_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES cpa_firms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role cpa_user_role NOT NULL DEFAULT 'staff',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES cpa_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT firm_invites_role_not_owner CHECK (role <> 'owner')
);

CREATE INDEX idx_firm_invites_firm_id ON firm_invites(firm_id);
CREATE INDEX idx_firm_invites_token ON firm_invites(token);

-- One pending invite per email per firm
CREATE UNIQUE INDEX firm_invites_pending_email
  ON firm_invites (firm_id, lower(email))
  WHERE accepted_at IS NULL;

ALTER TABLE firm_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_isolation" ON firm_invites
  FOR ALL USING (firm_id = current_firm_id());

-- Current CPA role helper (for app + future RLS)
CREATE OR REPLACE FUNCTION current_cpa_role()
RETURNS cpa_user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM cpa_users WHERE id = auth.uid()
$$;

-- Accept invite: bind auth user to the inviting firm as staff (atomic)
CREATE OR REPLACE FUNCTION accept_firm_invite(
  p_token TEXT,
  p_user_id UUID,
  p_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite firm_invites%ROWTYPE;
  v_existing_firm UUID;
BEGIN
  SELECT * INTO v_invite
  FROM firm_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_already_accepted';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF lower(v_invite.email) <> lower(p_email) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  SELECT firm_id INTO v_existing_firm
  FROM cpa_users
  WHERE id = p_user_id;

  IF FOUND THEN
    RAISE EXCEPTION 'user_already_in_firm';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cpa_users
    WHERE firm_id = v_invite.firm_id AND lower(email) = lower(p_email)
  ) THEN
    RAISE EXCEPTION 'email_already_member';
  END IF;

  INSERT INTO cpa_users (id, firm_id, email, role)
  VALUES (p_user_id, v_invite.firm_id, lower(p_email), v_invite.role);

  UPDATE firm_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.firm_id;
END;
$$;
