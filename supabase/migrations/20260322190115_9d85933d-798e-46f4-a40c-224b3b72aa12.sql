-- Function to grant admin role by email (only callable by existing admins via RPC)
CREATE OR REPLACE FUNCTION public.grant_admin_by_email(_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _result json;
BEGIN
  -- Look up user by email
  SELECT id INTO _user_id FROM auth.users WHERE email = _email;
  
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No account found with that email. They must sign up first.');
  END IF;
  
  -- Check if already admin
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'User is already an admin.');
  END IF;
  
  -- Grant admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin');
  
  RETURN json_build_object('success', true);
END;
$$;