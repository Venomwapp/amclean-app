import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sofia Cron — Daily automatic prospecting (loops until 40 leads)
 *
 * Picks the next niche in rotation, then calls sofia-prospect in multiple
 * rounds with different regions until the daily target (40 leads) is reached.
 *
 * Example: Round 1 → 15 leads, Round 2 → 22 leads (total 37), Round 3 → 3 leads → DONE (40)
 *
 * Cron schedule (4 AM Brussels = 2 AM UTC):
 *   SELECT cron.schedule('sofia-daily-prospect', '0 2 * * *', ...);
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_TARGET = 40;
const MAX_ROUNDS = 8; // Safety limit to avoid infinite loops

// Scraping restricted to Brussels-Capital Region only (19 communes)
const REGIONS = [
  'Bruxelles', 'Ixelles', 'Uccle', 'Schaerbeek', 'Anderlecht', 'Etterbeek',
  'Woluwe-Saint-Lambert', 'Woluwe-Saint-Pierre', 'Saint-Gilles', 'Forest', 'Jette',
  'Molenbeek-Saint-Jean', 'Saint-Josse-ten-Noode', 'Evere', 'Ganshoren',
  'Koekelberg', 'Berchem-Sainte-Agathe', 'Auderghem', 'Watermael-Boitsfort',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Pick the next niche (oldest last_run_at)
    const { data: config, error: configError } = await supabase
      .from('prospecting_configs')
      .select('*')
      .eq('is_active', true)
      .order('last_run_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .single();

    if (configError || !config) {
      console.error('[Sofia Cron] No active prospecting config found:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'No active config found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const target = config.max_leads_per_run || DAILY_TARGET;
    console.log(`[Sofia Cron] 🎯 Target: ${target} leads | Niche: "${config.niche}" | Last run: ${config.last_run_at || 'never'}`);

    // Shuffle regions to avoid always hitting the same ones
    const shuffledRegions = [...REGIONS].sort(() => Math.random() - 0.5);

    let totalInserted = 0;
    let totalFound = 0;
    let totalQualified = 0;
    let totalDuplicates = 0;
    const regionsUsed: string[] = [];
    let round = 0;

    while (totalInserted < target && round < MAX_ROUNDS) {
      round++;
      const remaining = target - totalInserted;
      const region = shuffledRegions[(round - 1) % shuffledRegions.length];
      regionsUsed.push(region);

      console.log(`[Sofia Cron] 🔄 Round ${round}/${MAX_ROUNDS} — Region: ${region} — Need: ${remaining} more leads`);

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/sofia-prospect`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config_id: config.id,
            niche: config.niche,
            region: region,
            max_leads: remaining,
          }),
        });

        const result = await resp.json();

        const inserted = result.leads_inserted || 0;
        totalInserted += inserted;
        totalFound += result.leads_found || 0;
        totalQualified += result.leads_qualified || 0;
        totalDuplicates += result.leads_skipped_duplicate || 0;

        console.log(`[Sofia Cron] Round ${round} result: +${inserted} inserted (total: ${totalInserted}/${target})`);

        // If a round found 0 new leads, the region/niche is exhausted — try next
        if (inserted === 0 && round >= 3) {
          console.log(`[Sofia Cron] ⚠️ Round ${round} inserted 0 leads — trying different region`);
        }
      } catch (e) {
        console.error(`[Sofia Cron] Round ${round} error:`, e);
      }
    }

    // Update last_run_at
    await supabase
      .from('prospecting_configs')
      .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', config.id);

    const summary = `Niche: ${config.niche} | Rounds: ${round} | Régions: ${regionsUsed.join(', ')} | Trouvés: ${totalFound} | Mobiles: ${totalQualified} | Insérés: ${totalInserted}/${target} | Duplicatas: ${totalDuplicates}`;

    console.log(`[Sofia Cron] ✅ Done — ${summary}`);

    await supabase.from('activity_log').insert({
      type: 'cron',
      title: `Sofia Cron — ${config.niche} → ${totalInserted}/${target} leads`,
      description: summary,
      metadata: { config_id: config.id, rounds: round, regions_used: regionsUsed, total_inserted: totalInserted, target },
    });

    return new Response(
      JSON.stringify({
        success: true,
        niche: config.niche,
        target,
        rounds: round,
        regions_used: regionsUsed,
        total_inserted: totalInserted,
        total_found: totalFound,
        total_qualified: totalQualified,
        total_duplicates: totalDuplicates,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Sofia Cron] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
