INSERT INTO leads (active_agent, company_name, contact_name, language, location, score, service_requested, source, space_type, status, whatsapp_number)
VALUES ('sophie', 'KX Soluções', 'Kedson Xavier', 'pt', 'Goiânia, Brasil', 'WARM', 'limpeza profissional', 'prospecting', 'escritório', 'new', '5562993905945')
ON CONFLICT (whatsapp_number) DO NOTHING;