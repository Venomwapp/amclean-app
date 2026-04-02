
-- Invoices table for billing management
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id),
  client_site_id UUID REFERENCES public.client_sites(id),
  invoice_number TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21,
  tax_amount NUMERIC(10,2) GENERATED ALWAYS AS (amount * tax_rate / 100) STORED,
  total NUMERIC(10,2) GENERATED ALWAYS AS (amount + (amount * tax_rate / 100)) STORED,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date DATE,
  paid_date DATE,
  description TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoices" ON public.invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity log for CEO oversight
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'lead_new', 'lead_converted', 'appointment_scheduled', 'invoice_paid', 'escalation', etc.
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity log" ON public.activity_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert activity log" ON public.activity_log FOR INSERT
  WITH CHECK (true);

-- Enable realtime for invoices
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
