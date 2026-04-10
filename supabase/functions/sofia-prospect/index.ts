import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtractedLead {
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  service_requested: string | null;
  space_type: string | null;
  score: null;
  website: string | null;
}

// ==================== QUERY GENERATION ====================

// Scraping restricted to Brussels-Capital Region only (19 communes)
const BELGIAN_REGIONS = [
  'Bruxelles', 'Ixelles', 'Uccle', 'Schaerbeek', 'Anderlecht', 'Etterbeek',
  'Woluwe-Saint-Lambert', 'Woluwe-Saint-Pierre', 'Saint-Gilles', 'Forest', 'Jette',
  'Molenbeek-Saint-Jean', 'Saint-Josse-ten-Noode', 'Evere', 'Ganshoren',
  'Koekelberg', 'Berchem-Sainte-Agathe', 'Auderghem', 'Watermael-Boitsfort',
];

const nicheVariants: Record<string, string[]> = {
  'restaurant': ['restaurant', 'brasserie', 'traiteur', 'café restaurant', 'pizzeria'],
  'bureau': ['bureaux', 'office', 'espace de travail', 'centre d\'affaires'],
  'hôtel': ['hôtel', 'hotel', 'hébergement', 'auberge', 'B&B', 'chambre d\'hôte'],
  'clinique': ['clinique', 'cabinet médical', 'centre médical', 'cabinet dentaire', 'maison médicale', 'centre de santé'],
  'école': ['école', 'institut', 'lycée', 'collège', 'académie', 'centre de formation'],
  'salle de sport': ['salle de sport', 'fitness', 'club sportif', 'gym', 'centre sportif', 'crossfit'],
  'pharmacie': ['pharmacie', 'apotheek', 'parapharmacie'],
  'crèche': ['crèche', 'garderie', 'kinderopvang', 'halte-accueil'],
  'maison de repos': ['maison de repos', 'résidence seniors', 'woonzorgcentrum', 'home'],
  'coworking': ['coworking', 'espace partagé', 'shared workspace', 'hub'],
  'syndic': ['syndic', 'copropriété', 'gestion immobilière', 'gérance'],
  'magasin': ['magasin', 'boutique', 'commerce', 'shop'],
  'immeubles': ['immeuble', 'syndic copropriété', 'gestion immeuble', 'résidence'],
  'cabinet': ['cabinet avocat', 'cabinet comptable', 'notaire', 'fiduciaire', 'expert-comptable'],
  'agence immobilière': ['agence immobilière', 'immobilier', 'real estate', 'immo'],
  'construction': ['entreprise de construction', 'bouwbedrijf', 'construction', 'rénovation', 'entrepreneur'],
  'salon': ['salon de coiffure', 'salon de beauté', 'kapsalon', 'spa', 'institut de beauté', 'barbershop'],
  'garage': ['garage automobile', 'autogarage', 'carrosserie', 'mécanicien'],
  'boulangerie': ['boulangerie', 'pâtisserie', 'bakkerij', 'chocolatier'],
  'supermarché': ['supermarché', 'épicerie', 'supermarkt', 'night shop', 'alimentation'],
  'nettoyage': ['entreprise de nettoyage', 'société de nettoyage', 'cleaning', 'entretien'],
  'concessionnaire': ['concessionnaire', 'garage auto', 'vente automobile'],
  'vétérinaire': ['vétérinaire', 'clinique vétérinaire', 'dierenarts'],
  'opticien': ['opticien', 'lunetterie', 'optique'],
  'assurance': ['assurance', 'courtier', 'assureur', 'verzekering'],
};

