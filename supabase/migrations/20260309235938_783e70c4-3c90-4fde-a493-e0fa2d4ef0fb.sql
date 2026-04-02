ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_language_check;
ALTER TABLE leads ADD CONSTRAINT leads_language_check CHECK (language IN ('fr', 'nl', 'en', 'pt'));