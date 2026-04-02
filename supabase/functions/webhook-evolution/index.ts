import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FOLLOWUP_MESSAGES: Record<string, string[]> = {
  fr: [
    "Bonjour ! Je me permets de revenir vers vous concernant votre demande de nettoyage. Avez-vous eu le temps de réfléchir ? Je reste disponible pour planifier un rendez-vous avec Meyri. 😊",
    "Bonjour ! Je souhaitais m'assurer que vous aviez bien reçu mon message. Si vous êtes toujours intéressé(e) par nos services, je serais ravie de vous proposer un créneau pour rencontrer Meyri cette semaine.",
    "Bonjour ! C'est Claire d'AM Clean. Meyri a encore quelques créneaux disponibles cette semaine. Si votre projet est toujours d'actualité, n'hésitez pas à me répondre. Sinon, nous restons à votre disposition. Belle journée ! ☀️",
  ],
  nl: [
    "Goedendag! Ik neem de vrijheid om terug te komen op uw schoonmaakaanvraag. Heeft u tijd gehad om erover na te denken? Ik blijf beschikbaar om een afspraak te plannen met Meyri. 😊",
    "Goedendag! Ik wilde even controleren of u mijn bericht goed heeft ontvangen. Als u nog steeds geïnteresseerd bent in onze schoonmaakdiensten, stel ik graag een moment voor om Meyri deze week te ontmoeten.",
    "Goedendag! Het is Claire van AM Clean. Meyri heeft deze week nog enkele beschikbare momenten. Als uw project nog actueel is, aarzel niet om te antwoorden. Fijne dag! ☀️",
  ],
  en: [
    "Hello! Just following up on your cleaning inquiry. Have you had time to think it over? I'm available to schedule an appointment with Meyri. 😊",
    "Hello! Just wanted to make sure you received my message. If you're still interested in our cleaning services, I'd be happy to suggest a time to meet Meyri this week.",
    "Hello! It's Claire from AM Clean. Meyri still has some available slots this week. If your project is still ongoing, feel free to reply. Have a great day! ☀️",
  ],
  pt: [
    "Olá! Estou voltando ao assunto da sua solicitação de limpeza. Teve tempo de pensar? Fico à disposição para agendar um encontro com a Meyri. 😊",
    "Olá! Queria confirmar que recebeu minha mensagem. Se ainda estiver interessado(a) nos nossos serviços de limpeza, terei prazer em sugerir um horário para conhecer a Meyri esta semana.",
    "Olá! Aqui é a Claire da AM Clean. A Meyri ainda tem alguns horários disponíveis esta semana. Se o seu projeto ainda está em andamento, fique à vontade para responder. Tenha um ótimo dia! ☀️",
  ],
};

// Normalize phone: strip +, spaces, dashes. For BR numbers (55), handle 9th digit variants
function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function phoneVariants(num: string): string[] {
  const variants = [num, `+${num}`];
  // Brazilian numbers: try adding/removing the 9th digit after area code
  if (num.startsWith("55") && num.length === 12) {
    // Missing 9th digit: 55 XX XXXXXXXX → 55 XX 9XXXXXXXX
    variants.push(num.slice(0, 4) + "9" + num.slice(4));
    variants.push("+" + num.slice(0, 4) + "9" + num.slice(4));
  } else if (num.startsWith("55") && num.length === 13) {
    // Has 9th digit: 55 XX 9XXXXXXXX → 55 XX XXXXXXXX
    variants.push(num.slice(0, 4) + num.slice(5));
    variants.push("+" + num.slice(0, 4) + num.slice(5));
  }
  return variants;
}

function normalizeEventName(event: string | undefined): string {
  return (event || "").toLowerCase().replace(/_/g, ".").trim();
}

