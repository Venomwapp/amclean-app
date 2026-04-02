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
  score: 'HOT' | 'WARM' | 'COLD';
  website: string | null;
}

// Generate search queries for Firecrawl web search
function generateSearchQueries(niche: string, region: string): string[] {
  const queries: string[] = [];

  const nicheVariants: Record<string, string[]> = {
    'restaurant': ['restaurant', 'brasserie', 'traiteur'],
    'bureau': ['bureaux', 'office', 'espace de travail'],
    'hôtel': ['hôtel', 'hotel', 'hébergement'],
    'clinique': ['clinique', 'cabinet médical', 'centre médical', 'cabinet dentaire', 'maison médicale'],
    'école': ['école', 'institut', 'lycée', 'collège'],
    'salle de sport': ['salle de sport', 'fitness', 'club sportif', 'gym'],
    'pharmacie': ['pharmacie', 'apotheek'],
    'crèche': ['crèche', 'garderie', 'kinderopvang'],
    'maison de repos': ['maison de repos', 'résidence seniors', 'woonzorgcentrum'],
    'coworking': ['coworking', 'espace partagé', 'shared workspace'],
    'syndic': ['syndic', 'copropriété', 'gestion immobilière'],
    'magasin': ['magasin', 'boutique', 'commerce'],
    'immeubles': ['immeuble', 'syndic copropriété', 'gestion immeuble'],
    'cabinet': ['cabinet avocat', 'cabinet comptable', 'notaire'],
    'agence immobilière': ['agence immobilière', 'immobilier', 'real estate'],
    'construction': ['entreprise de construction', 'bouwbedrijf', 'construction company'],
    'salon': ['salon de coiffure', 'salon de beauté', 'kapsalon', 'spa'],
    'garage': ['garage automobile', 'autogarage', 'carrosserie'],
    'boulangerie': ['boulangerie', 'pâtisserie', 'bakkerij'],
    'supermarché': ['supermarché', 'épicerie', 'supermarkt'],
  };

  const nicheLower = niche.toLowerCase().trim();
  let terms = [niche];

  for (const [key, variants] of Object.entries(nicheVariants)) {
    if (nicheLower.includes(key) || key.includes(nicheLower)) {
      terms = variants;
      break;
    }
  }

  // Generate targeted queries to find business listings with contact info
  for (const term of terms) {
    queries.push(`${term} ${region} téléphone adresse`);
    queries.push(`${term} ${region} contact`);
  }

  return [...new Set(queries)];
}