function generateSearchQueries(niche: string, region: string): string[] {
  const queries: string[] = [];
  const nicheLower = niche.toLowerCase().trim();
  let terms = [niche];

  for (const [key, variants] of Object.entries(nicheVariants)) {
    if (nicheLower.includes(key) || key.includes(nicheLower)) {
      terms = variants;
      break;
    }
  }

  for (const term of terms) {
    // Standard web search queries
    queries.push(`${term} ${region} téléphone mobile`);
    queries.push(`${term} ${region} contact GSM`);
    queries.push(`${term} ${region} 04 numéro`);

    // Directory-targeted queries
    queries.push(`site:google.com/maps ${term} ${region}`);
    queries.push(`site:pagesdor.be ${term} ${region}`);
    queries.push(`site:yelp.be ${term} ${region}`);
    queries.push(`site:infobel.com ${term} ${region}`);

    // Social media (often has mobile numbers)
    queries.push(`site:facebook.com ${term} ${region} belgique`);
  }

  // Limit total queries to avoid memory issues on edge functions
  return [...new Set(queries)].slice(0, 12);
}

// ==================== EXTRACTION ====================

// Belgian mobile regex — only 04x numbers (no landlines)
const MOBILE_REGEX = /(?:\+32|0032|0)\s*4[5-9][\d\s\-\.\/]{6,10}/g;
const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.\w{2,}/g;

// Domains of directories/platforms — their emails belong to the platform, not the business
const DIRECTORY_DOMAINS = [
  'bottin.be', 'pagesdor.be', 'goldenpages.be', 'yelp.com', 'yelp.be',
  'tripadvisor.com', 'tripadvisor.be', 'google.com', 'facebook.com',
  'instagram.com', 'linkedin.com', 'twitter.com', 'tiktok.com',
  'doctoranytime.be', 'doctolib.be', 'doctolib.fr', 'mondocteur.be',
  'infobel.com', 'cylex.be', 'hotfrog.be', 'kompass.com',
  'europages.com', 'trustpilot.com', 'glassdoor.com',
  'immoweb.be', 'immovlan.be', 'zimmo.be',
  'booking.com', 'hotels.com', 'expedia.com',
  'fresha.com', 'treatwell.be', 'planity.com', 'salonkee.com',
  'uber.com', 'deliveroo.com', 'takeaway.com',
  'wordpress.com', 'wix.com', 'squarespace.com', 'godaddy.com',
  'sentry.io', 'googleapis.com', 'gstatic.com', 'cloudflare.com',
];

function isDirectoryEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return DIRECTORY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

function isJunkEmail(email: string): boolean {
  if (isDirectoryEmail(email)) return true;
  if (email.match(/^(noreply|no-reply|mailer-daemon|postmaster|example|test|sampleemail|privacy|dpo|gdpr|cookie|webmaster|abuse)@/i)) return true;
  if (email.match(/@(example|test|sentry|localhost)\./i)) return true;
  if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.svg')) return true;
  return false;
}

// Extract JSON-LD structured data from markdown/HTML
function extractFromJsonLd(markdown: string): { phone: string | null; email: string | null; name: string | null; address: string | null } {
  const result = { phone: null as string | null, email: null as string | null, name: null as string | null, address: null as string | null };

  // Look for JSON-LD blocks in the content
  const jsonLdMatches = markdown.matchAll(/"@type"\s*:\s*"(?:LocalBusiness|Organization|Restaurant|Store|MedicalBusiness|HealthAndBeautyBusiness|[^"]+)"/g);

  for (const _ of jsonLdMatches) {
    // Try to find telephone field near the match
    const phoneMatch = markdown.match(/"telephone"\s*:\s*"([^"]+)"/);
    if (phoneMatch) {
      const phone = phoneMatch[1];
      // Only keep if it's a mobile number
      if (phone.match(/(?:\+32|0032|0)\s*4[5-9]/)) {
        result.phone = phone;
      }
    }

    const emailMatch = markdown.match(/"email"\s*:\s*"([^"]+)"/);
    if (emailMatch) result.email = emailMatch[1];

    const nameMatch = markdown.match(/"name"\s*:\s*"([^"]+)"/);
    if (nameMatch) result.name = nameMatch[1];

    const addressMatch = markdown.match(/"streetAddress"\s*:\s*"([^"]+)"/);
    if (addressMatch) result.address = addressMatch[1];

    break;
  }

  return result;
}

