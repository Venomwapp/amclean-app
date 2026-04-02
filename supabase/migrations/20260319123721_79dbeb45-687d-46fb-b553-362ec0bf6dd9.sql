DELETE FROM followups WHERE lead_id = '53cddf75-8942-42a5-a1f9-22b4a8885015';
DELETE FROM conversations WHERE lead_id = '53cddf75-8942-42a5-a1f9-22b4a8885015';
DELETE FROM activity_log WHERE metadata->>'lead_id' = '53cddf75-8942-42a5-a1f9-22b4a8885015';
DELETE FROM leads WHERE id = '53cddf75-8942-42a5-a1f9-22b4a8885015';