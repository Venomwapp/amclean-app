DELETE FROM followups WHERE lead_id = '703e66ca-8604-40fc-aa42-352fa92508c4';
DELETE FROM conversations WHERE lead_id = '703e66ca-8604-40fc-aa42-352fa92508c4';
DELETE FROM activity_log WHERE metadata->>'lead_id' = '703e66ca-8604-40fc-aa42-352fa92508c4';
DELETE FROM leads WHERE id = '703e66ca-8604-40fc-aa42-352fa92508c4';
INSERT INTO leads (active_agent, company_name, contact_name, language, location, score, service_requested, source, space_type, status, whatsapp_number)
VALUES ('sophie', 'KX Soluções', 'Kedson Xavier', 'pt', 'Goiânia, Brasil', 'WARM', 'limpeza profissional', 'prospecting', 'escritório', 'new', '5562993905945')
ON CONFLICT (whatsapp_number) DO NOTHING;