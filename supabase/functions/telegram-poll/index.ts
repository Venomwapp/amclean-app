import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API_BASE = "https://api.telegram.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DB_SCHEMA = `
Tabelas disponíveis no banco de dados AM Clean (empresa de limpeza profissional na Bélgica):

1. leads - Clientes/potenciais clientes
   Colunas: id (uuid), whatsapp_number, contact_name, company_name, email, phone, language (default 'fr'), service_requested, space_type, surface_area, frequency, location, timeline, message, score (HOT/WARM/COLD), status (new/qualifying/scheduled/followup_1/followup_2/followup_3/converted/lost), appointment_type (visit/call), appointment_datetime, active_agent (claire/sophie/lucas/emma), source (default 'whatsapp'), notes, address, nps_data (jsonb), created_at, updated_at

2. appointments - Agendamentos de visitas/chamadas
   Colunas: id (uuid), lead_id (FK leads), type (visit/call), datetime, location, google_event_id, status (scheduled/confirmed/completed/cancelled/no_show), reminder_sent, notes, created_at

3. quotes - Orçamentos/propostas
   Colunas: id (uuid), lead_id (FK leads), appointment_id, status (pending/draft/confirmed), description, total_amount (numeric), items (jsonb), raw_audio_text, pdf_url, telegram_state, created_at, updated_at

4. conversations - Histórico de conversas com leads
   Colunas: id (uuid), lead_id (FK leads), role (user/assistant/system), content, agent (claire/sophie/lucas/emma), metadata (jsonb), created_at

5. followups - Follow-ups agendados
   Colunas: id (uuid), lead_id (FK leads), step (int), scheduled_at, sent_at, message, status (pending/sent/cancelled), created_at

6. prospecting_configs - Configurações de prospecção
   Colunas: id (uuid), niche, region (default 'Belgique'), search_query, is_active, max_leads_per_run (default 40), created_at, updated_at, last_run_at

7. prospecting_runs - Execuções de prospecção
   Colunas: id (uuid), config_id (FK prospecting_configs), status, leads_found, leads_qualified, error_message, started_at, completed_at

8. employees - Funcionários
   Colunas: id (uuid), name, phone, email, role (default 'cleaner'), is_active, color, notes, created_at, updated_at

9. client_sites - Locais dos clientes
   Colunas: id (uuid), lead_id (FK leads), name, address, city, contact_name, contact_phone, service_type, frequency, notes, is_active, created_at, updated_at

10. schedule_entries - Agenda de trabalho dos funcionários
    Colunas: id (uuid), employee_id (FK employees), client_site_id (FK client_sites), day_of_week (0-6), start_time, end_time, is_recurring, specific_date, status, notes, created_at, updated_at

11. invoices - Faturas
    Colunas: id (uuid), lead_id (FK leads), client_site_id (FK client_sites), invoice_number, amount, tax_rate (default 21), tax_amount, total, status (draft/...), due_date, paid_date, description, period_start, period_end, created_at, updated_at

12. activity_log - Log de atividades do sistema
    Colunas: id (uuid), type, title, description, metadata (jsonb), created_at

13. agent_configs - Configuração dos agentes IA
    Colunas: id (uuid), agent_name (claire/sophie/lucas/emma), display_name, system_prompt, is_active, temperature, max_tokens, updated_at

