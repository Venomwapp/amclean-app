
-- Prospecting configurations table
CREATE TABLE public.prospecting_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  niche TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'Belgique',
  search_query TEXT,
  is_active BOOLEAN DEFAULT true,
  max_leads_per_run INTEGER DEFAULT 40,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prospecting_configs ENABLE ROW LEVEL SECURITY;

-- Admin only policy
CREATE POLICY "Admins can manage prospecting configs"
  ON public.prospecting_configs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Prospecting runs log
CREATE TABLE public.prospecting_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES public.prospecting_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running',
  leads_found INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.prospecting_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage prospecting runs"
  ON public.prospecting_runs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));