function extractLeadsFromMarkdown(markdown: string, url: string, niche: string): ExtractedLead[] {
  const leads: ExtractedLead[] = [];

  // First try JSON-LD extraction (most reliable)
  const jsonLd = extractFromJsonLd(markdown);
  if (jsonLd.name && jsonLd.phone) {
    const jsonLdLead = createLead(jsonLd.name, jsonLd.phone, jsonLd.email, jsonLd.address, url, niche);
    if (jsonLdLead) leads.push(jsonLdLead);
  }

  // Strategy 1: Structured listings (directory pages)
  const lines = markdown.split('\n').filter(l => l.trim().length > 0);
  const namePatterns = [
    /^#{1,4}\s+(.+)/,
    /^\*\*(.+?)\*\*/,
    /^\[(.+?)\]\(http/,
    /^>\s*\*\*(.+?)\*\*/,          // Blockquote bold
  ];

  let currentName: string | null = null;
  let currentPhone: string | null = null;
  let currentEmail: string | null = null;
  let currentAddress: string | null = null;
  let currentWebsite: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const pattern of namePatterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[1].length > 2 && match[1].length < 80) {
        if (currentName && (currentPhone || currentEmail)) {
          const newLead = createLead(currentName, currentPhone, currentEmail, currentAddress, currentWebsite, niche);
          if (newLead) leads.push(newLead);
        }
        currentName = match[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        currentPhone = null;
        currentEmail = null;
        currentAddress = null;
        currentWebsite = null;
        break;
      }
    }

    // Extract mobile phone only
    const mobileMatch = line.match(MOBILE_REGEX);
    if (mobileMatch && !currentPhone) {
      currentPhone = mobileMatch[0];
    }

    const emailMatch = line.match(EMAIL_REGEX);
    if (emailMatch && !currentEmail) {
      const email = emailMatch[0];
      if (!isJunkEmail(email)) {
        currentEmail = email;
      }
    }

    // Belgian postal code
    const addressMatch = line.match(/\d{4}\s+[A-ZÀ-Ü][a-zà-ü]+/);
    if (addressMatch && !currentAddress) {
      currentAddress = line.replace(/^[-–•*]\s*/, '').trim();
    }

    const urlMatch = line.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (urlMatch && !currentWebsite) {
      currentWebsite = urlMatch[1];
    }
  }

  // Don't forget the last lead
  if (currentName && (currentPhone || currentEmail)) {
    leads.push(createLead(currentName, currentPhone, currentEmail, currentAddress, currentWebsite, niche));
  }

  // Strategy 2: Bulk extraction if no structured leads
  if (leads.length === 0) {
    const allEmails = (markdown.match(EMAIL_REGEX) || []).filter(e => !isJunkEmail(e));
    const allMobiles = markdown.match(MOBILE_REGEX) || [];

    const titleMatch = markdown.match(/^#\s+(.+)/m);
    const pageTitle = titleMatch ? titleMatch[1].trim() : new URL(url).hostname.replace(/^www\./, '');

    if (allMobiles.length > 0) {
      const seenPhones = new Set<string>();
      for (const mobile of allMobiles) {
        const cleaned = mobile.replace(/[^\d+]/g, '');
        if (seenPhones.has(cleaned)) continue;
        seenPhones.add(cleaned);
        const email = allEmails.length > 0 ? allEmails[0] : null;
        const bulkLead = createLead(pageTitle + (seenPhones.size > 1 ? ` (${seenPhones.size})` : ''), mobile, email, null, url, niche);
        if (bulkLead) leads.push(bulkLead);
      }
    }
  }

  return leads;
}

