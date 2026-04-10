import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: any = {};

  try {
    // Get Kedson lead
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("whatsapp_number", "5562993905945")
      .single();

    if (!lead) { results.error = "Lead not found"; return new Response(JSON.stringify(results)); }
    results.lead_id = lead.id;
    results.status_before = lead.status;

    // Load Claire config
    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("*")
      .eq("agent_name", "claire")
      .eq("is_active", true)
      .single();

    if (!agentConfig) throw new Error("No claire config");

    // Generate prospecting message
    const prompt = `
NOVO LEAD DE PROSPECÇÃO:
- Nome: ${lead.contact_name || "desconhecido"}
- Idioma: português

INSTRUÇÕES:
- Este é um contacto de PROSPECÇÃO (cold outreach). O lead NÃO nos contactou.
- Apresenta-te como Claire da AM Clean Belgium.
- Escreve UMA mensagem curta e profissional (2-3 frases).
- Mostra interesse genuíno no negócio deles.
- Pergunta se têm interesse em serviços de limpeza profissional.
- NÃO menciones preços. NÃO digas que viram o nosso site.
- Idioma: português
`;

    const llmResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${geminiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        temperature: 0.4,
        max_tokens: 512,
        messages: [
          { role: "system", content: agentConfig.system_prompt + prompt },
          { role: "user", content: "Gere a primeira mensagem de prospecção para este lead. Responda APENAS com a mensagem a enviar." },
        ],
      }),
    });

    const llmData = await llmResponse.json();
    let message = (llmData.choices?.[0]?.message?.content || "").trim()
      .replace(/\[LEAD_DATA:[^\]]*\]/g, "")
      .replace(/\[TRANSFER:[^\]]*\]/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    results.message = message;

    // Send via WhatsApp
    const evolUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolKey = Deno.env.get("EVOLUTION_API_KEY");
    const evolInst = Deno.env.get("EVOLUTION_INSTANCE_NAME");

    if (evolUrl && evolKey && evolInst) {
      const resp = await fetch(`${evolUrl}/message/sendText/${evolInst}`, {
        method: "POST",
        headers: { apikey: evolKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: lead.whatsapp_number, text: message }),
      });
      results.whatsapp = resp.ok ? "sent" : `error ${resp.status}`;
    }

    // Save conversation
    await supabase.from("conversations").insert({
      lead_id: lead.id,
      role: "assistant",
      content: message,
      agent: "claire",
      metadata: { prospecting: true, first_contact: true },
    });

    // Update status
    await supabase.from("leads").update({
      status: "qualifying",
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);

    results.status = "ok";
  } catch (e) {
    results.error = String(e);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