function extractWhatsAppData(body: any): { whatsappNumber: string; messageText: string; fromMe: boolean; event: string; isAudio: boolean; messageId?: string; remoteJid: string } | null {
  const event = normalizeEventName(body?.event);
  if (event !== "messages.upsert") return null;

  const payload = Array.isArray(body?.data) ? body.data[0] : body?.data;
  if (!payload) return null;

  // Evolution can send either { data: { key, message } } OR { data: { messages: [{ key, message }] } }
  const data = payload.key
    ? payload
    : payload?.messages?.[0]
      ? { ...payload.messages[0], messageType: payload.messages[0]?.messageType ?? payload.messageType }
      : null;

  if (!data?.key) return null;

  const fromMe = data.key?.fromMe ?? false;
  const remoteJid = String(data.key?.remoteJid ?? data.key?.remoteJID ?? "");

  // Block group messages
  if (remoteJid.endsWith("@g.us")) {
    console.log("[Webhook] Group message ignored:", remoteJid);
    return null;
  }

  // Handle @lid format (WhatsApp Linked Identity) — prioritize @s.whatsapp.net sources
  let whatsappNumber: string;
  if (remoteJid.endsWith("@lid")) {
    const candidates = [
      data.key?.senderPn,
      data.key?.participant,
      payload?.sender,
      payload?.participant,
    ].filter(Boolean);

    const whatsappCandidate = candidates.find((c: string) => c.includes("@s.whatsapp.net"))
      || candidates.find((c: string) => !c.includes("@lid"));

    whatsappNumber = (whatsappCandidate || "")
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "");

    console.log(`[Webhook] LID detected: ${remoteJid} → resolved to: ${whatsappNumber} (senderPn: ${data.key?.senderPn}, participant: ${data.key?.participant})`);
    if (!whatsappNumber || whatsappNumber.includes("@")) {
      console.error("[Webhook] Cannot resolve LID to phone number. Full key:", JSON.stringify(data.key));
      return null;
    }
  } else {
    whatsappNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // Skip protocol/system messages
  const messageType = data.messageType ?? "";
  const skipTypes = ["protocolMessage", "senderKeyDistributionMessage", "reactionMessage", "pollUpdateMessage"];
  if (skipTypes.includes(messageType)) return null;

  // Check if it's an audio message
  const isAudio = messageType === "audioMessage" || !!data.message?.audioMessage;

  const messageText = data.message?.conversation
    ?? data.message?.extendedTextMessage?.text
    ?? data.message?.imageMessage?.caption
    ?? "";

  // Allow audio messages through even without text
  if (!isAudio && (!messageText || !whatsappNumber)) return null;
  if (isAudio && !whatsappNumber) return null;

  return { whatsappNumber, messageText: messageText || "", fromMe, event, isAudio, messageId: data.key?.id, remoteJid };
}

// Fetch audio base64 from Evolution API
async function fetchAudioBase64(messageId: string, remoteJid: string): Promise<string | null> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.error("[Webhook] Evolution API not configured for audio download");
    return null;
  }
  try {
    const resp = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { key: { remoteJid, id: messageId } },
        convertToMp4: false,
      }),
    });
    if (!resp.ok) {
      console.error("[Webhook] Audio download failed:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.base64 || null;
  } catch (e) {
    console.error("[Webhook] Audio download error:", e);
    return null;
  }
}

// Transcribe audio using Gemini via Lovable AI gateway
async function transcribeAudio(audioBase64: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("[Webhook] LOVABLE_API_KEY not configured for transcription");
    return null;
  }
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this audio message exactly as spoken. Return ONLY the transcription, nothing else. If you cannot understand parts, write [inaudible]. Keep the original language.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: "ogg",
                },
              },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[Webhook] Transcription LLM error:", resp.status, errText);
      return null;
    }
    const data = await resp.json();
    const transcription = (data.choices?.[0]?.message?.content || "").trim();
    console.log(`[Webhook] Audio transcribed: "${transcription.substring(0, 100)}..."`);
    return transcription || null;
  } catch (e) {
    console.error("[Webhook] Transcription error:", e);
    return null;
  }
}

function parseLeadData(response: string): Record<string, string> {
  const match = response.match(/\[LEAD_DATA:([^\]]*)\]/);
  if (!match) return {};
  const fields: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    name: "contact_name", company: "company_name", service: "service_requested",
    space: "space_type", area: "surface_area", frequency: "frequency",
    location: "location", timeline: "timeline", language: "language",
    address: "address", nps_score: "nps_score",
  };
  match[1].split(",").forEach((pair) => {
    const [key, ...rest] = pair.split("=");
    const value = rest.join("=").trim();
    if (value && fieldMap[key.trim()]) {
      fields[fieldMap[key.trim()]] = value;
    }
  });
  return fields;
}

function parseSchedulingRequest(response: string): { type?: string; score?: string } | null {
  const match = response.match(/\[SCHEDULING_REQUEST:([^\]]*)\]/);
  if (!match) return null;
  const result: any = {};
  match[1].split(",").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k && v) result[k.trim()] = v.trim();
  });
  return result;
}

function parseTransfer(response: string): string | null {
  const match = response.match(/\[TRANSFER:(\w+)\]/);
  return match ? match[1] : null;
}

