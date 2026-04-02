-- Tabela para tracking do estado do Telegram bot
CREATE TABLE telegram_bot_state (
  id INT PRIMARY KEY DEFAULT 1,
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO telegram_bot_state (id, update_offset) VALUES (1, 0);

ALTER TABLE telegram_bot_state ENABLE ROW LEVEL SECURITY;

-- Tabela para orçamentos
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  total_amount NUMERIC,
  items JSONB DEFAULT '[]'::jsonb,
  raw_audio_text TEXT,
  pdf_url TEXT,
  telegram_state TEXT DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage quotes" ON quotes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));