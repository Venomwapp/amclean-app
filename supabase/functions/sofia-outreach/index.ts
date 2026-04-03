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
    console.log("[Claire-Outreach] Evolution API not configured — message NOT sent to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Claire-Outreach] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Claire-Outreach] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check Brussels business hours (8h-18h)
    const now = new Date();
    const brusselsHour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }).format(now));
    if (brusselsHour < 8 || brusselsHour >= 18) {
      console.log(`[Claire-Outreach] Outside business hours (${brusselsHour}h Brussels). Skipping.`);
      return new Response(
        JSON.stringify({ status: "outside_hours", brussels_hour: brusselsHour }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check daily limit: max 40 outreach messages per day (Brussels timezone)
    const brusselsDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
    const todayStart = `${brusselsDate}T00:00:00+00:00`;
    const todayEnd = `${brusselsDate}T23:59:59+00:00`;

    const { count: todayCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("agent", "claire")
      .eq("role", "assistant")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd);

    const dailySent = todayCount || 0;
    if (dailySent >= 40) {
      console.log(`[Claire-Outreach] Daily limit reached (${dailySent}/40). Skipping.`);

      // Notify Telegram that daily prospecting is complete
      const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
      const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
      if (telegramKey && telegramChatId) {
        await fetch(`https://api.telegram.org/bot${telegramKey}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: "✅ <b>Prospecção diária concluída!</b>\n\n📊 40/40 leads prospectados com sucesso hoje.",
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }

      return new Response(
        JSON.stringify({ status: "daily_limit_reached", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find next lead to contact: active_agent = 'claire', status = 'new', source = 'prospecting'
    // Must have whatsapp_number and NO conversations yet
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("active_agent", "claire")
      .eq("status", "new")
      .eq("source", "prospecting")
      .not("whatsapp_number", "is", null)
      .order("created_at", { ascending: true })
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log("[Claire-Outreach] No leads to contact.");
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
      console.log("[Claire-Outreach] All candidate leads already have conversations.");
      return new Response(
        JSON.stringify({ status: "all_contacted", sent_today: dailySent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Claire-Outreach] Contacting: ${targetLead.company_name} (${targetLead.whatsapp_number})`);

    // Load Claire's agent config for system prompt
    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("*")
      .eq("agent_name", "claire")
      .eq("is_active", true)
      .single();

    if (!agentConfig) {
      console.error("[Claire-Outreach] No claire agent config found");
      return new Response(
        JSON.stringify({ status: "error", message: "No claire agent config" }),
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

STRUCTURE OBLIGATOIRE DU MESSAGE (3-4 phrases) :
1. Salutation chaleureuse avec le prénom/nom du contact
2. Présente-toi ET ce que fait AM Clean en 1 phrase (spécialisés dans le nettoyage professionnel en Belgique)
3. Mentionne que tu travailles avec des entreprises dans leur région
4. Pose UNE question ouverte : demande s'ils ont un moment pour en discuter ou si l'entretien de leurs locaux est un sujet d'intérêt

EXEMPLE DE BON MESSAGE :
"Bonjour ${targetLead.contact_name || ""}! Je suis Claire d'AM Clean, nous sommes spécialisés dans le nettoyage professionnel en Belgique. Nous accompagnons déjà plusieurs professionnels dans la région de ${targetLead.location || "Bruxelles"} et je voulais savoir si l'entretien de vos locaux est un sujet sur lequel on pourrait vous aider ? 😊"

INTERDIT DE MENTIONNER le type d'espace spécifique (bureau, cabinet, etc.) dans le premier message.

INTERDIT :
- Message générique type "Bonjour, je suis Claire de AM Clean Belgium" sans contexte
- Tags [LEAD_DATA], [TRANSFER], [ESCALADE]
- Mentionner des prix
- Langue : ${langName}
`,
      pt: `
LEAD A CONTACTAR :
- Empresa: ${targetLead.company_name || "desconhecida"}
- Contacto: ${targetLead.contact_name || "desconhecido"}
- Tipo de espaço: ${targetLead.space_type || "não especificado"}
- Localização: ${targetLead.location || "não especificada"}
- Serviço potencial: ${targetLead.service_requested || "limpeza profissional"}

ESTRUTURA OBRIGATÓRIA DA MENSAGEM (3-4 frases) :
1. Saudação calorosa com o nome do contacto
2. Apresenta-te E o que a AM Clean faz em 1 frase (especializados em limpeza profissional na Bélgica)
3. Menciona que trabalhas com empresas na região deles
4. Faz UMA pergunta aberta: pergunta se têm um momento para conversar ou se a limpeza dos espaços é algo que procuram melhorar

EXEMPLO DE BOA MENSAGEM :
"Olá ${targetLead.contact_name || ""}! Sou a Claire da AM Clean, somos especializados em limpeza profissional na Bélgica. Trabalhamos com vários profissionais na região de ${targetLead.location || "Bruxelles"} e gostaria de saber se a manutenção e limpeza do vosso espaço é algo em que podemos ajudar? 😊"

PROIBIDO MENCIONAR o tipo de espaço específico (escritório, consultório, etc.) na primeira mensagem.

PROIBIDO :
- Mensagem genérica tipo "Olá, sou a Claire da AM Clean Belgium" sem contexto
- Tags [LEAD_DATA], [TRANSFER], [ESCALADE]
- Mencionar preços
- Idioma : ${langName}
`,
      nl: `
LEAD OM TE CONTACTEREN :
- Bedrijf: ${targetLead.company_name || "onbekend"}
- Contact: ${targetLead.contact_name || "onbekend"}
- Type ruimte: ${targetLead.space_type || "niet gespecificeerd"}
- Locatie: ${targetLead.location || "niet gespecificeerd"}
- Potentiële dienst: ${targetLead.service_requested || "professionele schoonmaak"}

VERPLICHTE STRUCTUUR VAN HET BERICHT (3-4 zinnen) :
1. Warme begroeting met de naam van het contact
2. Stel jezelf voor EN wat AM Clean doet in 1 zin (gespecialiseerd in professionele schoonmaak in België)
3. Vermeld dat je met bedrijven in hun regio werkt
4. Stel ÉÉN open vraag: vraag of ze een moment hebben om te praten of het onderhoud van hun ruimte een onderwerp is

VOORBEELD VAN EEN GOED BERICHT :
"Hallo ${targetLead.contact_name || ""}! Ik ben Claire van AM Clean, wij zijn gespecialiseerd in professionele schoonmaak in België. We werken al met verschillende professionals in de regio ${targetLead.location || "Brussel"} en ik wilde weten of het onderhoud van uw ruimte iets is waarbij we u kunnen helpen? 😊"

VERBODEN om het specifieke type ruimte (kantoor, praktijk, etc.) te vermelden in het eerste bericht.

VERBODEN :
- Generiek bericht zoals "Hallo, ik ben Claire van AM Clean Belgium" zonder context
- Tags [LEAD_DATA], [TRANSFER], [ESCALADE]
- Prijzen vermelden
- Taal : ${langName}
`,
      en: `
LEAD TO CONTACT :
- Company: ${targetLead.company_name || "unknown"}
- Contact: ${targetLead.contact_name || "unknown"}
- Space type: ${targetLead.space_type || "not specified"}
- Location: ${targetLead.location || "not specified"}
- Potential service: ${targetLead.service_requested || "professional cleaning"}

MANDATORY MESSAGE STRUCTURE (3-4 sentences) :
1. Warm greeting with the contact's name
2. Introduce yourself AND what AM Clean does in 1 sentence (specialized in professional cleaning in Belgium)
3. Mention that you work with businesses in their area
4. Ask ONE open question: ask if they have a moment to chat or if the maintenance of their space is something they're looking to improve

EXAMPLE OF A GOOD MESSAGE :
"Hello ${targetLead.contact_name || ""}! I'm Claire from AM Clean, we specialize in professional cleaning in Belgium. We already work with several professionals in the ${targetLead.location || "Brussels"} area and I wanted to know if the maintenance of your space is something we could help with? 😊"

DO NOT mention the specific space type (office, clinic, etc.) in the first message.

FORBIDDEN :
- Generic message like "Hello, I'm Claire from AM Clean Belgium" without context
- Tags [LEAD_DATA], [TRANSFER], [ESCALADE]
- Mentioning prices
- Language : ${langName}
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

    const llmResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        temperature: agentConfig.temperature ?? 0.4,
        max_tokens: 1024,
        messages: llmMessages,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error("[Claire-Outreach] LLM error:", llmResponse.status, errText);
      return new Response(
        JSON.stringify({ status: "error", message: "LLM error", http_status: llmResponse.status, detail: errText.substring(0, 200), api_key_set: !!geminiApiKey }),
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
      console.error("[Claire-Outreach] Generated message too short or empty");
      return new Response(
        JSON.stringify({ status: "error", message: "Empty message generated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Claire-Outreach] Message for ${targetLead.company_name}: ${message.substring(0, 100)}...`);

    // Send via WhatsApp
    const sent = await sendWhatsApp(targetLead.whatsapp_number, message);

    // Save conversation
    await supabase.from("conversations").insert({
      lead_id: targetLead.id,
      role: "assistant",
      content: message,
      agent: "claire",
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
      title: `Claire → ${targetLead.company_name}`,
      description: `Premier contact envoyé (${lang.toUpperCase()}) | ${sent ? "✅ WhatsApp envoyé" : "⚠️ WhatsApp non configuré"}`,
      metadata: { lead_id: targetLead.id, whatsapp_sent: sent },
    });

    console.log(`[Claire-Outreach] Done — Lead: ${targetLead.company_name}, WhatsApp: ${sent ? "OK" : "NOT_SENT"}, Today: ${dailySent + 1}/40`);

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
    console.error("[Claire-Outreach] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