function cleanResponse(response: string): string {
  return response
    .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
    .replace(/\[SCHEDULING_REQUEST:[^\]]*\]/g, "")
    .replace(/\[ESCALADE\]/g, "")
    .replace(/\[TRANSFER:[^\]]*\]/g, "")
    // Handle truncated tags when model output is cut off
    .replace(/\[(LEAD_DATA|SCHEDULING_REQUEST|TRANSFER):?[^\]]*$/gi, "")
    .replace(/\[ESCALADE\s*$/gi, "")
    .replace(/^```(?:json)?\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
}

function repairAndParseJson(json: string): unknown {
  let braces = 0;
  let brackets = 0;

  for (const char of json) {
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  let repaired = json;
  while (brackets > 0) {
    repaired += "]";
    brackets--;
  }
  while (braces > 0) {
    repaired += "}";
    braces--;
  }

  return JSON.parse(repaired);
}

function extractMessageFromJsonLikeResponse(response: string): string | null {
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) return null;

  const opening = cleaned[jsonStart];
  const closing = opening === "[" ? "]" : "}";
  const jsonEnd = cleaned.lastIndexOf(closing);
  if (jsonEnd === -1) return null;

  const jsonSlice = cleaned.substring(jsonStart, jsonEnd + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    parsed = repairAndParseJson(jsonSlice);
  }

  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  const possibleText =
    candidate?.message ??
    candidate?.content ??
    candidate?.text ??
    candidate?.reply ??
    null;

  if (typeof possibleText !== "string") return null;
  return cleanResponse(possibleText);
}

function resolveSafeAssistantMessage(rawResponse: string, fallbackMessage: string): { message: string; usedFallback: boolean; parseSource: "clean" | "json_repair" | "fallback" } {
  const direct = cleanResponse(rawResponse);
  if (direct && direct.length >= 8) {
    return { message: direct, usedFallback: false, parseSource: "clean" };
  }

  const extracted = extractMessageFromJsonLikeResponse(rawResponse);
  if (extracted && extracted.length >= 8) {
    return { message: extracted, usedFallback: false, parseSource: "json_repair" };
  }

  return { message: fallbackMessage, usedFallback: true, parseSource: "fallback" };
}

function getFallbackReply(language?: string): string {
  const lang = (language || "fr").toLowerCase();
  if (lang === "pt") return "Obrigado pela sua mensagem! Poderia partilhar um pouco mais de contexto para eu ajudar melhor?";
  if (lang === "nl") return "Bedankt voor uw bericht! Kunt u wat extra context delen zodat ik u beter kan helpen?";
  if (lang === "en") return "Thanks for your message! Could you share a bit more context so I can help you better?";
  return "Merci pour votre message ! Pouvez-vous partager un peu plus de contexte pour que je puisse mieux vous aider ?";
}

function autoScore(lead: any, conversationText?: string): string | null {
  const timeline = (lead.timeline || "").toLowerCase();
  const convText = (conversationText || "").toLowerCase();
  const combined = `${timeline} ${convText}`;
  
  const hotKeywords = [
    "immédiat", "immédiatement", "urgent", "urgence", "dès que possible",
    "immediately", "asap", "au plus vite", "cette semaine", "semaine prochaine",
    "dringend", "zo snel mogelijk", "deze week", "volgende week",
    "le plus tôt", "rapidement", "vite", "pressé", "right away",
  ];
  const coldKeywords = [
    "dans quelques mois", "explorer", "just looking", "pas pressé",
    "not urgent", "later", "plus tard", "l'année prochaine", "next year",
  ];
  
  if (hotKeywords.some(k => combined.includes(k))) return "HOT";
  if (coldKeywords.some(k => combined.includes(k))) return "COLD";
  return null;
}

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[WhatsApp] Evolution API not configured — message NOT sent. Would send to", number, ":", text.substring(0, 80));
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[WhatsApp] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[WhatsApp] Send error:", e);
    return false;
  }
}

async function sendEscalation(supabaseAdmin: any, lead: any, messageText: string) {
  const meyriWhatsapp = Deno.env.get("MEIRYLAINE_WHATSAPP");
  if (!meyriWhatsapp) {
    console.log("[Escalade] MEIRYLAINE_WHATSAPP not configured");
    return;
  }
  const text = `🚨 ESCALADE — Lead: ${lead.contact_name || "Inconnu"} (${lead.whatsapp_number})\nAgent: ${lead.active_agent}\nDernier message: ${messageText}\nRaison: Escalade demandée par l'agent`;
  await sendWhatsApp(meyriWhatsapp, text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("[Webhook] Event received:", body?.event);

    const parsed = extractWhatsAppData(body);
    if (!parsed) {
      console.log("[Webhook] Ignored event");
      return new Response(JSON.stringify({ status: "ignored" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (parsed.fromMe) {
      console.log("[Webhook] Ignored fromMe message");
      return new Response(JSON.stringify({ status: "ignored_from_me" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { whatsappNumber, isAudio, messageId, remoteJid } = parsed;
    let messageText = parsed.messageText;

    // If audio message, transcribe it
    if (isAudio) {
      console.log("[Webhook] Audio message detected from", whatsappNumber, "— transcribing...");
      const audioBase64 = await fetchAudioBase64(messageId || "", remoteJid);
      if (audioBase64) {
        const transcription = await transcribeAudio(audioBase64);
        if (transcription) {
          messageText = `[🎤 Áudio transcrito]: ${transcription}`;
          console.log("[Webhook] Audio transcribed successfully:", transcription.substring(0, 80));
        } else {
          messageText = "[🎤 Mensagem de áudio recebida — transcrição indisponível]";
          console.log("[Webhook] Audio transcription failed, using fallback text");
        }
      } else {
        messageText = "[🎤 Mensagem de áudio recebida — não foi possível baixar o áudio]";
        console.log("[Webhook] Could not download audio from Evolution API");
      }
    }

    console.log("[Webhook] Processing message from", whatsappNumber, ":", messageText.substring(0, 50));

    // Init Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Step 2: Find or create lead (try multiple phone formats)
    const variants = phoneVariants(normalizePhone(whatsappNumber));
    let lead: any = null;
    for (const variant of variants) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("whatsapp_number", variant)
        .single();
      if (data) {
        lead = data;
        console.log("[Webhook] Lead found with variant:", variant);
        break;
      }
    }

    if (!lead) {
      // Normalize number with + prefix for display (e.g. +32493721779)
      const normalizedNumber = whatsappNumber.startsWith('+') ? whatsappNumber : `+${normalizePhone(whatsappNumber)}`;
      const { data: newLead, error: insertErr } = await supabaseAdmin
        .from("leads")
        .insert({
          whatsapp_number: normalizedNumber,
          status: "new",
          active_agent: "claire",
          language: "fr",
          source: "whatsapp",
        })
        .select()
        .single();
      if (insertErr) throw new Error(`Lead insert error: ${insertErr.message}`);
      lead = newLead;
      console.log("[Webhook] New lead created:", lead.id);
    } else {
      await supabaseAdmin.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", lead.id);
    }

    // Cancel pending followups when lead responds
    await supabaseAdmin
      .from("followups")
      .update({ status: "cancelled" })
      .eq("lead_id", lead.id)
      .eq("status", "pending");

    // Step 3: Save incoming message
    await supabaseAdmin.from("conversations").insert({
      lead_id: lead.id,
      role: "user",
      content: messageText,
      agent: lead.active_agent,
    });

    // Step 4: Load context
    let agentConfig: any;
    const { data: activeAgent } = await supabaseAdmin
      .from("agent_configs")
      .select("*")
      .eq("agent_name", lead.active_agent)
      .eq("is_active", true)
      .single();

    if (activeAgent) {
      agentConfig = activeAgent;
    } else {
      const { data: fallback } = await supabaseAdmin
        .from("agent_configs")
        .select("*")
        .eq("agent_name", "claire")
        .single();
      agentConfig = fallback;
    }

    if (!agentConfig) {
      console.error("[Webhook] No agent config found");
      return new Response(JSON.stringify({ status: "error", message: "No agent config" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load last 20 messages
    const { data: history } = await supabaseAdmin
      .from("conversations")
      .select("role, content")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build enriched system prompt
    const npsInfo = lead.nps_data ? `\n- NPS Data: score=${lead.nps_data.last_nps_score ?? "non évalué"}, google_review_proposed=${lead.nps_data.google_review_proposed ?? false}, referral_proposed=${lead.nps_data.referral_proposed ?? false}` : "";
    
    // Provide current date/time so agents can propose near-term slots
    const now = new Date();
    const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const monthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const dateContext = `\n\nDATE ACTUELLE : ${dayNames[now.getDay()]} ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}, ${now.getHours()}h${String(now.getMinutes()).padStart(2, "0")} (heure de Belgique).`;
    
    const leadContext = `\n\nDONNÉES CONNUES SUR CE LEAD :\n- Nom: ${lead.contact_name || "inconnu"}\n- Entreprise: ${lead.company_name || "inconnue"}\n- Service demandé: ${lead.service_requested || "non précisé"}\n- Localisation: ${lead.location || "inconnue"}\n- Adresse: ${lead.address || "non précisée"}\n- Surface: ${lead.surface_area || "non précisée"}\n- Fréquence: ${lead.frequency || "non précisée"}\n- Timeline: ${lead.timeline || "non précisé"}\n- Score: ${lead.score || "non évalué"}\n- Langue détectée: ${lead.language || "fr"}${npsInfo}\n(Ne redemande pas les informations déjà connues.)`;

    const systemPrompt = agentConfig.system_prompt + dateContext + leadContext;

    // Step 5: Call LLM via Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[Webhook] LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ status: "error", message: "LLM not configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const llmMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Don't duplicate last user message if already in history
    const lastHistoryMsg = history && history.length > 0 ? history[history.length - 1] : null;
    if (!lastHistoryMsg || lastHistoryMsg.content !== messageText || lastHistoryMsg.role !== "user") {
      llmMessages.push({ role: "user", content: messageText });
    }

    console.log("[Webhook] Calling LLM with", llmMessages.length, "messages");

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: agentConfig.temperature ?? 0.3,
        max_tokens: agentConfig.max_tokens ?? 500,
        messages: llmMessages,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error("[Webhook] LLM error:", llmResponse.status, errText);
      return new Response(JSON.stringify({ status: "error", message: "LLM error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const llmData = await llmResponse.json();
    const rawResponse = llmData.choices?.[0]?.message?.content || "";
    console.log("[Webhook] LLM response received, length:", rawResponse.length);

    // Step 6: Parse tags
    const tagsDetected: string[] = [];
    const leadUpdates: Record<string, any> = {};
    let transferHandled = false;

    // Parse LEAD_DATA
    const leadDataFields = parseLeadData(rawResponse);
    if (Object.keys(leadDataFields).length > 0) {
      tagsDetected.push("LEAD_DATA");
      // Handle nps_score separately — update nps_data JSONB
      if (leadDataFields.nps_score) {
        const currentNpsData = lead.nps_data || {};
        const score = parseInt(leadDataFields.nps_score);
        const updatedNps: any = {
          ...currentNpsData,
          last_nps_score: isNaN(score) ? leadDataFields.nps_score : score,
          last_nps_date: new Date().toISOString().split("T")[0],
        };
        // If promoter (9-10), mark review/referral as proposed if mentioned
        if (!isNaN(score) && score >= 9) {
          if (rawResponse.includes("[LIEN_AVIS]")) updatedNps.google_review_proposed = true;
          if (rawResponse.toLowerCase().includes("parrainage") || rawResponse.toLowerCase().includes("recommandation")) updatedNps.referral_proposed = true;
        }
        leadUpdates.nps_data = updatedNps;
        delete leadDataFields.nps_score;
      }
      Object.assign(leadUpdates, leadDataFields);
    }

    // AUTO-TRANSFER: If Sophie collected enough LEAD_DATA (area + frequency + timeline), 
    // force transfer to Claire even if LLM forgot [TRANSFER:claire]
    let transferTo = parseTransfer(rawResponse);
    if (!transferTo && lead.active_agent === "sophie" && tagsDetected.includes("LEAD_DATA")) {
      const mergedLead = { ...lead, ...leadUpdates };
      const hasArea = !!(mergedLead.surface_area && mergedLead.surface_area !== "non précisée");
      const hasFrequency = !!(mergedLead.frequency && mergedLead.frequency !== "non précisée");
      const hasTimeline = !!(mergedLead.timeline && mergedLead.timeline !== "non précisé");
      if (hasArea && hasFrequency && hasTimeline) {
        console.log("[Webhook] Sophie qualified lead with sufficient data — forcing auto-transfer to Claire");
        transferTo = "claire";
        tagsDetected.push("AUTO_TRANSFER");
      }
    }

    // Parse SCHEDULING_REQUEST → create appointment
    const scheduling = parseSchedulingRequest(rawResponse);
    if (scheduling) {
      tagsDetected.push("SCHEDULING_REQUEST");
      if (scheduling.score) leadUpdates.score = scheduling.score;
      leadUpdates.status = "scheduled";

      // Try to extract datetime from the conversation context
      // Brussels timezone offset (CET=+1, CEST=+2)
      const brusselsNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Brussels" }));
      const brusselsOffset = (brusselsNow.getTimezoneOffset() === 0) ? 1 : (now.getMonth() >= 2 && now.getMonth() <= 9) ? 2 : 1; // simplified CET/CEST

      // Try full date pattern first: "10 mars à 14h00"
      const dateMatch = rawResponse.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:à\s+)?(\d{1,2})[h:]?(\d{0,2})/i);
      // Try relative date patterns: "aujourd'hui à 14h", "demain à 10h"
      const relativeMatch = !dateMatch ? rawResponse.match(/(?:aujourd['']?hui|today|vandaag|hoje)\s+(?:à\s+)?(\d{1,2})[h:](\d{0,2})/i) : null;
      const tomorrowMatch = !dateMatch && !relativeMatch ? rawResponse.match(/(?:demain|tomorrow|morgen|amanhã)\s+(?:à\s+)?(\d{1,2})[h:](\d{0,2})/i) : null;
      // Try just time pattern: "à 14h00", "at 14:00"
      const timeOnlyMatch = !dateMatch && !relativeMatch && !tomorrowMatch ? rawResponse.match(/(?:à|at|om|às)\s+(\d{1,2})[h:](\d{0,2})/i) : null;

      let appointmentDatetime: string | null = null;

      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const monthNames: Record<string, number> = {
          janvier: 0, january: 0, février: 1, february: 1, mars: 2, march: 2, avril: 3, april: 3,
          mai: 4, may: 4, juin: 5, june: 5, juillet: 6, july: 6, août: 7, august: 7,
          septembre: 8, september: 8, octobre: 9, october: 9, novembre: 10, november: 10, décembre: 11, december: 11,
        };
        const month = monthNames[dateMatch[2].toLowerCase()] ?? 0;
        const hour = parseInt(dateMatch[3]);
        const minute = parseInt(dateMatch[4] || "0");
        const year = brusselsNow.getFullYear();
        // Create as Brussels time → convert to UTC
        const utcHour = hour - brusselsOffset;
        const dt = new Date(Date.UTC(year, month, day, utcHour, minute));
        if (dt < now) dt.setFullYear(year + 1);
        appointmentDatetime = dt.toISOString();
        console.log(`[Webhook] Parsed full date: ${day}/${month + 1} ${hour}h${minute} Brussels → ${appointmentDatetime}`);
      } else if (relativeMatch) {
        // Today + time
        const hour = parseInt(relativeMatch[1]);
        const minute = parseInt(relativeMatch[2] || "0");
        const utcHour = hour - brusselsOffset;
        const dt = new Date(Date.UTC(brusselsNow.getFullYear(), brusselsNow.getMonth(), brusselsNow.getDate(), utcHour, minute));
        appointmentDatetime = dt.toISOString();
        console.log(`[Webhook] Parsed 'today' date: ${hour}h${minute} Brussels → ${appointmentDatetime}`);
      } else if (tomorrowMatch) {
        const hour = parseInt(tomorrowMatch[1]);
        const minute = parseInt(tomorrowMatch[2] || "0");
        const utcHour = hour - brusselsOffset;
        const tomorrow = new Date(brusselsNow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dt = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), utcHour, minute));
        appointmentDatetime = dt.toISOString();
        console.log(`[Webhook] Parsed 'tomorrow' date: ${hour}h${minute} Brussels → ${appointmentDatetime}`);
      } else if (timeOnlyMatch) {
        // Time only → assume today
        const hour = parseInt(timeOnlyMatch[1]);
        const minute = parseInt(timeOnlyMatch[2] || "0");
        const utcHour = hour - brusselsOffset;
        const dt = new Date(Date.UTC(brusselsNow.getFullYear(), brusselsNow.getMonth(), brusselsNow.getDate(), utcHour, minute));
        // If time already passed today, assume tomorrow
        if (dt < now) dt.setDate(dt.getDate() + 1);
        appointmentDatetime = dt.toISOString();
        console.log(`[Webhook] Parsed time-only: ${hour}h${minute} Brussels → ${appointmentDatetime}`);
      }

      if (!appointmentDatetime) {
        console.log("[Webhook] Could not parse date from LLM response, using context date if available");
      }

      // Create appointment entry only if we have a valid datetime
      if (!appointmentDatetime) {
        console.log("[Webhook] SCHEDULING_REQUEST detected but no date could be parsed — skipping appointment creation");
      }
      const appointmentData: any = {
        lead_id: lead.id,
        type: scheduling.type === "call" ? "call" : "visit",
        datetime: appointmentDatetime || null,
        status: "scheduled",
        location: lead.location || lead.address || null,
        notes: `RDV confirmé via WhatsApp — ${lead.contact_name || lead.whatsapp_number || "Client"} (${lead.company_name || ""})`,
      };
      if (appointmentData.datetime) {
        const { data: insertedAppt, error: apptErr } = await supabaseAdmin.from("appointments").insert(appointmentData).select("id").single();
        if (apptErr) {
          console.error("[Webhook] Appointment insert error:", apptErr.message);
        } else {
          const realApptId = insertedAppt.id;
          console.log("[Webhook] Appointment created:", realApptId, "for lead", lead.id, "at", appointmentData.datetime);
          // Notify Telegram bot about the new appointment
          try {
            const telegramResp = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                appointment_id: realApptId,
                lead_name: lead.contact_name || lead.whatsapp_number || "",
                lead_phone: lead.whatsapp_number || "",
                appointment_type: appointmentData.type,
                appointment_datetime: appointmentData.datetime,
                location: appointmentData.location,
              }),
            });
            console.log("[Webhook] Telegram notify response:", telegramResp.status);
          } catch (tgErr) {
            console.error("[Webhook] Telegram notify error (non-blocking):", tgErr);
          }
        }
        // Also update lead appointment fields
        leadUpdates.appointment_datetime = appointmentData.datetime;
        leadUpdates.appointment_type = appointmentData.type;
      }
    }

    // Handle TRANSFER (parsed earlier, or auto-forced from LEAD_DATA)
    if (transferTo) {
      if (!tagsDetected.includes("TRANSFER") && !tagsDetected.includes("AUTO_TRANSFER")) {
        tagsDetected.push("TRANSFER");
      }
      leadUpdates.active_agent = transferTo;

      // Trigger immediate action from receiving agent (except emma who has her own flows)
      if (transferTo !== "emma") {
        console.log(`[Webhook] Transfer to ${transferTo} — triggering immediate action`);
        
        // Load new agent config
        const { data: newAgentConfig } = await supabaseAdmin
          .from("agent_configs")
          .select("*")
          .eq("agent_name", transferTo)
          .eq("is_active", true)
          .single();

        if (newAgentConfig) {
          // Update lead first so context is fresh
          leadUpdates.updated_at = new Date().toISOString();
          await supabaseAdmin.from("leads").update(leadUpdates).eq("id", lead.id);
          const updatedLead = { ...lead, ...leadUpdates };

          // Build context for new agent
          const { data: freshHistory } = await supabaseAdmin
            .from("conversations")
            .select("role, content")
            .eq("lead_id", lead.id)
            .order("created_at", { ascending: true })
            .limit(20);

          const npsCtx = updatedLead.nps_data ? `\n- NPS Data: score=${(updatedLead.nps_data as any).last_nps_score ?? "non évalué"}` : "";
          const newLeadCtx = `\n\nDONNÉES CONNUES SUR CE LEAD :\n- Nom: ${updatedLead.contact_name || "inconnu"}\n- Entreprise: ${updatedLead.company_name || "inconnue"}\n- Service demandé: ${updatedLead.service_requested || "non précisé"}\n- Localisation: ${updatedLead.location || "inconnue"}\n- Adresse: ${updatedLead.address || "non précisée"}\n- Surface: ${updatedLead.surface_area || "non précisée"}\n- Fréquence: ${updatedLead.frequency || "non précisée"}\n- Timeline: ${updatedLead.timeline || "non précisé"}\n- Score: ${updatedLead.score || "non évalué"}\n- Langue détectée: ${updatedLead.language || "fr"}${npsCtx}\n(Ne redemande pas les informations déjà connues.)`;

          const transferNow = new Date();
          const tDayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
          const tMonthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
          const tDateCtx = `\n\nDATE ACTUELLE : ${tDayNames[transferNow.getDay()]} ${transferNow.getDate()} ${tMonthNames[transferNow.getMonth()]} ${transferNow.getFullYear()}, ${transferNow.getHours()}h${String(transferNow.getMinutes()).padStart(2, "0")} (heure de Belgique).`;

          const newSystemPrompt = newAgentConfig.system_prompt + tDateCtx + newLeadCtx;

          const transferMessages = [
            { role: "system", content: newSystemPrompt },
            ...(freshHistory || []).map((m: any) => ({ role: m.role, content: m.content })),
            { role: "system", content: transferTo === "claire" 
              ? `Tu viens de reprendre ce lead suite à un transfert interne depuis la prospection. Le prospect est QUALIFIÉ et INTÉRESSÉ. Tu dois IMMÉDIATEMENT proposer un rendez-vous (visite ou appel). Propose 3 créneaux proches basés sur la date actuelle. Utilise [SCHEDULING_REQUEST:type=visit] dès que le client confirme un créneau. Le client ne doit PAS savoir qu'il y a eu un transfert — continue naturellement comme si tu faisais partie de la même équipe.`
              : `Tu viens de reprendre ce lead suite à un transfert interne. Envoie ton premier message maintenant — présente-toi et continue le processus naturellement selon ton rôle. Le client ne doit PAS savoir qu'il y a eu un transfert.` },
          ];

          const transferLlmResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              temperature: newAgentConfig.temperature ?? 0.3,
              max_tokens: newAgentConfig.max_tokens ?? 500,
              messages: transferMessages,
            }),
          });

          if (transferLlmResp.ok) {
            const transferData = await transferLlmResp.json();
            const transferRaw = transferData.choices?.[0]?.message?.content || "";
            const transferFallback = getFallbackReply(updatedLead.language || lead.language);
            const transferResolved = resolveSafeAssistantMessage(transferRaw, transferFallback);

            // Parse any tags from the new agent's response too
            const newLeadData = parseLeadData(transferRaw);
            if (Object.keys(newLeadData).length > 0) {
              await supabaseAdmin.from("leads").update({ ...newLeadData, updated_at: new Date().toISOString() }).eq("id", lead.id);
            }

            const newScheduling = parseSchedulingRequest(transferRaw);
            if (newScheduling) {
              // Handle scheduling from new agent
              const schedUpdates: any = { status: "scheduled" };
              if (newScheduling.score) schedUpdates.score = newScheduling.score;
              await supabaseAdmin.from("leads").update({ ...schedUpdates, updated_at: new Date().toISOString() }).eq("id", lead.id);
            }

            // Save new agent's message
            await supabaseAdmin.from("conversations").insert({
              lead_id: lead.id,
              role: "assistant",
              content: transferResolved.message,
              agent: transferTo,
              metadata: {
                raw_response: transferRaw,
                transfer_activation: true,
                parse_source: transferResolved.parseSource,
                fallback_used: transferResolved.usedFallback,
              },
            });

            // Send via WhatsApp
            await sendWhatsApp(whatsappNumber, transferResolved.message);
            console.log(`[Webhook] Transfer agent ${transferTo} sent immediate message (${transferResolved.parseSource})`);
            transferHandled = true;
          } else {
            console.error(`[Webhook] Transfer LLM call failed:`, transferLlmResp.status);
          }

          // Clear leadUpdates that were already applied to avoid double-update
          Object.keys(leadUpdates).forEach(k => delete leadUpdates[k]);
        }
      }
    }

    // Parse ESCALADE
    if (rawResponse.includes("[ESCALADE]")) {
      tagsDetected.push("ESCALADE");
      await sendEscalation(supabaseAdmin, lead, messageText);
    }

    // Auto-score based on lead data + conversation content
    if (!leadUpdates.score) {
      const recentMessages = (history || []).slice(-4).map((m: any) => m.content).join(" ") + " " + messageText;
      const auto = autoScore({ ...lead, ...leadUpdates }, recentMessages);
      if (auto && auto !== lead.score) leadUpdates.score = auto;
    }

    // Update lead
    if (Object.keys(leadUpdates).length > 0) {
      leadUpdates.updated_at = new Date().toISOString();
      await supabaseAdmin.from("leads").update(leadUpdates).eq("id", lead.id);
      console.log("[Webhook] Lead updated:", Object.keys(leadUpdates));
    }

    // Step 7: Clean and save response (skip if transfer already handled)
    let sent = false;
    if (!transferHandled) {
      const fallbackMessage = getFallbackReply(lead.language);
      const resolved = resolveSafeAssistantMessage(rawResponse, fallbackMessage);

      await supabaseAdmin.from("conversations").insert({
        lead_id: lead.id,
        role: "assistant",
        content: resolved.message,
        agent: lead.active_agent,
        metadata: {
          raw_response: rawResponse,
          tags_detected: tagsDetected,
          parse_source: resolved.parseSource,
          fallback_used: resolved.usedFallback,
        },
      });

      // Step 8: Send via WhatsApp
      sent = await sendWhatsApp(whatsappNumber, resolved.message);
      console.log(`[Webhook] WhatsApp send: ${sent ? "OK" : "NOT_CONFIGURED"} (${resolved.parseSource})`);
    } else {
      console.log("[Webhook] Skipping original agent response — transfer already sent");
      sent = true; // transfer message was already sent
    }

    // Step 9: Create followups if applicable (only once per lead)
    const messageCount = (history || []).filter((m: any) => m.role === "user").length;
    if (messageCount >= 2 && lead.status !== "new") {
      // Check ALL follow-ups (any status) to prevent duplicates
      const { data: existingFollowups } = await supabaseAdmin
        .from("followups")
        .select("id, status")
        .eq("lead_id", lead.id);

      const hasAnyFollowups = existingFollowups && existingFollowups.length > 0;
      
      if (!hasAnyFollowups) {
        const lang = (lead.language || "fr") as string;
        const msgs = FOLLOWUP_MESSAGES[lang] || FOLLOWUP_MESSAGES.fr;
        const now = Date.now();
        const followups = [
          { lead_id: lead.id, step: 1, scheduled_at: new Date(now + 24 * 3600 * 1000).toISOString(), message: msgs[0], status: "pending" as const },
          { lead_id: lead.id, step: 2, scheduled_at: new Date(now + 72 * 3600 * 1000).toISOString(), message: msgs[1], status: "pending" as const },
          { lead_id: lead.id, step: 3, scheduled_at: new Date(now + 7 * 24 * 3600 * 1000).toISOString(), message: msgs[2], status: "pending" as const },
        ];
        await supabaseAdmin.from("followups").insert(followups);
        console.log("[Webhook] Follow-ups created for lead", lead.id);
      } else {
        // Cancel pending follow-ups when lead responds (they're engaging)
        const pendingIds = (existingFollowups || []).filter((f: any) => f.status === "pending").map((f: any) => f.id);
        if (pendingIds.length > 0) {
          await supabaseAdmin.from("followups").update({ status: "cancelled" }).in("id", pendingIds);
          console.log("[Webhook] Cancelled", pendingIds.length, "pending follow-ups (lead responded)");
        }
      }
    }

    return new Response(JSON.stringify({ status: "ok", lead_id: lead.id, tags: tagsDetected, whatsapp_sent: sent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Critical error:", error);
    // Always return 200 to prevent Evolution API retries
    return new Response(JSON.stringify({ status: "error", message: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
