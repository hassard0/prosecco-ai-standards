
-- Drop the admin-only policy
DROP POLICY "Admins can manage api_clients" ON public.api_clients;

-- Allow admins full access
CREATE POLICY "Admins can manage api_clients"
ON public.api_clients
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Contributors can see their own clients
CREATE POLICY "Contributors can read own api_clients"
ON public.api_clients
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'contributor'::app_role) AND created_by = auth.uid());

-- Contributors can create clients
CREATE POLICY "Contributors can insert api_clients"
ON public.api_clients
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'contributor'::app_role) AND created_by = auth.uid());

-- Contributors can revoke their own clients
CREATE POLICY "Contributors can update own api_clients"
ON public.api_clients
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'contributor'::app_role) AND created_by = auth.uid())
WITH CHECK (has_role(auth.uid(), 'contributor'::app_role) AND created_by = auth.uid());
