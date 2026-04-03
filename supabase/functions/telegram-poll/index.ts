import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API_BASE = "https://api.telegram.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");

  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is not configured");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Webhook mode: Telegram sends the update directly as POST body
    const update = await req.json();
    console.log("[telegram-webhook] Update received:", JSON.stringify(update).substring(0, 200));

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, supabase, GEMINI_API_KEY, TELEGRAM_API_KEY, TELEGRAM_CHAT_ID);
      // Answer callback to remove loading state
      await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_API_KEY}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: update.callback_query.id }),
      });
    } else if (update.message) {
      await handleMessage(update.message, supabase, GEMINI_API_KEY, TELEGRAM_API_KEY, TELEGRAM_CHAT_ID);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[telegram-webhook] Error:", err);
    // Always return 200 to Telegram to avoid retries
    return new Response(JSON.stringify({ ok: true, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Handle callback queries (button presses) ──

async function handleCallbackQuery(
  cbq: any,
  supabase: any,
  geminiKey: string,
  telegramKey: string,
  chatId: string,
) {
  const data = cbq.data as string;
  console.log("[telegram-webhook] Callback:", data);

  if (data.startsWith("visit_done:")) {
    const appointmentId = data.replace("visit_done:", "");
    await handleVisitDone(appointmentId, cbq, supabase, geminiKey, telegramKey, chatId);
  } else if (data.startsWith("visit_cancel:")) {
    const appointmentId = data.replace("visit_cancel:", "");
    await handleVisitCancel(appointmentId, cbq, supabase, geminiKey, telegramKey, chatId);
  } else if (data.startsWith("quote_yes:")) {
    const appointmentId = data.replace("quote_yes:", "");
    await handleQuoteYes(appointmentId, supabase, geminiKey, telegramKey, chatId);
  } else if (data.startsWith("quote_no:")) {
    await sendTelegram(telegramKey, chatId, "👍 OK, sem orçamento para esta visita.");
  } else if (data.startsWith("quote_confirm:")) {
    const quoteId = data.replace("quote_confirm:", "");
    await handleQuoteConfirm(quoteId, supabase, geminiKey, telegramKey, chatId);
  } else if (data.startsWith("quote_edit:")) {
    const quoteId = data.replace("quote_edit:", "");
    await supabase.from("quotes").update({ telegram_state: "awaiting_edit", updated_at: new Date().toISOString() }).eq("id", quoteId);
    await sendTelegram(telegramKey, chatId, "✏️ O que deve ser alterado no orçamento? Envie uma mensagem de texto ou áudio.");
  } else if (data.startsWith("payment_yes:")) {
    const leadId = data.replace("payment_yes:", "");
    await handlePaymentYes(leadId, cbq, supabase, telegramKey, chatId);
  } else if (data.startsWith("payment_no:")) {
    const leadId = data.replace("payment_no:", "");
    await handlePaymentNo(leadId, cbq, supabase, telegramKey, chatId);
  }
}

// ── Handle text/audio messages (for quote data input) ──

async function handleMessage(
  msg: any,
  supabase: any,
  geminiKey: string,
  telegramKey: string,
  chatId: string,
) {
  const msgText = (msg.text || "").toLowerCase();

  // Report commands — check if message is a question/report request
  const isReport = msgText.includes("lead") || msgText.includes("fechado") || msgText.includes("valor") ||
    msgText.includes("confirmaram") || msgText.includes("pendente") || msgText.includes("quantos") ||
    msgText.includes("total") || msgText.includes("proposta") || msgText.includes("convertido") ||
    msgText.includes("mes") || msgText.includes("mês") || msgText.includes("hoje") || msgText.includes("semana");

  if (isReport) {
    const now = new Date();
    const brusselsDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);

    // Leads sem confirmação / pendentes
    if (msgText.includes("nao confirmaram") || msgText.includes("não confirmaram") || msgText.includes("pendente") ||
        msgText.includes("nao pagaram") || msgText.includes("não pagaram")) {
      const { data: pending, count } = await supabase
        .from("leads")
        .select("contact_name, company_name, status", { count: "exact" })
        .in("status", ["followup_1", "followup_2", "followup_3", "qualifying", "scheduled"]);
      let text = `📊 <b>Leads sem confirmação de pagamento:</b> ${count || 0}\n\n`;
      for (const l of (pending || []).slice(0, 15)) {
        text += `• ${l.contact_name || l.company_name || "—"} (${l.status})\n`;
      }
      if ((count || 0) > 15) text += `\n... e mais ${(count || 0) - 15}`;
      await sendTelegram(telegramKey, chatId, text);
      return;
    }

    // Fechados/convertidos HOJE
    if (msgText.includes("hoje")) {
      const { data: converted, count } = await supabase
        .from("leads")
        .select("contact_name, company_name", { count: "exact" })
        .eq("status", "converted")
        .gte("updated_at", `${brusselsDate}T00:00:00+00:00`)
        .lte("updated_at", `${brusselsDate}T23:59:59+00:00`);
      let text = `📊 <b>Leads fechados hoje:</b> ${count || 0}\n\n`;
      for (const l of (converted || []).slice(0, 15)) {
        text += `• ${l.contact_name || l.company_name || "—"}\n`;
      }
      await sendTelegram(telegramKey, chatId, text);
      return;
    }

    // Fechados/valor ESTE MÊS
    if (msgText.includes("mes") || msgText.includes("mês") || msgText.includes("mensal")) {
      const monthStart = `${brusselsDate.substring(0, 7)}-01T00:00:00+00:00`;
      const { data: converted, count } = await supabase
        .from("leads")
        .select("contact_name, company_name", { count: "exact" })
        .eq("status", "converted")
        .gte("updated_at", monthStart);

      // Get total quotes value this month
      const { data: quotes } = await supabase
        .from("quotes")
        .select("total_amount")
        .eq("status", "confirmed")
        .gte("updated_at", monthStart);
      const totalValue = (quotes || []).reduce((sum: number, q: any) => sum + (q.total_amount || 0), 0);

      let text = `📊 <b>Resumo do mês:</b>\n\n`;
      text += `✅ Leads fechados: ${count || 0}\n`;
      text += `💰 Valor total: €${totalValue.toFixed(2)}\n\n`;
      for (const l of (converted || []).slice(0, 15)) {
        text += `• ${l.contact_name || l.company_name || "—"}\n`;
      }
      await sendTelegram(telegramKey, chatId, text);
      return;
    }

    // Fechados ESTA SEMANA
    if (msgText.includes("semana")) {
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const { data: converted, count } = await supabase
        .from("leads")
        .select("contact_name, company_name", { count: "exact" })
        .eq("status", "converted")
        .gte("updated_at", weekAgo);
      let text = `📊 <b>Leads fechados esta semana:</b> ${count || 0}\n\n`;
      for (const l of (converted || []).slice(0, 15)) {
        text += `• ${l.contact_name || l.company_name || "—"}\n`;
      }
      await sendTelegram(telegramKey, chatId, text);
      return;
    }

    // Generic: total leads / propostas
    if (msgText.includes("total") || msgText.includes("quantos") || msgText.includes("lead")) {
      const { count: totalLeads } = await supabase.from("leads").select("id", { count: "exact", head: true });
      const { count: newLeads } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new");
      const { count: qualifying } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "qualifying");
      const { count: converted } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted");
      const text = `📊 <b>Resumo de leads:</b>\n\n` +
        `📋 Total: ${totalLeads || 0}\n` +
        `🆕 Novos: ${newLeads || 0}\n` +
        `🔄 Em qualificação: ${qualifying || 0}\n` +
        `✅ Convertidos: ${converted || 0}`;
      await sendTelegram(telegramKey, chatId, text);
      return;
    }
  }

  const { data: pendingQuote } = await supabase
    .from("quotes")
    .select("*")
    .in("telegram_state", ["awaiting_data", "awaiting_edit"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!pendingQuote) return;

  let inputText = msg.text || "";

  if (msg.voice || msg.audio) {
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    inputText = await transcribeAudioFromTelegram(fileId, geminiKey, telegramKey);
    if (!inputText) {
      await sendTelegram(telegramKey, chatId, "⚠️ Não foi possível transcrever o áudio. Tente novamente ou envie texto.");
      return;
    }
  }

  if (!inputText) return;

  if (pendingQuote.telegram_state === "awaiting_data") {
    const quoteData = await generateQuoteFromText(inputText, geminiKey);
    await supabase.from("quotes").update({
      description: quoteData.description,
      total_amount: quoteData.total,
      items: quoteData.items,
      raw_audio_text: inputText,
      telegram_state: "draft",
      status: "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", pendingQuote.id);

    const preview = formatQuotePreview(quoteData);
    await sendTelegram(telegramKey, chatId, `📋 <b>Orçamento Gerado:</b>\n\n${preview}`, {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: `quote_confirm:${pendingQuote.id}` },
          { text: "✏️ Editar", callback_data: `quote_edit:${pendingQuote.id}` },
        ],
      ],
    });
  } else if (pendingQuote.telegram_state === "awaiting_edit") {
    const quoteData = await editQuoteFromText(pendingQuote, inputText, geminiKey);
    await supabase.from("quotes").update({
      description: quoteData.description,
      total_amount: quoteData.total,
      items: quoteData.items,
      telegram_state: "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", pendingQuote.id);

    const preview = formatQuotePreview(quoteData);
    await sendTelegram(telegramKey, chatId, `📋 <b>Orçamento Atualizado:</b>\n\n${preview}`, {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: `quote_confirm:${pendingQuote.id}` },
          { text: "✏️ Editar", callback_data: `quote_edit:${pendingQuote.id}` },
        ],
      ],
    });
  }
}

