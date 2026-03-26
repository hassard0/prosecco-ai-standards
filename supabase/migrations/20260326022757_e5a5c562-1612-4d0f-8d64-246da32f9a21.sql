
-- Re-add contributor to enum (previous migration transaction rolled back)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contributor';