// Clean company name: remove URLs, junk text, markdown artifacts
function cleanCompanyName(raw: string): string {
  let name = raw
    .replace(/https?:\/\/[^\s]+/g, '')    // Remove URLs
    .replace(/www\.[^\s]+/g, '')           // Remove www.
    .replace(/[#*\[\](){}|]/g, '')         // Remove markdown chars
    .replace(/^\d+\.\s*/, '')              // Remove leading numbers "1. "
    .replace(/^[-–—•]\s*/, '')             // Remove leading bullets
    .replace(/\s+/g, ' ')
    .trim();

  // Skip names that are clearly not business names
  if (name.length < 3 || name.length > 80) return '';
  if (/^(http|www\.|enregistrez|inscri|connexion|login|sign|cookie|accept|lire|voir|page|click|logo of)/i.test(name)) return '';
  if (/^\d+$/.test(name)) return '';

  return name;
}

function createLead(
  name: string,
  phone: string | null,
  email: string | null,
  address: string | null,
  website: string | null,
  niche: string,
): ExtractedLead {
  const cleanedName = cleanCompanyName(name);
  if (!cleanedName) return null as unknown as ExtractedLead;

  return {
    company_name: cleanedName.substring(0, 100),
    contact_name: null,
    email: email,
    phone: phone ? phone.replace(/[^\d+]/g, '') : null,
    location: address,
    service_requested: niche,
    space_type: null,
    score: null,
    website,
  };
}

// Normalize to raw digits: 324XXXXXXXX
function normalizePhone(phone: string): string {
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('00')) p = p.substring(2);
  if (p.startsWith('0')) p = '32' + p.substring(1);
  if (!p.startsWith('32') && p.length <= 9) p = '32' + p;
  return p;
}

// Format as +32 4XX XX XX XX for display/storage
function formatBelgianMobile(phone: string): string {
  const digits = normalizePhone(phone); // e.g. 32478123456
  if (!digits.startsWith('324') || digits.length !== 11) return '+' + digits;
  // +32 4XX XX XX XX
  return `+32 ${digits[2]}${digits[3]}${digits[4]} ${digits[5]}${digits[6]} ${digits[7]}${digits[8]} ${digits[9]}${digits[10]}`;
}

// Normalize company name for dedup (remove legal suffixes, lowercase, trim)
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(sprl|bvba|sa|nv|srl|bv|asbl|vzw|scrl)\b/gi, '')
    .replace(/[^a-zà-üö0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY') || '';
  const rawFirecrawlUrl = (Deno.env.get('FIRECRAWL_URL') || 'https://api.firecrawl.dev').replace(/\/$/, '');
  const firecrawlBaseUrl = rawFirecrawlUrl.replace(/\/v1\/(search|scrape|map|crawl).*$/, '');

  console.log(`[Sofia] Using Firecrawl at: ${firecrawlBaseUrl} (API key: ${firecrawlApiKey ? 'set' : 'none'})`);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { config_id, niche, region, max_leads } = body;

    let searchNiche = niche;
    let searchRegion = region || 'Bruxelles';
    let maxLeads = max_leads || 40;

    if (config_id) {
      const { data: config } = await supabase
        .from('prospecting_configs')
        .select('*')
        .eq('id', config_id)
        .single();
      if (config) {
        searchNiche = config.niche;
        searchRegion = config.region;
        maxLeads = config.max_leads_per_run;
      }
    }

    if (!searchNiche) {
      return new Response(
        JSON.stringify({ success: false, error: 'No niche specified' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create run log
    const { data: run } = await supabase
      .from('prospecting_runs')
      .insert({ config_id: config_id || null, status: 'running' })
      .select()
      .single();
    const runId = run?.id;

    console.log(`[Sofia] Starting prospection: "${searchNiche}" in "${searchRegion}" (max: ${maxLeads})`);

    // ========== PHASE 1: Firecrawl Search ==========
    const allQueries = generateSearchQueries(searchNiche, searchRegion);
    console.log(`[Sofia] Running ${allQueries.length} Firecrawl Search queries`);

    const allExtractedLeads: ExtractedLead[] = [];

    const searchPromises = allQueries.map(async (query, idx) => {
      try {
        console.log(`[Sofia] Search query ${idx + 1}/${allQueries.length}: ${query}`);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (firecrawlApiKey) headers['Authorization'] = `Bearer ${firecrawlApiKey}`;

        const resp = await fetch(`${firecrawlBaseUrl}/v1/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            limit: 10,
            lang: 'fr',
            country: 'be',
            scrapeOptions: {
              formats: ['markdown'],
            },
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[Sofia] Search query ${idx + 1} failed (${resp.status}): ${errText}`);
          return [];
        }

        const data = await resp.json();
        const results = data.data || [];
        console.log(`[Sofia] Search query ${idx + 1} returned ${results.length} results`);

        const leads: ExtractedLead[] = [];
        for (const result of results) {
          const markdown = result.markdown || '';
          const url = result.url || '';

          if (markdown.length < 50) continue;

          const extracted = extractLeadsFromMarkdown(markdown, url, searchNiche);
          leads.push(...extracted);
        }

        console.log(`[Sofia] Search query ${idx + 1} extracted ${leads.length} leads`);
        return leads;
      } catch (e) {
        console.error(`[Sofia] Search query ${idx + 1} error:`, e);
        return [];
      }
    });

    // Run searches in batches of 3 to avoid rate limits
    const SEARCH_BATCH = 3;
    for (let i = 0; i < searchPromises.length; i += SEARCH_BATCH) {
      const batchResults = await Promise.all(searchPromises.slice(i, i + SEARCH_BATCH));
      for (const results of batchResults) {
        allExtractedLeads.push(...results);
      }
    }

    // Deduplicate by normalized company name
    const seen = new Set<string>();
    const uniqueLeads = allExtractedLeads.filter(l => {
      const key = normalizeCompanyName(l.company_name);
      if (!key || key.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[Sofia] Total unique leads from Firecrawl: ${uniqueLeads.length}`);

    // ========== PHASE 2: Deep scrape leads — try multiple contact pages ==========
    const CONTACT_PATHS = ['/contact', '/contactez-nous', '/a-propos'];

    // Scrape ALL leads that have a website — even those with phone, to find mobile if they only have landline
    const leadsNeedingScrape = uniqueLeads.filter(l => l.website);
    console.log(`[Sofia] ${leadsNeedingScrape.length} leads will be deep scraped`);

    const scrapePromises = leadsNeedingScrape.slice(0, 15).map(async (lead) => {
      try {
        const baseUrl = lead.website!.replace(/\/$/, '');
        const urlsToTry = [
          ...CONTACT_PATHS.map(p => baseUrl + p),
          lead.website!,
        ];

        for (const url of urlsToTry) {
          try {
            const scrapeHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (firecrawlApiKey) scrapeHeaders['Authorization'] = `Bearer ${firecrawlApiKey}`;

            const resp = await fetch(`${firecrawlBaseUrl}/v1/scrape`, {
              method: 'POST',
              headers: scrapeHeaders,
              body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false, waitFor: 2000 }),
            });

            if (!resp.ok) continue;
            const data = await resp.json();
            const markdown = data.data?.markdown || data.markdown || '';
            if (markdown.length < 50) continue;

            // Try JSON-LD first (most reliable structured data)
            const jsonLd = extractFromJsonLd(markdown);
            if (jsonLd.phone && !lead.phone) {
              lead.phone = jsonLd.phone.replace(/[^\d+]/g, '');
            }
            if (jsonLd.email && !lead.email && !isJunkEmail(jsonLd.email)) {
              lead.email = jsonLd.email;
            }

            // Extract ALL emails from the page and pick the best one
            if (!lead.email) {
              const allEmails = [...new Set(markdown.match(EMAIL_REGEX) || [])];
              const validEmails = allEmails.filter(e => !isJunkEmail(e));
              if (validEmails.length > 0) {
                // Prefer personal emails over generic ones (info@, contact@)
                const personalEmail = validEmails.find(e =>
                  !e.match(/^(info|contact|admin|support|hello|office|reception|accueil|secretariat|general)@/i)
                );
                lead.email = personalEmail || validEmails[0];
                console.log(`[Sofia] 📧 Found email for ${lead.company_name}: ${lead.email}`);
              }
            }

            // Extract Belgian mobile only — no landlines
            const mobileMatch = markdown.match(MOBILE_REGEX);
            if (mobileMatch && !lead.phone) {
              const cleaned = mobileMatch[0].replace(/[^\d+]/g, '');
              lead.phone = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
              console.log(`[Sofia] ✅ Enriched ${lead.company_name}: mobile ${lead.phone}`);
            }

            // If we have both phone and email, we're done with this lead
            if (lead.phone && lead.email) break;
            // If we found at least something useful, continue trying other pages for the missing piece
          } catch { /* try next URL */ }
        }
        // Last resort: guess email from website domain (info@domain.be)
        if (!lead.email && lead.website) {
          try {
            const domain = new URL(lead.website).hostname.replace(/^www\./, '');
            if (domain.endsWith('.be') || domain.endsWith('.com') || domain.endsWith('.eu')) {
              lead.email = `info@${domain}`;
              console.log(`[Sofia] 📧 Guessed email for ${lead.company_name}: ${lead.email}`);
            }
          } catch { /* invalid URL */ }
        }
      } catch (e) {
        console.error(`[Sofia] Scrape error for ${lead.company_name}:`, e);
      }
    });

    const SCRAPE_BATCH = 5;
    for (let i = 0; i < scrapePromises.length; i += SCRAPE_BATCH) {
      await Promise.all(scrapePromises.slice(i, i + SCRAPE_BATCH));
    }

    // ========== PHASE 3: Filter qualified leads ==========
    // Only leads with a Belgian MOBILE phone qualify
    const qualifiedLeads = uniqueLeads.filter(l => {
      if (!l.phone) return false;
      const norm = normalizePhone(l.phone);
      return norm.startsWith('324');
    });
    console.log(`[Sofia] After enrichment — qualified with mobile: ${qualifiedLeads.length} / ${uniqueLeads.length}`);

    // ========== PHASE 2.5: FALLBACK — if not enough leads, expand to nearby regions ==========
    if (qualifiedLeads.length < maxLeads) {
      console.log(`[Sofia] ⚠️ Only ${qualifiedLeads.length} qualified leads, need ${maxLeads}. Expanding search...`);

      // Pick 3 nearby regions not already searched
      const extraRegions = BELGIAN_REGIONS
        .filter(r => r.toLowerCase() !== searchRegion.toLowerCase())
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      for (const extraRegion of extraRegions) {
        if (qualifiedLeads.length >= maxLeads) break;

        console.log(`[Sofia] Expanding to region: ${extraRegion}`);
        const extraQueries = generateSearchQueries(searchNiche, extraRegion).slice(0, 4); // Limit to 4 queries per extra region

        for (const query of extraQueries) {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (firecrawlApiKey) headers['Authorization'] = `Bearer ${firecrawlApiKey}`;

            const resp = await fetch(`${firecrawlBaseUrl}/v1/search`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ query, limit: 10, lang: 'fr', country: 'be', scrapeOptions: { formats: ['markdown'] } }),
            });

            if (!resp.ok) continue;
            const data = await resp.json();
            const results = data.data || [];

            for (const result of results) {
              const markdown = result.markdown || '';
              const url = result.url || '';
              if (markdown.length < 50) continue;

              const extracted = extractLeadsFromMarkdown(markdown, url, searchNiche);
              for (const lead of extracted) {
                const key = normalizeCompanyName(lead.company_name);
                if (!key || key.length < 2 || seen.has(key)) continue;
                seen.add(key);

                // Only add if has mobile
                if (lead.phone) {
                  const norm = normalizePhone(lead.phone);
                  if (norm.startsWith('324')) {
                    qualifiedLeads.push(lead);
                    uniqueLeads.push(lead);
                  }
                }
              }
            }
          } catch (e) {
            console.error(`[Sofia] Fallback search error:`, e);
          }
        }
      }

      console.log(`[Sofia] After fallback expansion — qualified: ${qualifiedLeads.length}`);
    }

    // ========== PHASE 4: Dedup + insertion (no WhatsApp verification) ==========
    // Check for duplicates by phone number (not just company name)
    const existingPhones = new Set<string>();
    if (qualifiedLeads.length > 0) {
      const phonesToCheck = qualifiedLeads.map(l => normalizePhone(l.phone!));
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone, whatsapp_number')
        .or(phonesToCheck.map(p => `phone.ilike.%${p.slice(-8)}%`).join(','));

      if (existingLeads) {
        for (const el of existingLeads) {
          if (el.phone) existingPhones.add(normalizePhone(el.phone));
          if (el.whatsapp_number) existingPhones.add(normalizePhone(el.whatsapp_number));
        }
      }
    }

    let leadsInserted = 0;
    let leadsSkippedDuplicate = 0;

    const leadsToProcess = qualifiedLeads.slice(0, maxLeads * 2);

    for (const lead of leadsToProcess) {
      if (leadsInserted >= maxLeads) break;

      if (!lead.company_name || lead.company_name.length < 2) continue;
      if (!lead.phone || lead.phone.trim().length < 5) continue;

      // Final guard: only Belgian mobile
      const normalizedDigits = normalizePhone(lead.phone);
      if (!normalizedDigits.startsWith('324') || normalizedDigits.length !== 11) {
        continue;
      }

      // Check phone dedup
      if (existingPhones.has(normalizedDigits)) {
        leadsSkippedDuplicate++;
        continue;
      }

      // Check if company already exists
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .ilike('company_name', lead.company_name)
        .limit(1);

      if (existing && existing.length > 0) {
        leadsSkippedDuplicate++;
        continue;
      }

      // Format phone as +32 4XX XX XX XX
      const formattedPhone = formatBelgianMobile(lead.phone);

      // Final email sanitization — remove directory emails
      const cleanEmail = (lead.email && !isJunkEmail(lead.email)) ? lead.email : null;

      existingPhones.add(normalizedDigits);

      const { error: insertError } = await supabase.from('leads').insert({
        contact_name: lead.contact_name || null,
        company_name: lead.company_name,
        email: cleanEmail,
        phone: formattedPhone,
        whatsapp_number: normalizedDigits,
        location: lead.location || null,
        space_type: lead.space_type || null,
        service_requested: searchNiche,
        score: null,
        status: 'new',
        source: 'prospecting',
        active_agent: 'claire',
        language: 'fr',
        notes: `[Sofia] Niche: ${searchNiche} | Région: ${searchRegion} | Source: Firecrawl Search`,
      });

      if (!insertError) {
        leadsInserted++;
        console.log(`[Sofia] ✅ Inserted: ${lead.company_name} | ${formattedPhone}`);
      } else {
        console.error(`[Sofia] Insert error for ${lead.company_name}:`, insertError);
      }
    }

    // Update run log
    if (runId) {
      await supabase.from('prospecting_runs').update({
        status: 'completed',
        leads_found: uniqueLeads.length,
        leads_qualified: leadsInserted,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    await supabase.from('activity_log').insert({
      type: 'prospecting',
      title: `Sofia — ${leadsInserted} leads prospectés`,
      description: `Niche: ${searchNiche} | Région: ${searchRegion} | Trouvés: ${uniqueLeads.length} | Mobiles: ${qualifiedLeads.length} | Insérés: ${leadsInserted} | Duplicatas: ${leadsSkippedDuplicate}`,
    });

    console.log(`[Sofia] ✅ Done — Found: ${uniqueLeads.length}, Mobiles: ${qualifiedLeads.length}, Inserted: ${leadsInserted}, Duplicates: ${leadsSkippedDuplicate}`);

    return new Response(
      JSON.stringify({
        success: true,
        leads_found: uniqueLeads.length,
        leads_qualified: qualifiedLeads.length,
        leads_inserted: leadsInserted,
        leads_skipped_duplicate: leadsSkippedDuplicate,
        run_id: runId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Sofia] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