Agentes do sistema:
- Claire: Prospecção e primeiro contacto com leads
- Sophie: Agendamento de visitas/chamadas
- Lucas: Orçamentos e propostas comerciais
- Emma: Onboarding de clientes convertidos
`;

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

  const extraIds = (Deno.env.get("TELEGRAM_CHAT_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
  const allowedChatIds = [TELEGRAM_CHAT_ID, ...extraIds];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const update = await req.json();
    console.log("[telegram-webhook] Update received:", JSON.stringify(update).substring(0, 300));

    const incomingChatId = String(
      update.callback_query?.message?.chat?.id || update.message?.chat?.id || ""
    );

    if (!allowedChatIds.includes(incomingChatId)) {
      console.log(`[telegram-webhook] Unauthorized chat: ${incomingChatId}`);
      return new Response(JSON.stringify({ ok: true, skipped: "unauthorized_chat" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, supabase, GEMINI_API_KEY, TELEGRAM_API_KEY, incomingChatId);
      await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_API_KEY}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: update.callback_query.id }),
      });
    } else if (update.message) {
      await handleMessage(update.message, supabase, GEMINI_API_KEY, TELEGRAM_API_KEY, incomingChatId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[telegram-webhook] Error:", err);
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

// ── Handle messages — AI-powered with full DB access ──

async function handleMessage(
  msg: any,
  supabase: any,
  geminiKey: string,
  telegramKey: string,
  chatId: string,
) {
  // First check if there's a pending quote awaiting data
  const { data: pendingQuote } = await supabase
    .from("quotes")
    .select("*")
    .in("telegram_state", ["awaiting_data", "awaiting_edit"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  let inputText = msg.text || "";

  // Handle voice/audio transcription
  if (msg.voice || msg.audio) {
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    inputText = await transcribeAudioFromTelegram(fileId, geminiKey, telegramKey);
    if (!inputText) {
      await sendTelegram(telegramKey, chatId, "⚠️ Não foi possível transcrever o áudio. Tente novamente ou envie texto.");
      return;
    }
    await sendTelegram(telegramKey, chatId, `🎤 <i>Transcrição:</i> ${inputText}`);
  }

  if (!inputText) return;

  // Special intents — deterministic shortcuts before generic AI flow
  const intent = detectSpecialIntent(inputText);
  if (intent === "prospecting_report") {
    console.log("[telegram-webhook] Intent: prospecting_report");
    await handleProspectingReport(supabase, telegramKey, chatId);
    return;
  }
  if (intent === "quote_sample") {
    console.log("[telegram-webhook] Intent: quote_sample");
    await handleQuoteSample(telegramKey, chatId);
    return;
  }

  // If there's a pending quote, handle quote flow
  if (pendingQuote) {
    if (pendingQuote.telegram_state === "awaiting_data") {
      await handleQuoteData(pendingQuote, inputText, supabase, geminiKey, telegramKey, chatId);
      return;
    } else if (pendingQuote.telegram_state === "awaiting_edit") {
      await handleQuoteEdit(pendingQuote, inputText, supabase, geminiKey, telegramKey, chatId);
      return;
    }
  }

  // For all other messages: use AI to understand and query the database
  await handleAIQuery(inputText, supabase, geminiKey, telegramKey, chatId);
}

// ── Special intent detection ──

function detectSpecialIntent(text: string): "prospecting_report" | "quote_sample" | null {
  const t = text.toLowerCase();
  if (/modelo.*or[çc]amento|exemplo.*or[çc]amento|or[çc]amento.*modelo|or[çc]amento.*exemplo|como.*[ée].*or[çc]amento|template.*or[çc]amento|modelo.*proposta|exemplo.*proposta/i.test(t)) {
    return "quote_sample";
  }
  if (/documento.*prospec|relat[óo]rio.*prospec|status.*prospec|como.*est[áa].*prospec|o que.*estamos.*prospec|como.*vai.*prospec/i.test(t)) {
    return "prospecting_report";
  }
  return null;
}

// ── Prospecting report handler ──

async function handleProspectingReport(supabase: any, telegramKey: string, chatId: string) {
  // Start of today in Europe/Brussels timezone
  const now = new Date();
  const brusselsNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Brussels" }));
  const startOfToday = new Date(brusselsNow.getFullYear(), brusselsNow.getMonth(), brusselsNow.getDate()).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Active niche (next in rotation)
  const { data: activeConfig } = await supabase
    .from("prospecting_configs")
    .select("niche, region, max_leads_per_run, last_run_at")
    .eq("is_active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  // 2. Leads today (grouped by status)
  const { data: leadsToday } = await supabase
    .from("leads")
    .select("status")
    .eq("source", "prospecting")
    .gte("created_at", startOfToday);

  // 3. Leads last 7 days
  const { data: leadsWeek } = await supabase
    .from("leads")
    .select("id")
    .eq("source", "prospecting")
    .gte("created_at", sevenDaysAgo);

  // 4. Last 5 runs
  const { data: runs } = await supabase
    .from("prospecting_runs")
    .select("status, leads_found, leads_qualified, started_at, completed_at, prospecting_configs(niche)")
    .order("started_at", { ascending: false })
    .limit(5);

  // Aggregate leads today by status
  const statusCounts: Record<string, number> = {};
  for (const l of leadsToday || []) {
    const s = l.status || "unknown";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const totalToday = (leadsToday || []).length;
  const totalWeek = (leadsWeek || []).length;

  // Format message
  let msg = `📊 <b>Relatório de Prospecção</b>\n\n`;

  if (activeConfig) {
    msg += `🎯 <b>Foco atual:</b> ${activeConfig.niche} — ${activeConfig.region || "Belgique"}\n`;
    msg += `   Alvo diário: ${activeConfig.max_leads_per_run || 40} leads\n\n`;
  } else {
    msg += `🎯 <b>Foco atual:</b> <i>nenhuma config ativa</i>\n\n`;
  }

  msg += `📅 <b>Hoje:</b> ${totalToday} leads coletados\n`;
  if (totalToday > 0) {
    const parts: string[] = [];
    for (const [st, n] of Object.entries(statusCounts)) {
      parts.push(`• ${st}: ${n}`);
    }
    msg += `   ${parts.join("  ")}\n`;
  }
  msg += `\n📆 <b>Últimos 7 dias:</b> ${totalWeek} leads\n\n`;

  msg += `🔄 <b>Últimas 5 rodadas:</b>\n`;
  if (!runs || runs.length === 0) {
    msg += `<i>Nenhuma rodada registada.</i>`;
  } else {
    for (const r of runs) {
      const niche = r.prospecting_configs?.niche || "—";
      const found = r.leads_found ?? 0;
      const qualified = r.leads_qualified ?? 0;
      const when = r.started_at ? new Date(r.started_at).toLocaleDateString("pt-BR", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit" }) : "—";
      const statusEmoji = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
      msg += `${statusEmoji} ${niche} — ${qualified}/${found} (${when})\n`;
    }
  }

  await sendTelegram(telegramKey, chatId, msg);
}

// ── Quote sample handler ──

async function handleQuoteSample(telegramKey: string, chatId: string) {
  await sendTelegram(telegramKey, chatId, "⏳ A gerar o modelo de orçamento...");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/generate-quote-pdf`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sample: true, lang: "fr" }),
    });

    const result = await resp.json();
    if (result.ok && result.url) {
      await sendTelegramDocument(
        telegramKey,
        chatId,
        result.url,
        "📄 <b>Modelo de Orçamento AM Clean</b>\n\n<i>Este é um exemplo com dados fictícios para mostrar o formato da nossa proposta comercial.</i>",
      );
    } else {
      await sendTelegram(telegramKey, chatId, "⚠️ Erro ao gerar o modelo de orçamento: " + (result.error || "erro desconhecido"));
    }
  } catch (err) {
    console.error("[telegram-webhook] Quote sample error:", err);
    await sendTelegram(telegramKey, chatId, "⚠️ Erro ao gerar o modelo de orçamento: " + String(err));
  }
}

