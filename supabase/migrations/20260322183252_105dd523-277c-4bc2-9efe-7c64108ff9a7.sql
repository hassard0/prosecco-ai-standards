
-- Create status enum
CREATE TYPE public.standard_status AS ENUM ('Emerging', 'Draft', 'Approved');

-- Create standards table
CREATE TABLE public.standards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  acronym TEXT,
  logo_url TEXT,
  link TEXT,
  status public.standard_status NOT NULL DEFAULT 'Emerging',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tags table for future filtering
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Standards are publicly readable"
  ON public.standards FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tags are publicly readable"
  ON public.tags FOR SELECT
  TO anon, authenticated
  USING (true);

-- Indexes
CREATE INDEX idx_standards_status ON public.standards (status);
CREATE INDEX idx_standards_tags ON public.standards USING GIN (tags);
CREATE INDEX idx_standards_title_search ON public.standards USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(acronym, '')));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_standards_updated_at
  BEFORE UPDATE ON public.standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
