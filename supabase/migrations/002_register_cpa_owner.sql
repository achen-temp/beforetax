-- Atomic CPA owner registration: firm + cpa_users in one transaction
CREATE OR REPLACE FUNCTION register_cpa_owner(
  p_user_id UUID,
  p_firm_name TEXT,
  p_email TEXT
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

  INSERT INTO cpa_users (id, firm_id, email, role)
  VALUES (p_user_id, v_firm_id, p_email, 'owner');

  RETURN v_firm_id;
END;
$$;