// ── AI-powered query handler ──

async function handleAIQuery(
  question: string,
  supabase: any,
  geminiKey: string,
  telegramKey: string,
  chatId: string,
) {
  // Step 1: Ask AI to generate Supabase queries based on the question
  const planResponse = await callGemini(geminiKey, [
    {
      role: "system",
      content: `Você é a assistente de gestão da AM Clean, uma empresa de limpeza profissional na Bélgica.
O usuário vai fazer perguntas sobre o negócio via Telegram. Você tem acesso ao banco de dados.

${DB_SCHEMA}

Sua tarefa é gerar as queries Supabase necessárias para responder à pergunta.
Responda APENAS em JSON válido com este formato:
{
  "queries": [
    {
      "table": "nome_da_tabela",
      "select": "colunas a selecionar (pode usar *, relações como leads(contact_name))",
      "filters": [{"column": "col", "op": "eq|gt|gte|lt|lte|in|like|ilike|neq|is", "value": "valor"}],
      "order": {"column": "col", "ascending": false},
      "limit": 20,
      "count": false
    }
  ],
  "intent": "breve descrição do que o utilizador quer saber"
}

REGRAS:
- Use timezone Europe/Brussels para datas. Hoje é ${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" })}.
- Para "este mês", use gte com o primeiro dia do mês atual.
- Para "hoje", use gte e lte com o dia atual.
- Para "esta semana", use gte com 7 dias atrás.
- Para "valor fechado", consulte quotes com status 'confirmed' e soma total_amount.
- Para informações sobre um cliente específico, busque em leads com ilike no contact_name ou company_name.
- Para conversas de um lead, busque em conversations com o lead_id.
- Para "prospecção" ou "nichos", consulte prospecting_configs.
- Você pode fazer múltiplas queries para cruzar dados.
- Se o count for true, retorna apenas a contagem.
- Se precisar somar valores, peça todos os registros e indique no intent que deve somar.
- Para relações, use a sintaxe do Supabase: "*, leads(contact_name, company_name)" para joins.
- Se a pergunta NÃO precisar de consulta ao banco (ex: "o que você pode fazer?", "olá", "ajuda"), retorne: {"queries": [], "intent": "resposta direta"} e a IA vai responder sem consultar o banco.`,
    },
    { role: "user", content: question },
  ], 0.1);

  if (!planResponse) {
    await sendTelegram(telegramKey, chatId, "⚠️ Não consegui processar a pergunta. Tenta novamente.");
    return;
  }

  let plan: any;
  try {
    const jsonMatch = planResponse.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, planResponse];
    plan = JSON.parse(jsonMatch[1]!.trim());
  } catch {
    // If AI didn't return valid JSON, just use it as a direct answer
    await sendTelegram(telegramKey, chatId, planResponse);
    return;
  }

  // Step 2: Execute the queries
  const results: any[] = [];
  for (const q of plan.queries || []) {
    try {
      let query = supabase.from(q.table).select(q.select || "*", q.count ? { count: "exact", head: true } : undefined);

      for (const f of q.filters || []) {
        if (f.op === "eq") query = query.eq(f.column, f.value);
        else if (f.op === "neq") query = query.neq(f.column, f.value);
        else if (f.op === "gt") query = query.gt(f.column, f.value);
        else if (f.op === "gte") query = query.gte(f.column, f.value);
        else if (f.op === "lt") query = query.lt(f.column, f.value);
        else if (f.op === "lte") query = query.lte(f.column, f.value);
        else if (f.op === "in") query = query.in(f.column, f.value);
        else if (f.op === "like") query = query.like(f.column, f.value);
        else if (f.op === "ilike") query = query.ilike(f.column, f.value);
        else if (f.op === "is") query = query.is(f.column, f.value === "null" ? null : f.value);
      }

      if (q.order) query = query.order(q.order.column, { ascending: q.order.ascending ?? false });
      if (q.limit) query = query.limit(q.limit);

      const { data, count, error } = await query;
      results.push({ table: q.table, data, count, error: error?.message });
    } catch (e) {
      results.push({ table: q.table, error: String(e) });
    }
  }

  // Step 3: Ask AI to format a nice response based on the data
  const answerResponse = await callGemini(geminiKey, [
    {
      role: "system",
      content: `Você é a assistente da AM Clean no Telegram. Português do Brasil, sempre.

REGRAS:
- Seja DIRETA. Nada de "Olá!", "Claro!", "Com certeza!". Vai direto na informação.
- Sem enrolação. Sem introduções. Sem despedidas. Só dados.
- HTML do Telegram: <b>, <i>, <code>.
- Valores em € (euros). Datas dd/mm/aaaa.
- Use APENAS os dados retornados. Nunca invente.
- Listas com •. Totais em <b>.
- Se não tem dados, diga "Sem resultados." e pronto.
- Se não precisou do banco, responda em 1-2 frases diretas.
- Emojis com moderação, só quando agrega.`,
    },
    {
      role: "user",
      content: `Pergunta do utilizador: "${question}"

Intent: ${plan.intent || "responder à pergunta"}

Dados do banco de dados:
${JSON.stringify(results, null, 2)}

Formata uma resposta bonita para o Telegram.`,
    },
  ], 0.3);

  if (answerResponse) {
    await sendTelegram(telegramKey, chatId, answerResponse);
  } else {
    await sendTelegram(telegramKey, chatId, "⚠️ Não consegui formatar a resposta. Tenta novamente.");
  }
}

