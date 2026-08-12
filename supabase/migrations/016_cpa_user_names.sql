-- CPA user personal names + update registration / invite RPCs

ALTER TABLE cpa_users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Owner signup now stores the owner's name
CREATE OR REPLACE FUNCTION register_cpa_owner(
  p_user_id UUID,
  p_firm_name TEXT,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id UUID;
BEGIN
  INSERT INTO cpa_firms (name, email)
  VALUES (p_firm_name, p_email)
  RETURNING id INTO v_firm_id;

  INSERT INTO cpa_users (id, firm_id, email, role, first_name, last_name)
  VALUES (
    p_user_id,
    v_firm_id,
    p_email,
    'owner',
    NULLIF(trim(p_first_name), ''),
    NULLIF(trim(p_last_name), '')
  );

  RETURN v_firm_id;
END;
$$;

-- Accept invite and store the joiner's name
CREATE OR REPLACE FUNCTION accept_firm_invite(
  p_token TEXT,
  p_user_id UUID,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
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

  INSERT INTO cpa_users (id, firm_id, email, role, first_name, last_name)
  VALUES (
    p_user_id,
    v_invite.firm_id,
    lower(p_email),
    v_invite.role,
    NULLIF(trim(p_first_name), ''),
    NULLIF(trim(p_last_name), '')
  );

  UPDATE firm_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.firm_id;
END;
$$;
