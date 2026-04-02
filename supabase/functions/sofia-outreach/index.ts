import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[Sofia-Outreach] Evolution API not configured — message NOT sent to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Sofia-Outreach] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Sofia-Outreach] Send error:", e);
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

    // Check daily limit: max 40 outreach messages per day (Brussels timezone)
    const now = new Date();
    const brusselsDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
    const todayStart = `${brusselsDate}T00:00:00+00:00`;
    const todayEnd = `${brusselsDate}T23:59:59+00:00`;

    const { count: todayCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("agent", "sophie")
      .eq("role", "assistant")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd);

    const dailySent = todayCount || 0;
    if (dailySent >= 40) {
      console.log(`[Sofia-Outreach] Daily limit reached (${dailySent}/40). Skipping.`);
      return new Response(
        JSON.stringify({ status: "daily_limit_reached", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find next lead to contact: active_agent = 'sophie', status = 'new', source = 'prospecting'
    // Must have whatsapp_number and NO conversations yet
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("active_agent", "sophie")
      .eq("status", "new")
      .eq("source", "prospecting")
      .not("whatsapp_number", "is", null)
      .order("created_at", { ascending: true })
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log("[Sofia-Outreach] No leads to contact.");
      return new Response(
        JSON.stringify({ status: "no_leads", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out leads that already have conversations
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
      console.log("[Sofia-Outreach] All candidate leads already have conversations.");
      return new Response(
        JSON.stringify({ status: "all_contacted", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Sofia-Outreach] Contacting: ${targetLead.company_name} (${targetLead.whatsapp_number})`);

    // Load Sophie's agent config for system prompt
    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("*")
      .eq("agent_name", "sophie")
      .eq("is_active", true)
      .single();

    if (!agentConfig) {
      console.error("[Sofia-Outreach] No sophie agent config found");
      return new Response(
        JSON.stringify({ status: "error", message: "No sophie agent config" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect language from lead data or default to FR
    const lang = targetLead.language || "fr";

    // Language name mapping for LLM instructions
    const langNames: Record<string, string> = {
      fr: "français",
      nl: "néerlandais",
      en: "anglais",
      pt: "português",
    };
    const langName = langNames[lang] || "français";

    // Multilingual lead context
    const leadContextByLang: Record<string, string> = {
      fr: `
LEAD À CONTACTER :
- Entreprise: ${targetLead.company_name || "inconnue"}
- Contact: ${targetLead.contact_name || "inconnu"}
- Type d'espace: ${targetLead.space_type || "non précisé"}
- Localisation: ${targetLead.location || "non précisée"}
- Service potentiel: ${targetLead.service_requested || "nettoyage professionnel"}
- Langue: ${lang}
- Score: ${targetLead.score || "WARM"}

INSTRUCTIONS SPÉCIALES POUR CE MESSAGE :
- C'est le PREMIER contact avec ce prospect. Il ne nous connaît pas.
- Écris UN SEUL message court (2-3 phrases max).
- Personnalise avec le nom de l'entreprise et le type d'activité.
- Ne pose qu'UNE question ouverte pour engager la conversation.
- Langue du message : ${langName}
- N'ajoute AUCUN tag [LEAD_DATA] ou [TRANSFER] — c'est un premier contact.
- NE mentionne JAMAIS de prix.
`,
      pt: `
LEAD A CONTACTAR :
- Empresa: ${targetLead.company_name || "desconhecida"}
- Contacto: ${targetLead.contact_name || "desconhecido"}
- Tipo de espaço: ${targetLead.space_type || "não especificado"}
- Localização: ${targetLead.location || "não especificada"}
- Serviço potencial: ${targetLead.service_requested || "limpeza profissional"}
- Idioma: ${lang}
- Score: ${targetLead.score || "WARM"}

INSTRUÇÕES ESPECIAIS PARA ESTA MENSAGEM :
- É o PRIMEIRO contacto com este prospect. Ele não nos conhece.
- Escreve UMA ÚNICA mensagem curta (2-3 frases máx).
- Personaliza com o nome da empresa e o tipo de atividade.
- Faz apenas UMA pergunta aberta para iniciar a conversa.
- Idioma da mensagem : ${langName}
- NÃO adiciones nenhum tag [LEAD_DATA] ou [TRANSFER] — é um primeiro contacto.
- NUNCA menciones preços.
`,
      nl: `
LEAD OM TE CONTACTEREN :
- Bedrijf: ${targetLead.company_name || "onbekend"}
- Contact: ${targetLead.contact_name || "onbekend"}
- Type ruimte: ${targetLead.space_type || "niet gespecificeerd"}
- Locatie: ${targetLead.location || "niet gespecificeerd"}
- Potentiële dienst: ${targetLead.service_requested || "professionele schoonmaak"}
- Taal: ${lang}
- Score: ${targetLead.score || "WARM"}

SPECIALE INSTRUCTIES VOOR DIT BERICHT :
- Dit is het EERSTE contact met deze prospect. Hij kent ons niet.
- Schrijf SLECHTS ÉÉN kort bericht (2-3 zinnen max).
- Personaliseer met de bedrijfsnaam en het type activiteit.
- Stel slechts ÉÉN open vraag om het gesprek te starten.
- Taal van het bericht : ${langName}
- Voeg GEEN tag [LEAD_DATA] of [TRANSFER] toe — dit is een eerste contact.
- Vermeld NOOIT prijzen.
`,
      en: `
LEAD TO CONTACT :
- Company: ${targetLead.company_name || "unknown"}
- Contact: ${targetLead.contact_name || "unknown"}
- Space type: ${targetLead.space_type || "not specified"}
- Location: ${targetLead.location || "not specified"}
- Potential service: ${targetLead.service_requested || "professional cleaning"}
- Language: ${lang}
- Score: ${targetLead.score || "WARM"}

SPECIAL INSTRUCTIONS FOR THIS MESSAGE :
- This is the FIRST contact with this prospect. They don't know us.
- Write ONE single short message (2-3 sentences max).
- Personalize with the company name and type of activity.
- Ask only ONE open question to start the conversation.
- Message language : ${langName}
- Do NOT add any tag [LEAD_DATA] or [TRANSFER] — this is a first contact.
- NEVER mention prices.
`,
    };

    const leadContext = leadContextByLang[lang] || leadContextByLang.fr;

    const promptLang = lang === "pt" ? "pt" : lang === "nl" ? "nl" : lang === "en" ? "en" : "fr";
    const generatePrompts: Record<string, string> = {
      fr: `Génère le premier message de prospection pour ${targetLead.company_name}. Réponds UNIQUEMENT avec le message à envoyer, sans guillemets ni explication.`,
      pt: `Gere a primeira mensagem de prospecção para ${targetLead.company_name}. Responda APENAS com a mensagem a enviar, sem aspas nem explicação.`,
      nl: `Genereer het eerste prospectie bericht voor ${targetLead.company_name}. Antwoord ALLEEN met het te verzenden bericht, zonder aanhalingstekens of uitleg.`,
      en: `Generate the first prospecting message for ${targetLead.company_name}. Reply ONLY with the message to send, without quotes or explanation.`,
    };

    const llmMessages = [
      { role: "system", content: agentConfig.system_prompt + leadContext },
      { role: "user", content: generatePrompts[promptLang] || generatePrompts.fr },
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
      console.error("[Sofia-Outreach] LLM error:", llmResponse.status, errText);
      return new Response(
        JSON.stringify({ status: "error", message: "LLM error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    let message = (llmData.choices?.[0]?.message?.content || "").trim();

    // Clean any accidental tags
    message = message
      .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
      .replace(/\[TRANSFER:[^\]]*\]/g, "")
      .replace(/\[ESCALADE\]/g, "")
      .replace(/\[SCHEDULING_REQUEST:[^\]]*\]/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    if (!message || message.length < 10) {
      console.error("[Sofia-Outreach] Generated message too short or empty");
      return new Response(
        JSON.stringify({ status: "error", message: "Empty message generated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Sofia-Outreach] Message for ${targetLead.company_name}: ${message.substring(0, 100)}...`);

    // Send via WhatsApp
    const sent = await sendWhatsApp(targetLead.whatsapp_number, message);

    // Save conversation
    await supabase.from("conversations").insert({
      lead_id: targetLead.id,
      role: "assistant",
      content: message,
      agent: "sophie",
      metadata: { outreach: true, first_contact: true },
    });

    // Update lead status to qualifying
    await supabase.from("leads").update({
      status: "qualifying",
      updated_at: new Date().toISOString(),
    }).eq("id", targetLead.id);

    // Log activity
    await supabase.from("activity_log").insert({
      type: "outreach",
      title: `Sophie → ${targetLead.company_name}`,
      description: `Premier contact envoyé (${lang.toUpperCase()}) | ${sent ? "✅ WhatsApp envoyé" : "⚠️ WhatsApp non configuré"}`,
      metadata: { lead_id: targetLead.id, whatsapp_sent: sent },
    });

    console.log(`[Sofia-Outreach] Done — Lead: ${targetLead.company_name}, WhatsApp: ${sent ? "OK" : "NOT_SENT"}, Today: ${dailySent + 1}/40`);

    return new Response(
      JSON.stringify({
        status: "ok",
        lead_id: targetLead.id,
        company: targetLead.company_name,
        whatsapp_sent: sent,
        sent_today: dailySent + 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Sofia-Outreach] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
