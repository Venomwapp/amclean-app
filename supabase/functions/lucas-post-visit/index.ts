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
    console.log("[Lucas-PostVisit] Evolution API not configured — message NOT sent to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Lucas-PostVisit] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Lucas-PostVisit] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Verify user is admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Not admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, lead_id, appointment_id } = await req.json();

    // === ACTION: post_visit — Lucas sends post-visit message ===
    if (action === "post_visit") {
      if (!lead_id) {
        return new Response(JSON.stringify({ error: "Missing lead_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get lead data
      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", lead_id).single();
      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Transfer lead to Lucas
      await supabaseAdmin.from("leads").update({
        active_agent: "lucas",
        updated_at: new Date().toISOString(),
      }).eq("id", lead_id);

      // Load Lucas config
      const { data: lucasConfig } = await supabaseAdmin
        .from("agent_configs")
        .select("*")
        .eq("agent_name", "lucas")
        .eq("is_active", true)
        .single();

      if (!lucasConfig || !geminiApiKey) {
        console.error("[Lucas-PostVisit] Lucas config or API key missing");
        return new Response(JSON.stringify({ error: "Lucas config not found" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load conversation history
      const { data: history } = await supabaseAdmin
        .from("conversations")
        .select("role, content")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: true })
        .limit(20);

      // Build context
      const lang = lead.language || "fr";
      const langNames: Record<string, string> = { fr: "français", nl: "néerlandais", en: "anglais", pt: "português" };
      const langName = langNames[lang] || "français";

      const now = new Date();
      const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const monthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      const dateContext = `\n\nDATE ACTUELLE : ${dayNames[now.getDay()]} ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}, ${now.getHours()}h${String(now.getMinutes()).padStart(2, "0")} (heure de Belgique).`;

      const leadContext = `\n\nDONNÉES CONNUES SUR CE LEAD :
- Nom: ${lead.contact_name || "inconnu"}
- Entreprise: ${lead.company_name || "inconnue"}
- Service demandé: ${lead.service_requested || "non précisé"}
- Localisation: ${lead.location || "inconnue"}
- Adresse: ${lead.address || "non précisée"}
- Surface: ${lead.surface_area || "non précisée"}
- Fréquence: ${lead.frequency || "non précisée"}
- Type d'espace: ${lead.space_type || "non précisé"}
- Score: ${lead.score || "non évalué"}
- Langue: ${langName}
(Ne redemande pas les informations déjà connues.)`;

      const postVisitInstructions: Record<string, string> = {
        fr: `\n\nCONTEXTE SPÉCIAL : La visite avec Meyri (la fondatrice) vient d'être COMPLÉTÉE. Tu dois maintenant :
1. Remercier le lead pour le temps accordé lors de la visite.
2. Confirmer les détails de la prestation discutée (type de service, fréquence, particularités).
3. Informer que la proposition formelle sera envoyée dans un délai de 24 à 48 heures.
4. Demander s'il y a des questions sur le processus.
5. NE JAMAIS mentionner de prix.
Langue du message : ${langName}`,
        pt: `\n\nCONTEXTO ESPECIAL : A visita com a Meyri (fundadora) acaba de ser CONCLUÍDA. Deves agora:
1. Agradecer ao lead pelo tempo dedicado durante a visita.
2. Confirmar os detalhes da prestação discutida (tipo de serviço, frequência, particularidades).
3. Informar que a proposta formal será enviada num prazo de 24 a 48 horas.
4. Perguntar se há dúvidas sobre o processo.
5. NUNCA mencionar preços.
Idioma da mensagem : ${langName}`,
        nl: `\n\nSPECIALE CONTEXT : Het bezoek met Meyri (oprichter) is zojuist VOLTOOID. Je moet nu:
1. De lead bedanken voor de tijd tijdens het bezoek.
2. De details van de besproken dienst bevestigen (type dienst, frequentie, bijzonderheden).
3. Meedelen dat het formele voorstel binnen 24 tot 48 uur wordt verzonden.
4. Vragen of er vragen zijn over het proces.
5. NOOIT prijzen vermelden.
Taal van het bericht : ${langName}`,
        en: `\n\nSPECIAL CONTEXT : The visit with Meyri (founder) has just been COMPLETED. You must now:
1. Thank the lead for their time during the visit.
2. Confirm the service details discussed (type of service, frequency, specifics).
3. Inform that the formal proposal will be sent within 24 to 48 hours.
4. Ask if there are any questions about the process.
5. NEVER mention prices.
Message language : ${langName}`,
      };

      const systemPrompt = lucasConfig.system_prompt + dateContext + leadContext + (postVisitInstructions[lang] || postVisitInstructions.fr);

      const generatePrompts: Record<string, string> = {
        fr: "Génère le message post-visite pour ce lead. Réponds UNIQUEMENT avec le message à envoyer.",
        pt: "Gere a mensagem pós-visita para este lead. Responda APENAS com a mensagem a enviar.",
        nl: "Genereer het post-bezoek bericht voor deze lead. Antwoord ALLEEN met het te verzenden bericht.",
        en: "Generate the post-visit message for this lead. Reply ONLY with the message to send.",
      };

      const llmMessages = [
        { role: "system", content: systemPrompt },
        ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: generatePrompts[lang] || generatePrompts.fr },
      ];

      const llmResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          temperature: lucasConfig.temperature ?? 0.3,
          max_tokens: lucasConfig.max_tokens ?? 500,
          messages: llmMessages,
        }),
      });

      if (!llmResponse.ok) {
        const errText = await llmResponse.text();
        console.error("[Lucas-PostVisit] LLM error:", llmResponse.status, errText);
        return new Response(JSON.stringify({ error: "LLM error" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const llmData = await llmResponse.json();
      let message = (llmData.choices?.[0]?.message?.content || "").trim();

      // Clean tags
      message = message
        .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
        .replace(/\[TRANSFER:[^\]]*\]/g, "")
        .replace(/\[ESCALADE\]/g, "")
        .replace(/\[SCHEDULING_REQUEST:[^\]]*\]/g, "")
        .replace(/^["']|["']$/g, "")
        .trim();

      if (!message || message.length < 10) {
        return new Response(JSON.stringify({ error: "Empty message generated" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send via WhatsApp
      const sent = lead.whatsapp_number ? await sendWhatsApp(lead.whatsapp_number, message) : false;

      // Save conversation
      await supabaseAdmin.from("conversations").insert({
        lead_id,
        role: "assistant",
        content: message,
        agent: "lucas",
        metadata: { post_visit: true, auto_triggered: true },
      });

      // Log activity
      await supabaseAdmin.from("activity_log").insert({
        type: "post_visit",
        title: `Lucas → ${lead.contact_name || lead.company_name || "Lead"}`,
        description: `Message pós-visita enviada | ${sent ? "✅ WhatsApp" : "⚠️ WhatsApp indisponível"}`,
        metadata: { lead_id, whatsapp_sent: sent },
      });

      console.log(`[Lucas-PostVisit] Done — ${lead.contact_name || lead.company_name}, WhatsApp: ${sent}`);

      return new Response(JSON.stringify({ status: "ok", whatsapp_sent: sent, message_preview: message.substring(0, 100) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: confirm_proposal — Transfer lead from Lucas back to Claire ===
    if (action === "confirm_proposal") {
      if (!lead_id) {
        return new Response(JSON.stringify({ error: "Missing lead_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", lead_id).single();
      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update lead: transfer to Claire for follow-up closure
      await supabaseAdmin.from("leads").update({
        active_agent: "claire",
        status: "followup_1",
        updated_at: new Date().toISOString(),
      }).eq("id", lead_id);

      // Save system note
      await supabaseAdmin.from("conversations").insert({
        lead_id,
        role: "system",
        content: "📄 Proposta enviada. Lead transferido para Claire para follow-up de fechamento.",
        agent: "lucas",
        metadata: { proposal_confirmed: true },
      });

      // Log activity
      await supabaseAdmin.from("activity_log").insert({
        type: "proposal_confirmed",
        title: `Proposta confirmada — ${lead.contact_name || lead.company_name || "Lead"}`,
        description: "Lead transferido de Lucas → Claire para follow-up de fechamento",
        metadata: { lead_id },
      });

      // Trigger Claire's follow-up message
      if (lead.whatsapp_number && geminiApiKey) {
        const { data: claireConfig } = await supabaseAdmin
          .from("agent_configs")
          .select("*")
          .eq("agent_name", "claire")
          .eq("is_active", true)
          .single();

        if (claireConfig) {
          const lang = lead.language || "fr";
          const followupPrompts: Record<string, string> = {
            fr: `Le lead ${lead.contact_name || ""} vient de recevoir sa proposition commerciale. Envoie un message de suivi professionnel pour : 1) Confirmer que la proposition a été envoyée, 2) Demander s'il a des questions, 3) Proposer un prochain pas (signature, ajustements). NE mentionne JAMAIS de prix. Réponds UNIQUEMENT avec le message.`,
            pt: `O lead ${lead.contact_name || ""} acabou de receber a proposta comercial. Envia uma mensagem de follow-up profissional para: 1) Confirmar que a proposta foi enviada, 2) Perguntar se há dúvidas, 3) Propor um próximo passo (assinatura, ajustes). NUNCA mencione preços. Responde APENAS com a mensagem.`,
            nl: `Lead ${lead.contact_name || ""} heeft zojuist het commercieel voorstel ontvangen. Stuur een professioneel follow-up bericht om: 1) Te bevestigen dat het voorstel is verzonden, 2) Te vragen of er vragen zijn, 3) Een volgende stap voor te stellen. Vermeld NOOIT prijzen. Antwoord ALLEEN met het bericht.`,
            en: `Lead ${lead.contact_name || ""} just received the commercial proposal. Send a professional follow-up message to: 1) Confirm the proposal was sent, 2) Ask if there are questions, 3) Suggest a next step. NEVER mention prices. Reply ONLY with the message.`,
          };

          const { data: history } = await supabaseAdmin
            .from("conversations")
            .select("role, content")
            .eq("lead_id", lead_id)
            .order("created_at", { ascending: true })
            .limit(20);

          const llmResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geminiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
              temperature: claireConfig.temperature ?? 0.3,
              max_tokens: 300,
              messages: [
                { role: "system", content: claireConfig.system_prompt },
                ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
                { role: "user", content: followupPrompts[lang] || followupPrompts.fr },
              ],
            }),
          });

          if (llmResp.ok) {
            const data = await llmResp.json();
            let claireMsg = (data.choices?.[0]?.message?.content || "").trim()
              .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
              .replace(/\[TRANSFER:[^\]]*\]/g, "")
              .replace(/\[ESCALADE\]/g, "")
              .replace(/\[SCHEDULING_REQUEST:[^\]]*\]/g, "")
              .replace(/^["']|["']$/g, "")
              .trim();

            if (claireMsg && claireMsg.length > 10) {
              await sendWhatsApp(lead.whatsapp_number, claireMsg);
              await supabaseAdmin.from("conversations").insert({
                lead_id,
                role: "assistant",
                content: claireMsg,
                agent: "claire",
                metadata: { post_proposal_followup: true },
              });
            }
          } else {
            await llmResp.text();
          }
        }
      }

      return new Response(JSON.stringify({ status: "ok", transferred_to: "claire" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Lucas-PostVisit] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});