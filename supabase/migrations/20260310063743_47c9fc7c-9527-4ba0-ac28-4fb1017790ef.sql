
DELETE FROM conversations;
DELETE FROM followups;
DELETE FROM activity_log;
DELETE FROM appointments;
DELETE FROM leads;

INSERT INTO leads (contact_name, whatsapp_number, phone, language, source, status, active_agent, score)
VALUES ('Kedson', '5562993905945', '+55 62 993905945', 'pt', 'prospecting', 'new', 'sophie', 'HOT');