// Extract leads from scraped markdown content
function extractLeadsFromMarkdown(markdown: string, url: string, niche: string): ExtractedLead[] {
  const leads: ExtractedLead[] = [];

  // Extract only Belgian MOBILE numbers (04x → +324x) — no landlines
  const mobileRegex = /(?:\+32|0032|0)\s*4[5-9][\d\s\-\.]{6,10}/g;
  const emailRegex = /[\w.-]+@[\w.-]+\.\w{2,}/g;

  // Try to identify business blocks in the content
  // Look for patterns like: Name + Address + Phone
  const lines = markdown.split('\n').filter(l => l.trim().length > 0);

  // Strategy 1: Look for structured listings (common in directory pages)
  // Business names are often in headers or bold text
  const namePatterns = [
    /^#{1,4}\s+(.+)/,           // Markdown headers
    /^\*\*(.+?)\*\*/,           // Bold text
    /^\[(.+?)\]\(http/,         // Links
  ];

  let currentName: string | null = null;
  let currentPhone: string | null = null;
  let currentEmail: string | null = null;
  let currentAddress: string | null = null;
  let currentWebsite: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for business name
    for (const pattern of namePatterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[1].length > 2 && match[1].length < 80) {
        // Save previous lead if we have one
        if (currentName && (currentPhone || currentEmail)) {
          leads.push(createLead(currentName, currentPhone, currentEmail, currentAddress, currentWebsite, niche));
        }
        currentName = match[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        currentPhone = null;
        currentEmail = null;
        currentAddress = null;
        currentWebsite = null;
        break;
      }
    }

    // Extract mobile phone only from current line
    const mobileMatch = line.match(mobileRegex);
    if (mobileMatch && !currentPhone) {
      currentPhone = mobileMatch[0];
    }

    // Extract email
    const emailMatch = line.match(emailRegex);
    if (emailMatch && !currentEmail) {
      currentEmail = emailMatch[0];
    }

    // Extract address (Belgian postal codes: 1000-9999)
    const addressMatch = line.match(/\d{4}\s+[A-ZÀ-Ü][a-zà-ü]+/);
    if (addressMatch && !currentAddress) {
      currentAddress = line.replace(/^[-–•*]\s*/, '').trim();
    }

    // Extract website
    const urlMatch = line.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (urlMatch && !currentWebsite) {
      currentWebsite = urlMatch[1];
    }
  }

  // Don't forget the last lead
  if (currentName && (currentPhone || currentEmail)) {
    leads.push(createLead(currentName, currentPhone, currentEmail, currentAddress, currentWebsite, niche));
  }

  // Strategy 2: If no structured leads found, extract all phones from the page
  // and associate them with the page title/URL
  if (leads.length === 0) {
    const allEmails = markdown.match(emailRegex) || [];
    const allMobiles = markdown.match(mobileRegex) || [];

    const titleMatch = markdown.match(/^#\s+(.+)/m);
    const pageTitle = titleMatch ? titleMatch[1].trim() : new URL(url).hostname.replace(/^www\./, '');

    if (allMobiles.length > 0) {
      const email = allEmails.length > 0 ? allEmails[0] : null;
      leads.push(createLead(pageTitle, allMobiles[0], email, null, url, niche));
    }
  }

  return leads;
}

function createLead(
  name: string,
  phone: string | null,
  email: string | null,
  address: string | null,
  website: string | null,
  niche: string,
): ExtractedLead {
  // Only mobile numbers (+324x) are accepted — they're always HOT
  let score: 'HOT' | 'WARM' | 'COLD' = 'COLD';

  if (phone) {
    const cleaned = phone.replace(/[^\d+]/g, '');
    const normalized = cleaned.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '32');
    if (normalized.match(/^324[5-9]/)) {
      score = 'HOT';
    }
    // No WARM for landlines — they are filtered out entirely
  }

  return {
    company_name: name.substring(0, 100),
    contact_name: null,
    email: email,
    phone: phone ? phone.replace(/[^\d+]/g, '') : null,
    location: address,
    service_requested: niche,
    space_type: null,
    score,
    website,
  };
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('00')) p = p.substring(2);
  if (p.startsWith('0')) p = '32' + p.substring(1);
  if (!p.startsWith('32') && p.length <= 9) p = '32' + p;
  return p;
}

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
        console.log(`[Sofia] Search query ${idx + 1}: ${query}`);
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

    // Deduplicate by company name
    const seen = new Set<string>();
    const uniqueLeads = allExtractedLeads.filter(l => {
      const key = l.company_name.toLowerCase().trim();
      if (!key || key.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[Sofia] Total unique leads from Firecrawl: ${uniqueLeads.length}`);

    if (uniqueLeads.length === 0) {
      if (runId) {
        await supabase.from('prospecting_runs').update({
          status: 'completed', leads_found: 0, leads_qualified: 0,
          completed_at: new Date().toISOString(),
        }).eq('id', runId);
      }
      return new Response(
        JSON.stringify({ success: true, leads_found: 0, leads_qualified: 0, leads_inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== PHASE 2: Deep scrape leads with websites but weak contact info ==========
    const leadsNeedingScrape = uniqueLeads.filter(l => l.website && (l.score === 'COLD' || !l.email));
    console.log(`[Sofia] ${leadsNeedingScrape.length} leads need deep scraping`);

    const scrapePromises = leadsNeedingScrape.slice(0, 20).map(async (lead) => {
      try {
        const contactUrl = lead.website!.replace(/\/$/, '') + '/contact';
        const urlsToTry = [contactUrl, lead.website!];

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

            // Extract email
            const emailMatch = markdown.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
            if (emailMatch && !lead.email) {
              lead.email = emailMatch[0];
            }

            // Extract Belgian mobile only — no landlines
            const mobileMatch = markdown.match(/(?:\+32|0032|0)\s*4[5-9][\d\s\-\.]{6,10}/);
            if (mobileMatch) {
              const cleaned = mobileMatch[0].replace(/[^\d+]/g, '');
              lead.phone = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
              lead.score = 'HOT';
              console.log(`[Sofia] ✅ Enriched ${lead.company_name}: mobile ${lead.phone}`);
            }
            break;
          } catch { /* try next URL */ }
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
    // Only HOT leads (mobile numbers) qualify now
    const qualifiedLeads = uniqueLeads.filter(l => l.score === 'HOT');
    console.log(`[Sofia] After enrichment — HOT+WARM: ${qualifiedLeads.length} (COLD filtered: ${uniqueLeads.length - qualifiedLeads.length})`);

    // ========== PHASE 4: WhatsApp verification + insertion ==========
    const evoUrl = Deno.env.get('EVOLUTION_API_URL');
    const evoKey = Deno.env.get('EVOLUTION_API_KEY');
    const evoInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    const canCheckWhatsApp = !!(evoUrl && evoKey && evoInstance);

    if (!canCheckWhatsApp) {
      console.log('[Sofia] Evolution API not configured — skipping WhatsApp verification');
    }

    // Returns: 'verified' (exists on WhatsApp), 'not_found', or 'error' (API issue)
    async function checkWhatsApp(phone: string): Promise<'verified' | 'not_found' | 'error'> {
      if (!canCheckWhatsApp) return 'verified';
      const number = normalizePhone(phone);
      try {
        const resp = await fetch(`${evoUrl}/chat/whatsappNumbers/${evoInstance}`, {
          method: 'POST',
          headers: { apikey: evoKey!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ numbers: [number] }),
        });
        if (!resp.ok) {
          console.error(`[Sofia] WhatsApp check failed (${resp.status}) for ${number}`);
          return 'error';
        }
        const data = await resp.json();
        const result = Array.isArray(data) ? data[0] : data;
        const exists = result?.exists === true || result?.numberExists === true;
        console.log(`[Sofia] WhatsApp check ${number}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
        return exists ? 'verified' : 'not_found';
      } catch (e) {
        console.error(`[Sofia] WhatsApp check error for ${number}:`, e);
        return 'error';
      }
    }

    let leadsInserted = 0;
    let leadsWhatsAppVerified = 0;

    const leadsToProcess = qualifiedLeads.slice(0, maxLeads);

    for (const lead of leadsToProcess) {
      if (!lead.company_name || lead.company_name.length < 2) continue;
      if (!lead.phone || lead.phone.trim().length < 5) continue;

      // Final guard: only insert if normalized phone starts with 324 (Belgian mobile)
      const normalizedCheck = normalizePhone(lead.phone);
      if (!normalizedCheck.startsWith('324')) {
        console.log(`[Sofia] Skipping ${lead.company_name}: phone ${normalizedCheck} is not a Belgian mobile`);
        continue;
      }

      // Check if already exists
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .ilike('company_name', lead.company_name)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const normalized = normalizePhone(lead.phone);
      let whatsappNumber: string | null = null;

      if (canCheckWhatsApp) {
        const result = await checkWhatsApp(lead.phone);
        if (result === 'verified') {
          whatsappNumber = normalized;
          leadsWhatsAppVerified++;
        } else if (result === 'not_found') {
          console.log(`[Sofia] Skipping ${lead.company_name}: phone ${normalized} not on WhatsApp`);
          continue;
        } else {
          // API error — insert lead anyway without WhatsApp verification
          whatsappNumber = null;
        }
      } else {
        whatsappNumber = normalized;
      }

      const whatsappVerified = whatsappNumber !== null;
      const { error: insertError } = await supabase.from('leads').insert({
        contact_name: lead.contact_name || null,
        company_name: lead.company_name,
        email: lead.email || null,
        phone: lead.phone,
        whatsapp_number: whatsappNumber,
        location: lead.location || null,
        space_type: lead.space_type || null,
        service_requested: searchNiche,
        score: lead.score || 'WARM',
        status: 'new',
        source: 'prospecting',
        active_agent: 'sophie',
        language: 'fr',
        notes: `[Sofia] Niche: ${searchNiche} | Região: ${searchRegion} | Source: Firecrawl Search${whatsappVerified ? ' | ✅ WhatsApp vérifié' : ' | ⚠️ WhatsApp non vérifié'}`,
      });

      if (!insertError) {
        leadsInserted++;
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
      description: `Niche: ${searchNiche} | Région: ${searchRegion} | Firecrawl: ${uniqueLeads.length} | HOT+WARM: ${qualifiedLeads.length} | Insérés: ${leadsInserted} | WhatsApp: ${leadsWhatsAppVerified}`,
    });

    console.log(`[Sofia] Done — Firecrawl: ${uniqueLeads.length}, HOT+WARM: ${qualifiedLeads.length}, Inserted: ${leadsInserted}, WhatsApp: ${leadsWhatsAppVerified}`);

    return new Response(
      JSON.stringify({
        success: true,
        leads_found: uniqueLeads.length,
        leads_qualified: qualifiedLeads.length,
        leads_inserted: leadsInserted,
        leads_whatsapp_verified: leadsWhatsAppVerified,
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
