DELETE FROM conversations WHERE lead_id = 'c2511a73-98d8-495e-bd0d-8a4e920eaf85';
DELETE FROM followups WHERE lead_id = 'c2511a73-98d8-495e-bd0d-8a4e920eaf85';
UPDATE leads SET status = 'new', updated_at = now() WHERE id = 'c2511a73-98d8-495e-bd0d-8a4e920eaf85';