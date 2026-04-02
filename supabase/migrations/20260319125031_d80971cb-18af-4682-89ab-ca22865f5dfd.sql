DELETE FROM followups WHERE lead_id = '6cf30807-35af-419b-88b8-f0f9487c502c';
DELETE FROM conversations WHERE lead_id = '6cf30807-35af-419b-88b8-f0f9487c502c';
DELETE FROM appointments WHERE lead_id = '6cf30807-35af-419b-88b8-f0f9487c502c';
DELETE FROM activity_log WHERE metadata->>'lead_id' = '6cf30807-35af-419b-88b8-f0f9487c502c';
DELETE FROM leads WHERE id = '6cf30807-35af-419b-88b8-f0f9487c502c';
INSERT INTO leads (active_agent, company_name, contact_name, language, location, score, service_requested, source, space_type, status, whatsapp_number)
VALUES ('sophie', 'KX Soluções', 'Kedson Xavier', 'pt', 'Goiânia, Brasil', 'WARM', 'limpeza profissional', 'prospecting', 'escritório', 'new', '5562993905945')
ON CONFLICT (whatsapp_number) DO NOTHING;