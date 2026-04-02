import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sofia Cron — Daily automatic prospecting
 *
 * This function should be called daily (via Supabase Cron or external scheduler).
 * It picks the next niche in rotation (the one least recently run) and calls
 * sofia-prospect to find 40 new WhatsApp-verified leads.
 *
 * Rotation logic:
 * - Picks the active config with the oldest `last_run_at` (or null = never run)
 * - Rotates through Belgian regions automatically (built into sofia-prospect)
 * - Updates `last_run_at` after each run
 *
 * Setup in Supabase Dashboard → Database → Cron Jobs:
 *   SELECT cron.schedule(
 *     'sofia-daily-prospect',
 *     '0 8 * * *',  -- Every day at 8:00 AM UTC
 *     $$
 *     SELECT net.http_post(
 *       url := 'https://juqtijwhwghtvtuiuaba.supabase.co/functions/v1/sofia-cron',
 *       headers := jsonb_build_object(
 *         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
 *         'Content-Type', 'application/json'
 *       ),
 *       body := '{}'::jsonb
 *     );
 *     $$
 *   );
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Pick the next niche to prospect (oldest last_run_at, or never run)
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

    console.log(`[Sofia Cron] Selected niche: "${config.niche}" (last run: ${config.last_run_at || 'never'})`);

    // Pick a random Belgian region for this run
    const regions = [
      'Bruxelles', 'Ixelles', 'Uccle', 'Schaerbeek', 'Anderlecht', 'Etterbeek',
      'Liège', 'Namur', 'Charleroi', 'Mons', 'Tournai',
      'Anvers', 'Gand', 'Bruges', 'Louvain', 'Malines', 'Hasselt',
      'Waterloo', 'Wavre', 'Nivelles',
      'Arlon', 'Verviers', 'Dinant',
    ];
    const region = regions[Math.floor(Math.random() * regions.length)];

    console.log(`[Sofia Cron] Region for this run: ${region}`);

    // Call sofia-prospect
    const prospectUrl = `${supabaseUrl}/functions/v1/sofia-prospect`;
    const resp = await fetch(prospectUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config_id: config.id,
        niche: config.niche,
        region: region,
        max_leads: config.max_leads_per_run || 40,
      }),
    });

    const result = await resp.json();
    console.log(`[Sofia Cron] sofia-prospect result:`, JSON.stringify(result));

    // Update last_run_at
    await supabase
      .from('prospecting_configs')
      .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', config.id);

    // Log the cron execution
    await supabase.from('activity_log').insert({
      type: 'cron',
      title: `Sofia Cron — ${config.niche} (${region})`,
      description: `Auto-prospection: ${result.leads_inserted || 0} leads insérés | ${result.leads_whatsapp_verified || 0} WhatsApp vérifiés | ${result.leads_found || 0} trouvés`,
      metadata: { config_id: config.id, region, result },
    });

    return new Response(
      JSON.stringify({
        success: true,
        niche: config.niche,
        region,
        ...result,
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
