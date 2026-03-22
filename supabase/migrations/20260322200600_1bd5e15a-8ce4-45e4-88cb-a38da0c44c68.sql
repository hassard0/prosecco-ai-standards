
CREATE TABLE public.standard_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid REFERENCES public.standards(id) ON DELETE CASCADE NOT NULL,
  user_email text,
  feedback text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'applied', 'dismissed')),
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.standard_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a flag
CREATE POLICY "Anyone can insert flags" ON public.standard_flags
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admins can read all flags
CREATE POLICY "Admins can read flags" ON public.standard_flags
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Admins can update flags
CREATE POLICY "Admins can update flags" ON public.standard_flags
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Admins can delete flags
CREATE POLICY "Admins can delete flags" ON public.standard_flags
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