// ── Flow handlers ──

async function handleVisitDone(appointmentId: string, cbq: any, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
  await supabase.from("appointments").update({ status: "completed" }).eq("id", appointmentId);

  const { data: appt } = await supabase.from("appointments").select("lead_id").eq("id", appointmentId).maybeSingle();
  if (appt?.lead_id) {
    await supabase.from("leads").update({ active_agent: "lucas", updated_at: new Date().toISOString() }).eq("id", appt.lead_id);
  }

  if (cbq.message?.message_id) {
    await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n✅ <b>Visita marcada como realizada</b>",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }),
    });
  }

  await sendTelegram(telegramKey, chatId, "📝 Gerar o orçamento para esta visita?", {
    inline_keyboard: [
      [
        { text: "✅ Sim", callback_data: `quote_yes:${appointmentId}` },
        { text: "❌ Não", callback_data: `quote_no:${appointmentId}` },
      ],
    ],
  });
}

async function handleVisitCancel(appointmentId: string, cbq: any, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
  await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);

  if (cbq.message?.message_id) {
    await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n❌ <b>Visita cancelada</b>",
        reply_markup: { inline_keyboard: [] },
        parse_mode: "HTML",
      }),
    });
  }
}

async function handleQuoteYes(appointmentId: string, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
  console.log(`[telegram-webhook] handleQuoteYes: appointmentId=${appointmentId}`);

  // Create quote without appointment_id first (safe)
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      status: "pending",
      telegram_state: "awaiting_data",
    })
    .select()
    .single();

  if (error) {
    console.error("[telegram-webhook] Quote insert error:", JSON.stringify(error));
    await sendTelegram(telegramKey, chatId, "⚠️ Erro ao criar orçamento: " + error.message);
    return;
  }

  // Link appointment and lead if appointment exists
  try {
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, lead_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (appt) {
      await supabase.from("quotes").update({
        appointment_id: appt.id,
        lead_id: appt.lead_id,
      }).eq("id", quote.id);
    }
  } catch (e) {
    console.log("[telegram-webhook] Could not link appointment:", e);
  }

  await sendTelegram(telegramKey, chatId, "🎤 Me informe os dados do orçamento.\n\nEnvie um <b>áudio</b> ou <b>texto</b> com a descrição dos serviços e valores.");
}

