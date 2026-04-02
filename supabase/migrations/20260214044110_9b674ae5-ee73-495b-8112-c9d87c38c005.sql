
-- =============================================
-- AM CLEAN AI AGENTS SYSTEM — FULL SCHEMA
-- =============================================

-- 1. ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.lead_score AS ENUM ('HOT', 'WARM', 'COLD');
CREATE TYPE public.lead_status AS ENUM ('new', 'qualifying', 'scheduled', 'followup_1', 'followup_2', 'followup_3', 'converted', 'lost');
CREATE TYPE public.appointment_type AS ENUM ('visit', 'call');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.agent_name AS ENUM ('claire', 'sophie', 'lucas', 'emma');
CREATE TYPE public.conversation_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE public.followup_status AS ENUM ('pending', 'sent', 'cancelled');

-- 2. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 4. LEADS TABLE
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT UNIQUE,
  contact_name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'nl', 'en')),
  service_requested TEXT,
  space_type TEXT,
  surface_area TEXT,
  frequency TEXT,
  location TEXT,
  timeline TEXT,
  message TEXT,
  score lead_score,
  status lead_status DEFAULT 'new',
  appointment_type appointment_type,
  appointment_datetime TIMESTAMPTZ,
  active_agent agent_name DEFAULT 'claire',
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'website', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage leads" ON public.leads FOR ALL USING (public.has_role(auth.uid(), 'admin'));
-- Allow anonymous inserts from the website form
CREATE POLICY "Anyone can insert leads from website" ON public.leads FOR INSERT WITH CHECK (source = 'website');

-- 5. CONVERSATIONS TABLE
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  role conversation_role NOT NULL,
  content TEXT NOT NULL,
  agent agent_name DEFAULT 'claire',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_lead ON public.conversations(lead_id, created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage conversations" ON public.conversations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 6. APPOINTMENTS TABLE
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  type appointment_type NOT NULL,
  datetime TIMESTAMPTZ NOT NULL,
  location TEXT,
  google_event_id TEXT,
  status appointment_status DEFAULT 'scheduled',
  reminder_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage appointments" ON public.appointments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7. AGENT CONFIGS TABLE
CREATE TABLE public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name agent_name NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  temperature NUMERIC DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage agent configs" ON public.agent_configs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Edge functions can read agent configs" ON public.agent_configs FOR SELECT USING (true);

-- 8. FOLLOWUPS TABLE
CREATE TABLE public.followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK (step IN (1, 2, 3)),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  message TEXT NOT NULL,
  status followup_status DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage followups" ON public.followups FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 9. PLANNING TABLES (Team & Schedule Management)

-- Employees / Team members
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'cleaner',
  is_active BOOLEAN DEFAULT TRUE,
  color TEXT DEFAULT '#2196F3',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Client sites (locations where cleaning happens)
CREATE TABLE public.client_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  service_type TEXT,
  frequency TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage client sites" ON public.client_sites FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Weekly schedule / planning entries
CREATE TABLE public.schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_site_id UUID NOT NULL REFERENCES public.client_sites(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT TRUE,
  specific_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage schedule" ON public.schedule_entries FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 10. TRIGGERS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_configs_updated_at BEFORE UPDATE ON public.agent_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_sites_updated_at BEFORE UPDATE ON public.client_sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_entries_updated_at BEFORE UPDATE ON public.schedule_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 12. ENABLE REALTIME for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
