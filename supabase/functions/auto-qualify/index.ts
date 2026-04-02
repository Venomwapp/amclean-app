import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[Auto-Qualify] Evolution API not configured — message NOT sent to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Auto-Qualify] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Auto-Qualify] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check daily limit: max 40 qualification messages per day (Brussels timezone)
    const now = new Date();
    const brusselsDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
    const todayStart = `${brusselsDate}T00:00:00+00:00`;
    const todayEnd = `${brusselsDate}T23:59:59+00:00`;

    const { count: todayCount } = await supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("type", "auto_qualify")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd);

    const dailySent = todayCount || 0;
    if (dailySent >= 40) {
      console.log(`[Auto-Qualify] Daily limit reached (${dailySent}/40). Skipping.`);
      return new Response(
        JSON.stringify({ status: "daily_limit_reached", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find next lead to qualify: status = 'new', has whatsapp_number, NO conversations yet
    // ONLY inbound leads — prospecting leads are handled by sofia-outreach
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("status", "new")
      .not("whatsapp_number", "is", null)
      .neq("source", "prospecting")
      .neq("active_agent", "sophie")
      .order("created_at", { ascending: true })
      .limit(10);

    if (!leads || leads.length === 0) {
      console.log("[Auto-Qualify] No new leads to qualify.");
      return new Response(
        JSON.stringify({ status: "no_leads", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find first lead with zero conversations
    let targetLead = null;
    for (const lead of leads) {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id);
      if (!count || count === 0) {
        targetLead = lead;
        break;
      }
    }

    if (!targetLead) {
      console.log("[Auto-Qualify] All new leads already have conversations.");
      return new Response(
        JSON.stringify({ status: "all_contacted", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agentName = targetLead.active_agent || "claire";
    console.log(`[Auto-Qualify] Qualifying: ${targetLead.company_name || targetLead.contact_name} via ${agentName}`);

    // Load agent config
    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("*")
      .eq("agent_name", agentName)
      .eq("is_active", true)
      .single();

    if (!agentConfig) {
      console.error(`[Auto-Qualify] No active config for agent: ${agentName}`);
      return new Response(
        JSON.stringify({ status: "error", message: `No config for ${agentName}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lang = targetLead.language || "fr";
    const langNames: Record<string, string> = {
      fr: "français", nl: "néerlandais", en: "anglais", pt: "português",
    };
    const langName = langNames[lang] || "français";

    // Build lead context
    const leadInfo = [
      targetLead.company_name ? `Entreprise: ${targetLead.company_name}` : null,
      targetLead.contact_name ? `Contact: ${targetLead.contact_name}` : null,
      targetLead.space_type ? `Type d'espace: ${targetLead.space_type}` : null,
      targetLead.location ? `Localisation: ${targetLead.location}` : null,
      targetLead.service_requested ? `Service: ${targetLead.service_requested}` : null,
      targetLead.surface_area ? `Surface: ${targetLead.surface_area}` : null,
      targetLead.frequency ? `Fréquence: ${targetLead.frequency}` : null,
      targetLead.message ? `Message initial: ${targetLead.message}` : null,
      `Source: ${targetLead.source || "direct"}`,
      `Langue: ${langName}`,
    ].filter(Boolean).join("\n- ");

    const contextByLang: Record<string, string> = {
      fr: `
NOUVEAU LEAD À QUALIFIER :
- ${leadInfo}

INSTRUCTIONS :
- C'est le PREMIER contact. Présente-toi et commence la qualification.
- Écris UN SEUL message court et professionnel (2-4 phrases).
- Personnalise avec les infos disponibles du lead.
- Pose UNE question pour avancer dans la qualification.
- Langue du message : ${langName}
- Ne mentionne JAMAIS de prix.
`,
      pt: `
NOVO LEAD PARA QUALIFICAR :
- ${leadInfo}

INSTRUÇÕES :
- É o PRIMEIRO contacto. Apresenta-te e começa a qualificação.
- Escreve UMA ÚNICA mensagem curta e profissional (2-4 frases).
- Personaliza com as informações disponíveis do lead.
- Faz UMA pergunta para avançar na qualificação.
- Idioma da mensagem : ${langName}
- NUNCA menciones preços.
`,
      nl: `
NIEUWE LEAD OM TE KWALIFICEREN :
- ${leadInfo}

INSTRUCTIES :
- Dit is het EERSTE contact. Stel je voor en begin met kwalificatie.
- Schrijf SLECHTS ÉÉN kort en professioneel bericht (2-4 zinnen).
- Personaliseer met beschikbare lead-informatie.
- Stel ÉÉN vraag om de kwalificatie voort te zetten.
- Taal van het bericht : ${langName}
- Vermeld NOOIT prijzen.
`,
      en: `
NEW LEAD TO QUALIFY :
- ${leadInfo}

INSTRUCTIONS :
- This is the FIRST contact. Introduce yourself and start qualifying.
- Write ONE single short and professional message (2-4 sentences).
- Personalize with available lead info.
- Ask ONE question to advance the qualification.
- Message language : ${langName}
- NEVER mention prices.
`,
    };

    const leadContext = contextByLang[lang] || contextByLang.fr;

    const generatePrompts: Record<string, string> = {
      fr: `Génère le premier message de qualification pour ce nouveau lead. Réponds UNIQUEMENT avec le message à envoyer.`,
      pt: `Gere a primeira mensagem de qualificação para este novo lead. Responda APENAS com a mensagem a enviar.`,
      nl: `Genereer het eerste kwalificatiebericht voor deze nieuwe lead. Antwoord ALLEEN met het te verzenden bericht.`,
      en: `Generate the first qualification message for this new lead. Reply ONLY with the message to send.`,
    };

    const llmMessages = [
      { role: "system", content: agentConfig.system_prompt + leadContext },
      { role: "user", content: generatePrompts[lang] || generatePrompts.fr },
    ];

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: agentConfig.temperature ?? 0.4,
        max_tokens: 300,
        messages: llmMessages,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error("[Auto-Qualify] LLM error:", llmResponse.status, errText);
      return new Response(
        JSON.stringify({ status: "error", message: "LLM error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    let message = (llmData.choices?.[0]?.message?.content || "").trim();

    // Clean accidental tags
    message = message
      .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
      .replace(/\[TRANSFER:[^\]]*\]/g, "")
      .replace(/\[ESCALADE\]/g, "")
      .replace(/\[SCHEDULING_REQUEST:[^\]]*\]/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    if (!message || message.length < 10) {
      console.error("[Auto-Qualify] Generated message too short or empty");
      return new Response(
        JSON.stringify({ status: "error", message: "Empty message" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Auto-Qualify] Message: ${message.substring(0, 100)}...`);

    // Send via WhatsApp
    const sent = await sendWhatsApp(targetLead.whatsapp_number, message);

    // Save conversation
    await supabase.from("conversations").insert({
      lead_id: targetLead.id,
      role: "assistant",
      content: message,
      agent: agentName,
      metadata: { auto_qualify: true, first_contact: true },
    });

    // Update lead status to qualifying
    await supabase.from("leads").update({
      status: "qualifying",
      updated_at: new Date().toISOString(),
    }).eq("id", targetLead.id);

    // Log activity
    await supabase.from("activity_log").insert({
      type: "auto_qualify",
      title: `${agentConfig.display_name} → ${targetLead.company_name || targetLead.contact_name}`,
      description: `Qualification auto (${lang.toUpperCase()}) | ${sent ? "✅ WhatsApp" : "⚠️ WhatsApp non configuré"}`,
      metadata: { lead_id: targetLead.id, agent: agentName, whatsapp_sent: sent },
    });

    console.log(`[Auto-Qualify] Done — ${targetLead.company_name || targetLead.contact_name}, WhatsApp: ${sent ? "OK" : "NOT_SENT"}, Today: ${dailySent + 1}/40`);

    return new Response(
      JSON.stringify({
        status: "ok",
        lead_id: targetLead.id,
        agent: agentName,
        whatsapp_sent: sent,
        sent_today: dailySent + 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Auto-Qualify] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