async function handleQuoteConfirm(quoteId: string, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
  await supabase.from("quotes").update({
    status: "confirmed",
    telegram_state: "confirmed",
    updated_at: new Date().toISOString(),
  }).eq("id", quoteId);

  await sendTelegram(telegramKey, chatId, "⏳ A gerar a proposta...");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-quote-pdf`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quote_id: quoteId }),
    });

    const pdfText = await pdfResp.text();
    let pdfResult: any;
    try { pdfResult = JSON.parse(pdfText); } catch {
      await sendTelegram(telegramKey, chatId, "⚠️ Erro ao gerar proposta (resposta inválida).");
      return;
    }

    if (pdfResult.ok && pdfResult.url) {
      await sendTelegram(telegramKey, chatId,
        `📄 <b>Proposta gerada!</b>\n\n🔗 <a href="${pdfResult.url}">Ver proposta</a>`
      );

      const { data: quoteData } = await supabase.from("quotes").select("*, leads(*)").eq("id", quoteId).single();
      const lead = quoteData?.leads;

      if (lead?.whatsapp_number) {
        const lang = lead.language || "fr";
        const isFr = lang === "fr" || lang === "nl";
        const whatsappMsg = isFr
          ? `Bonjour${lead.contact_name ? " " + lead.contact_name : ""} ! 😊\n\nVotre proposition commerciale AM Clean est prête.\n\n📄 Consultez-la ici :\n${pdfResult.url}\n\nSi vous avez des questions, n'hésitez pas à nous contacter.\n\n— AM Clean`
          : `Olá${lead.contact_name ? " " + lead.contact_name : ""} ! 😊\n\nA sua proposta comercial AM Clean está pronta.\n\n📄 Consulte aqui:\n${pdfResult.url}\n\nSe tiver dúvidas, entre em contacto connosco.\n\n— AM Clean`;

        const waSent = await sendWhatsAppEvolution(whatsappMsg, lead.whatsapp_number);
        await sendTelegram(telegramKey, chatId, waSent
          ? "✅ Proposta enviada ao cliente pelo WhatsApp!"
          : "⚠️ WhatsApp não configurado. Proposta não enviada por WhatsApp."
        );
      }

      if (lead?.email) {
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-quote-email`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ quote_id: quoteId }),
        });
        try {
          const emailResult = JSON.parse(await emailResp.text());
          if (emailResult.ok) {
            await sendTelegram(telegramKey, chatId, "✉️ Email enviado ao cliente com a proposta!");
          }
        } catch {}
      }

      const leadId = quoteData?.lead_id;
      const leadName = lead?.contact_name || lead?.company_name || "Cliente";

      // Ask about payment confirmation instead of auto-transferring
      await sendTelegram(telegramKey, chatId, `💰 <b>Proposta enviada para ${leadName}.</b>\n\nO cliente confirmou o pagamento?`, {
        inline_keyboard: [[
          { text: "✅ Sim, pago", callback_data: `payment_yes:${leadId}` },
          { text: "❌ Não pagou", callback_data: `payment_no:${leadId}` },
        ]],
      });
    } else {
      await sendTelegram(telegramKey, chatId, "⚠️ Erro ao gerar proposta: " + (pdfResult.error || "erro desconhecido"));
    }
  } catch (err) {
    console.error("[telegram-webhook] Quote PDF/email error:", err);
    await sendTelegram(telegramKey, chatId, "⚠️ Erro ao processar proposta: " + (err as Error).message);
  }
}

async function handlePaymentYes(leadId: string, cbq: any, supabase: any, telegramKey: string, chatId: string) {
  // Remove buttons from payment message
  if (cbq.message?.message_id) {
    await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n✅ <b>Pagamento confirmado!</b>",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }),
    });
  }

  // Trigger Emma onboarding
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const emmaResp = await fetch(`${supabaseUrl}/functions/v1/emma-onboarding`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lead_id: leadId }),
    });

    const emmaResult = await emmaResp.json();
    if (emmaResult.status === "ok") {
      await sendTelegram(telegramKey, chatId, "🎉 <b>Emma ativada!</b> Mensagem de boas-vindas enviada ao cliente.");
    } else {
      await sendTelegram(telegramKey, chatId, "⚠️ Erro ao ativar Emma: " + (emmaResult.message || "erro desconhecido"));
    }
  } catch (e) {
    console.error("[telegram-webhook] Emma onboarding error:", e);
    await sendTelegram(telegramKey, chatId, "⚠️ Erro ao chamar Emma: " + String(e));
  }
}

async function handlePaymentNo(leadId: string, cbq: any, supabase: any, telegramKey: string, chatId: string) {
  // Remove buttons
  if (cbq.message?.message_id) {
    await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n❌ <b>Pagamento não confirmado</b>",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }),
    });
  }

  // Keep lead with Claire for follow-up
  await supabase.from("leads").update({
    active_agent: "claire",
    status: "followup_1",
    updated_at: new Date().toISOString(),
  }).eq("id", leadId);

  await sendTelegram(telegramKey, chatId, "📋 Lead mantido com Claire para follow-up de fechamento.");
}

// ── AI helpers ──

async function generateQuoteFromText(text: string, geminiKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${geminiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Tu és um assistente que gera orçamentos de serviços de limpeza profissional para a empresa AM Clean (Bélgica).

REGRAS IMPORTANTES:
- Usa EXATAMENTE os valores mencionados pelo utilizador. NÃO inventes valores por hora, NÃO calcules por hora.
- Se o utilizador diz "100 euros por semana, 4x por semana", o item é "Limpeza 4x/semana — €100/semana" e o total mensal é 100 x 4 semanas = €400.
- A moeda é SEMPRE euros (€), nunca reais ou outra moeda.
- O total deve ser o valor MENSAL (multiplicar semanal x 4 semanas).
- NÃO adiciones itens, horas, ou valores que o utilizador não mencionou.
- Se o utilizador menciona apenas o valor total, usa esse valor sem decompor.

Responde APENAS em JSON válido:
{"description": "Descrição geral", "items": [{"service": "nome do serviço", "details": "frequência e detalhes", "price": 400.00}], "total": 400.00}

O campo "price" de cada item e o "total" devem ser o valor MENSAL em euros.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  const respText = await response.text();
  if (!response.ok) return { description: text, total: 0, items: [] };

  try {
    const result = JSON.parse(respText);
    const content = result.choices?.[0]?.message?.content || "{}";
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: text, total: 0, items: [] };
  }
}

async function editQuoteFromText(currentQuote: any, editInstructions: string, geminiKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${geminiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Tu és um assistente que edita orçamentos de limpeza profissional para AM Clean (Bélgica).
Orçamento atual: ${JSON.stringify({ description: currentQuote.description, items: currentQuote.items, total: currentQuote.total_amount })}

REGRAS: Usa EXATAMENTE os valores do utilizador. NÃO inventes valores por hora. Moeda: euros (€). Total = valor MENSAL.
Aplica as alterações e responde APENAS em JSON: {"description": "...", "items": [{"service": "...", "details": "...", "price": 0}], "total": 0}`,
        },
        { role: "user", content: editInstructions },
      ],
      temperature: 0.3,
    }),
  });

  const respText = await response.text();
  if (!response.ok) return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };

  try {
    const result = JSON.parse(respText);
    const content = result.choices?.[0]?.message?.content || "{}";
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };
  }
}

