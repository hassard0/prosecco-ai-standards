ALTER TABLE public.standard_summaries 
  ADD COLUMN IF NOT EXISTS whats_new text,
  ADD COLUMN IF NOT EXISTS timeline_events jsonb DEFAULT '[]'::jsonb;