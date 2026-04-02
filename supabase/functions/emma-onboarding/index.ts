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
    console.log("[Emma-Onboarding] Evolution API not configured");
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Emma-Onboarding] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Emma-Onboarding] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Load lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Emma's config
    const { data: emmaConfig } = await supabaseAdmin
      .from("agent_configs")
      .select("*")
      .eq("agent_name", "emma")
      .eq("is_active", true)
      .single();

    if (!emmaConfig) {
      return new Response(JSON.stringify({ error: "Emma config not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build onboarding prompt
    const leadContext = `\n\nDONNÉES DU CLIENT :\n- Nom: ${lead.contact_name || "inconnu"}\n- Entreprise: ${lead.company_name || "inconnue"}\n- Service: ${lead.service_requested || "non précisé"}\n- Localisation: ${lead.location || lead.address || "inconnue"}\n- Fréquence: ${lead.frequency || "non précisée"}\n- Langue: ${lead.language || "fr"}\n\nCONTEXTE: C'est le premier contact post-conversion. Le client vient de signer son contrat. Envoie un message d'onboarding chaleureux.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: emmaConfig.temperature ?? 0.4,
        max_tokens: emmaConfig.max_tokens ?? 600,
        messages: [
          { role: "system", content: emmaConfig.system_prompt + leadContext },
          { role: "user", content: "Génère le message d'onboarding de bienvenue pour ce nouveau client." },
        ],
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error("[Emma-Onboarding] LLM error:", llmResponse.status, errText);
      return new Response(JSON.stringify({ error: "LLM error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmData = await llmResponse.json();
    const rawMessage = llmData.choices?.[0]?.message?.content || "";
    // Clean tags from message
    const cleanMessage = rawMessage
      .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
      .replace(/\[ESCALADE\]/g, "")
      .replace(/\[TRANSFER:[^\]]*\]/g, "")
      .trim();

    // Update lead: set active_agent to emma, initialize nps_data
    await supabaseAdmin.from("leads").update({
      active_agent: "emma",
      status: "converted",
      nps_data: { last_nps_score: null, last_nps_date: null, google_review_proposed: false, referral_proposed: false },
      updated_at: new Date().toISOString(),
    }).eq("id", lead_id);

    // Save message in conversations
    await supabaseAdmin.from("conversations").insert({
      lead_id: lead_id,
      role: "assistant",
      content: cleanMessage,
      agent: "emma",
    });

    // Send via WhatsApp
    let sent = false;
    if (lead.whatsapp_number) {
      sent = await sendWhatsApp(lead.whatsapp_number, cleanMessage);
    }

    console.log("[Emma-Onboarding] Onboarding sent for lead", lead_id, "WhatsApp:", sent);

    return new Response(JSON.stringify({ status: "ok", lead_id, whatsapp_sent: sent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Emma-Onboarding] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
