-- Add last_run_at column to track rotation
ALTER TABLE public.prospecting_configs ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

-- Clear old configs and insert the 9 target niches
-- Each niche rotates across Belgian regions automatically
DELETE FROM public.prospecting_configs;

INSERT INTO public.prospecting_configs (niche, region, is_active, max_leads_per_run) VALUES
  ('cabinet', 'Belgique', true, 40),
  ('clinique', 'Belgique', true, 40),
  ('hôtel', 'Belgique', true, 40),
  ('magasin', 'Belgique', true, 40),
  ('bureau', 'Belgique', true, 40),
  ('boulangerie', 'Belgique', true, 40),
  ('syndic', 'Belgique', true, 40),
  ('immeubles', 'Belgique', true, 40),
  ('nettoyage', 'Belgique', true, 40);