async function transcribeAudioFromTelegram(fileId: string, geminiKey: string, telegramKey: string): Promise<string | null> {
  try {
    // 1. Get file path from Telegram
    const fileResp = await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });

    const fileData = await fileResp.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      console.error("[telegram-webhook] getFile failed:", JSON.stringify(fileData));
      return null;
    }

    // 2. Download audio file
    const audioResp = await fetch(`${TELEGRAM_API_BASE}/file/bot${telegramKey}/${fileData.result.file_path}`);
    if (!audioResp.ok) {
      console.error("[telegram-webhook] Audio download failed:", audioResp.status);
      return null;
    }

    const audioBuffer = await audioResp.arrayBuffer();
    const uint8 = new Uint8Array(audioBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // 3. Transcribe using Gemini native API (not OpenAI-compatible, which doesn't support audio)
    const transcribeResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Transcreve esta mensagem de áudio exatamente como foi falada. Responde APENAS com a transcrição, sem comentários." },
            { inlineData: { mimeType: "audio/ogg", data: base64Audio } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
      }),
    });

    const respText = await transcribeResp.text();
    if (!transcribeResp.ok) {
      console.error("[telegram-webhook] Gemini transcription error:", transcribeResp.status, respText.substring(0, 300));
      return null;
    }

    const result = JSON.parse(respText);
    const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log("[telegram-webhook] Transcription:", transcription?.substring(0, 100));
    return transcription || null;
  } catch (err) {
    console.error("[telegram-webhook] Audio transcription error:", err);
    return null;
  }
}

async function sendWhatsAppEvolution(text: string, number: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) return false;
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ number, text }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Utilities ──

function formatQuotePreview(quoteData: { description: string; items: any[]; total: number }): string {
  let text = `📝 ${quoteData.description}\n\n`;
  for (const item of quoteData.items || []) {
    text += `• <b>${item.service}</b>`;
    if (item.details) text += ` — ${item.details}`;
    text += ` — €${(item.price || 0).toFixed(2)}\n`;
  }
  text += `\n💰 <b>Total: €${(quoteData.total || 0).toFixed(2)}</b>`;
  return text;
}

async function sendTelegram(telegramKey: string, chatId: string, text: string, reply_markup?: any) {
  const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (reply_markup) body.reply_markup = reply_markup;

  const resp = await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error("[telegram-webhook] sendMessage error:", await resp.text());
  }
}