// ── Quote flow handlers ──

async function handleQuoteData(pendingQuote: any, inputText: string, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
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
}

async function handleQuoteEdit(pendingQuote: any, inputText: string, supabase: any, geminiKey: string, telegramKey: string, chatId: string) {
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
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({ status: "pending", telegram_state: "awaiting_data" })
    .select()
    .single();

  if (error) {
    await sendTelegram(telegramKey, chatId, "⚠️ Erro ao criar orçamento: " + error.message);
    return;
  }

  try {
    const { data: appt } = await supabase.from("appointments").select("id, lead_id").eq("id", appointmentId).maybeSingle();
    if (appt) {
      await supabase.from("quotes").update({ appointment_id: appt.id, lead_id: appt.lead_id }).eq("id", quote.id);
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
      headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ quote_id: quoteId }),
    });

    const pdfText = await pdfResp.text();
    let pdfResult: any;
    try { pdfResult = JSON.parse(pdfText); } catch {
      await sendTelegram(telegramKey, chatId, "⚠️ Erro ao gerar proposta (resposta inválida).");
      return;
    }

    if (pdfResult.ok && pdfResult.url) {
      await sendTelegram(telegramKey, chatId, `📄 <b>Proposta gerada!</b>\n\n🔗 <a href="${pdfResult.url}">Ver proposta</a>`);

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const emmaResp = await fetch(`${supabaseUrl}/functions/v1/emma-onboarding`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
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

  await supabase.from("leads").update({
    active_agent: "claire",
    status: "followup_1",
    updated_at: new Date().toISOString(),
  }).eq("id", leadId);

  await sendTelegram(telegramKey, chatId, "📋 Lead mantido com Claire para follow-up de fechamento.");
}

// ── AI helpers ──

async function callGemini(geminiKey: string, messages: any[], temperature = 0.3): Promise<string | null> {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${geminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        temperature,
      }),
    });

    const respText = await response.text();
    if (!response.ok) {
      console.error("[telegram-webhook] Gemini error:", response.status, respText.substring(0, 300));
      return null;
    }

    const result = JSON.parse(respText);
    return result.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[telegram-webhook] Gemini call error:", err);
    return null;
  }
}

