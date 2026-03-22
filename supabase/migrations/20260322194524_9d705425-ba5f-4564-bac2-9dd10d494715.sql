
-- Add resources column to standards table
ALTER TABLE public.standards ADD COLUMN resources jsonb DEFAULT '[]'::jsonb;

-- Create table for cached mailing list summaries
CREATE TABLE public.standard_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid REFERENCES public.standards(id) ON DELETE CASCADE NOT NULL,
  summary text NOT NULL,
  source_url text NOT NULL,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(standard_id, source_url)
);

ALTER TABLE public.standard_summaries ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Summaries are publicly readable" ON public.standard_summaries
  FOR SELECT TO anon, authenticated USING (true);

-- Admins can manage
CREATE POLICY "Admins can insert summaries" ON public.standard_summaries
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update summaries" ON public.standard_summaries
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete summaries" ON public.standard_summaries
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
