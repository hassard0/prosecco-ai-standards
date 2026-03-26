
-- Update list_admins to include contributors
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE(user_id uuid, email text, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, au.email::text, ur.role
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  WHERE ur.role IN ('admin', 'contributor')
  ORDER BY ur.role, au.email
$$;

-- Allow admins to update user roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update roles' AND tablename = 'user_roles'
  ) THEN
    CREATE POLICY "Admins can update roles"
    ON public.user_roles
    FOR UPDATE
    TO authenticated
    USING (has_role(auth.uid(), 'admin'))
    WITH CHECK (has_role(auth.uid(), 'admin'));
  END IF;
END $$;