async function generateQuoteFromText(text: string, geminiKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const content = await callGemini(geminiKey, [
    {
      role: "system",
      content: `Você é um assistente que gera orçamentos de serviços de limpeza profissional para a empresa AM Clean (Bélgica). Responda sempre em português do Brasil.

REGRAS IMPORTANTES:
- Usa EXATAMENTE os valores mencionados pelo utilizador. NÃO inventes valores por hora, NÃO calcules por hora.
- Se o utilizador diz "100 euros por semana, 4x por semana", o item é "Limpeza 4x/semana — €100/semana" e o total mensal é 100 x 4 semanas = €400.
- A moeda é SEMPRE euros (€), nunca reais ou outra moeda.
- O total deve ser o valor MENSAL (multiplicar semanal x 4 semanas).
- NÃO adiciones itens, horas, ou valores que o utilizador não mencionou.
- Se o utilizador menciona apenas o valor total, usa esse valor sem decompor.

Responda APENAS em JSON válido:
{"description": "Descrição geral", "items": [{"service": "nome do serviço", "details": "frequência e detalhes", "price": 400.00}], "total": 400.00}`,
    },
    { role: "user", content: text },
  ], 0.3);

  if (!content) return { description: text, total: 0, items: [] };

  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: text, total: 0, items: [] };
  }
}

async function editQuoteFromText(currentQuote: any, editInstructions: string, geminiKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const content = await callGemini(geminiKey, [
    {
      role: "system",
      content: `Você é um assistente que edita orçamentos de limpeza profissional para AM Clean (Bélgica). Responda sempre em português do Brasil.
Orçamento atual: ${JSON.stringify({ description: currentQuote.description, items: currentQuote.items, total: currentQuote.total_amount })}

REGRAS: Usa EXATAMENTE os valores do utilizador. NÃO inventes valores por hora. Moeda: euros (€). Total = valor MENSAL.
Aplique as alterações e responda APENAS em JSON: {"description": "...", "items": [{"service": "...", "details": "...", "price": 0}], "total": 0}`,
    },
    { role: "user", content: editInstructions },
  ], 0.3);

  if (!content) return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };

  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };
  }
}

async function transcribeAudioFromTelegram(fileId: string, geminiKey: string, telegramKey: string): Promise<string | null> {
  try {
    const fileResp = await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });

    const fileData = await fileResp.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    const audioResp = await fetch(`${TELEGRAM_API_BASE}/file/bot${telegramKey}/${fileData.result.file_path}`);
    if (!audioResp.ok) return null;

    const audioBuffer = await audioResp.arrayBuffer();
    const uint8 = new Uint8Array(audioBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    const transcribeResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Transcreva esta mensagem de áudio exatamente como foi falada. Responda APENAS com a transcrição, sem comentários." },
            { inlineData: { mimeType: "audio/ogg", data: base64Audio } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
      }),
    });

    const respText = await transcribeResp.text();
    if (!transcribeResp.ok) return null;

    const result = JSON.parse(respText);
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
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

async function sendTelegramDocument(
  telegramKey: string,
  chatId: string,
  documentUrl: string,
  caption?: string,
) {
  const body: any = {
    chat_id: chatId,
    document: documentUrl,
    parse_mode: "HTML",
  };
  if (caption) body.caption = caption;

  const resp = await fetch(`${TELEGRAM_API_BASE}/bot${telegramKey}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error("[telegram-webhook] sendDocument error:", await resp.text());
  }
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
