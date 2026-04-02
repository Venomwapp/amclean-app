import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

serve(async () => {
  const startTime = Date.now();

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");

  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is not configured");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let totalProcessed = 0;

  // Read initial offset
  const { data: state, error: stateErr } = await supabase
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }

  let currentOffset = state.update_offset;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offset: currentOffset,
        timeout,
        allowed_updates: ["callback_query", "message"],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[telegram-poll] getUpdates error:", data);
      return new Response(JSON.stringify({ error: data }), { status: 502 });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const update of updates) {
      try {
        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, TELEGRAM_CHAT_ID);
          // Answer callback to remove loading state
          await fetch(`${GATEWAY_URL}/answerCallbackQuery`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TELEGRAM_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ callback_query_id: update.callback_query.id }),
          });
          totalProcessed++;
        } else if (update.message) {
          await handleMessage(update.message, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, TELEGRAM_CHAT_ID);
          totalProcessed++;
        }
      } catch (err) {
        console.error("[telegram-poll] Error processing update:", update.update_id, err);
      }
    }

    // Advance offset
    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase
      .from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed }));
});

// ── Handle callback queries (button presses) ──

async function handleCallbackQuery(
  cbq: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  chatId: string,
) {
  const data = cbq.data as string;
  console.log("[telegram-poll] Callback:", data);

  if (data.startsWith("visit_done:")) {
    const appointmentId = data.replace("visit_done:", "");
    await handleVisitDone(appointmentId, cbq, supabase, lovableKey, telegramKey, chatId);
  } else if (data.startsWith("visit_cancel:")) {
    const appointmentId = data.replace("visit_cancel:", "");
    await handleVisitCancel(appointmentId, cbq, supabase, lovableKey, telegramKey, chatId);
  } else if (data.startsWith("quote_yes:")) {
    const appointmentId = data.replace("quote_yes:", "");
    await handleQuoteYes(appointmentId, supabase, lovableKey, telegramKey, chatId);
  } else if (data.startsWith("quote_no:")) {
    const appointmentId = data.replace("quote_no:", "");
    await sendTelegram(lovableKey, telegramKey, chatId, "👍 OK, sem orçamento para esta visita.");
  } else if (data.startsWith("quote_confirm:")) {
    const quoteId = data.replace("quote_confirm:", "");
    await handleQuoteConfirm(quoteId, supabase, lovableKey, telegramKey, chatId);
  } else if (data.startsWith("quote_edit:")) {
    const quoteId = data.replace("quote_edit:", "");
    // Set quote to awaiting edit instructions
    await supabase.from("quotes").update({ telegram_state: "awaiting_edit", updated_at: new Date().toISOString() }).eq("id", quoteId);
    await sendTelegram(lovableKey, telegramKey, chatId, "✏️ O que deve ser alterado no orçamento? Envie uma mensagem de texto ou áudio.");
  }
}

// ── Handle text/audio messages (for quote data input) ──

async function handleMessage(
  msg: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  chatId: string,
) {
  // Check if there's a quote awaiting input
  const { data: pendingQuote } = await supabase
    .from("quotes")
    .select("*")
    .in("telegram_state", ["awaiting_data", "awaiting_edit"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!pendingQuote) return; // No pending quote, ignore message

  let inputText = msg.text || "";

  // Handle voice/audio messages
  if (msg.voice || msg.audio) {
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    inputText = await transcribeAudioFromTelegram(fileId, lovableKey, telegramKey);
    if (!inputText) {
      await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ Não foi possível transcrever o áudio. Tente novamente ou envie texto.");
      return;
    }
  }

  if (!inputText) return;

  if (pendingQuote.telegram_state === "awaiting_data") {
    // First time: generate quote from scratch
    const quoteData = await generateQuoteFromText(inputText, lovableKey);
    await supabase.from("quotes").update({
      description: quoteData.description,
      total_amount: quoteData.total,
      items: quoteData.items,
      raw_audio_text: inputText,
      telegram_state: "draft",
      status: "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", pendingQuote.id);

    // Send preview
    const preview = formatQuotePreview(quoteData);
    await sendTelegram(lovableKey, telegramKey, chatId, `📋 <b>Orçamento Gerado:</b>\n\n${preview}`, {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: `quote_confirm:${pendingQuote.id}` },
          { text: "✏️ Editar", callback_data: `quote_edit:${pendingQuote.id}` },
        ],
      ],
    });
  } else if (pendingQuote.telegram_state === "awaiting_edit") {
    // Edit existing quote
    const quoteData = await editQuoteFromText(pendingQuote, inputText, lovableKey);
    await supabase.from("quotes").update({
      description: quoteData.description,
      total_amount: quoteData.total,
      items: quoteData.items,
      telegram_state: "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", pendingQuote.id);

    const preview = formatQuotePreview(quoteData);
    await sendTelegram(lovableKey, telegramKey, chatId, `📋 <b>Orçamento Atualizado:</b>\n\n${preview}`, {
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

async function handleVisitDone(appointmentId: string, cbq: any, supabase: any, lovableKey: string, telegramKey: string, chatId: string) {
  // Mark appointment as completed
  await supabase.from("appointments").update({ status: "completed" }).eq("id", appointmentId);

  // Get lead and transfer to Lucas
  const { data: appt } = await supabase.from("appointments").select("lead_id").eq("id", appointmentId).single();
  if (appt?.lead_id) {
    await supabase.from("leads").update({ active_agent: "lucas", updated_at: new Date().toISOString() }).eq("id", appt.lead_id);
  }

  // Update the Telegram message
  if (cbq.message?.message_id) {
    await fetch(`${GATEWAY_URL}/editMessageText`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n✅ <b>Visita marcada como realizada</b>",
        parse_mode: "HTML",
      }),
    });
  }

  // Ask about generating a quote
  await sendTelegram(lovableKey, telegramKey, chatId, "📝 Gerar o orçamento para esta visita?", {
    inline_keyboard: [
      [
        { text: "✅ Sim", callback_data: `quote_yes:${appointmentId}` },
        { text: "❌ Não", callback_data: `quote_no:${appointmentId}` },
      ],
    ],
  });
}

async function handleVisitCancel(appointmentId: string, cbq: any, supabase: any, lovableKey: string, telegramKey: string, chatId: string) {
  await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);

  if (cbq.message?.message_id) {
    await fetch(`${GATEWAY_URL}/editMessageText`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cbq.message.message_id,
        text: cbq.message.text + "\n\n❌ <b>Visita cancelada</b>",
        parse_mode: "HTML",
      }),
    });
  }
}

async function handleQuoteYes(appointmentId: string, supabase: any, lovableKey: string, telegramKey: string, chatId: string) {
  // Get lead from appointment
  const { data: appt } = await supabase.from("appointments").select("lead_id").eq("id", appointmentId).single();

  // Create quote record
  const { data: quote, error } = await supabase.from("quotes").insert({
    lead_id: appt?.lead_id,
    appointment_id: appointmentId,
    status: "pending",
    telegram_state: "awaiting_data",
  }).select().single();

  if (error) {
    console.error("[telegram-poll] Quote insert error:", error);
    await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ Erro ao criar orçamento: " + error.message);
    return;
  }

  await sendTelegram(lovableKey, telegramKey, chatId, "🎤 Me informe os dados do orçamento.\n\nEnvie um <b>áudio</b> ou <b>texto</b> com a descrição dos serviços e valores.");
}

async function handleQuoteConfirm(quoteId: string, supabase: any, lovableKey: string, telegramKey: string, chatId: string) {
  await supabase.from("quotes").update({
    status: "confirmed",
    telegram_state: "confirmed",
    updated_at: new Date().toISOString(),
  }).eq("id", quoteId);

  await sendTelegram(lovableKey, telegramKey, chatId, "⏳ A gerar a proposta...");

  // Generate PDF/HTML proposal
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    console.log("[telegram-poll] Calling generate-quote-pdf for:", quoteId);
    const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-quote-pdf`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quote_id: quoteId }),
    });

    const pdfText = await pdfResp.text();
    console.log("[telegram-poll] generate-quote-pdf response:", pdfResp.status, pdfText.slice(0, 500));

    let pdfResult: any;
    try { pdfResult = JSON.parse(pdfText); } catch {
      console.error("[telegram-poll] generate-quote-pdf returned non-JSON:", pdfText.slice(0, 200));
      await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ Erro ao gerar proposta (resposta inválida).");
      return;
    }

    if (pdfResult.ok && pdfResult.url) {
      await sendTelegram(lovableKey, telegramKey, chatId,
        `📄 <b>Proposta gerada!</b>\n\n🔗 <a href="${pdfResult.url}">Ver proposta</a>`
      );

      // Get quote with lead info for sending
      const { data: quote } = await supabase.from("quotes").select("*, leads(*)").eq("id", quoteId).single();
      const lead = quote?.leads;

      // Send via WhatsApp to client
      if (lead?.whatsapp_number) {
        const lang = lead.language || "fr";
        const isFr = lang === "fr" || lang === "nl";
        const whatsappMsg = isFr
          ? `Bonjour${lead.contact_name ? " " + lead.contact_name : ""} ! 😊\n\nVotre proposition commerciale AM Clean est prête.\n\n📄 Consultez-la ici :\n${pdfResult.url}\n\nSi vous avez des questions, n'hésitez pas à nous contacter.\n\n— AM Clean`
          : `Olá${lead.contact_name ? " " + lead.contact_name : ""} ! 😊\n\nA sua proposta comercial AM Clean está pronta.\n\n📄 Consulte aqui:\n${pdfResult.url}\n\nSe tiver dúvidas, entre em contacto connosco.\n\n— AM Clean`;

        const waSent = await sendWhatsAppEvolution(whatsappMsg, lead.whatsapp_number);
        if (waSent) {
          await sendTelegram(lovableKey, telegramKey, chatId, "✅ Proposta enviada ao cliente pelo WhatsApp!");
        } else {
          await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ WhatsApp não configurado. Proposta não enviada por WhatsApp.");
        }
      } else {
        await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ O lead não tem número WhatsApp registado.");
      }

      // Send email to client
      if (lead?.email) {
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-quote-email`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quote_id: quoteId }),
        });
        const emailText = await emailResp.text();
        console.log("[telegram-poll] send-quote-email response:", emailResp.status, emailText.slice(0, 300));

        try {
          const emailResult = JSON.parse(emailText);
          if (emailResult.ok) {
            await sendTelegram(lovableKey, telegramKey, chatId, "✉️ Email enviado ao cliente com a proposta!");
          }
        } catch {
          console.error("[telegram-poll] send-quote-email non-JSON:", emailText.slice(0, 200));
        }
      } else {
        await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ O lead não tem email registado. Proposta enviada apenas por WhatsApp.");
      }

      // Transfer lead back to Claire for closing
      if (quote?.lead_id) {
        await supabase.from("leads").update({ active_agent: "claire", updated_at: new Date().toISOString() }).eq("id", quote.lead_id);
      }

      await sendTelegram(lovableKey, telegramKey, chatId,
        `✅ <b>Orçamento confirmado!</b>\n\nO lead foi transferido para a Claire para fechamento.`
      );
    } else {
      await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ Erro ao gerar proposta: " + (pdfResult.error || "erro desconhecido"));
    }
  } catch (err) {
    console.error("[telegram-poll] Quote PDF/email error:", err);
    await sendTelegram(lovableKey, telegramKey, chatId, "⚠️ Erro ao processar proposta: " + err.message);
  }
}

// ── AI helpers ──

async function generateQuoteFromText(text: string, lovableKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Tu és um assistente que gera orçamentos de serviços de limpeza profissional para a empresa AM Clean (Bélgica).
A partir da descrição fornecida, extraí os itens do serviço, quantidades e valores.
Responde APENAS em JSON válido com o formato:
{
  "description": "Descrição geral do orçamento",
  "items": [{"service": "nome do serviço", "details": "detalhes", "price": 123.45}],
  "total": 456.78
}
Se não houver valores mencionados, estima com base em preços de mercado belga para limpeza profissional.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  const respText = await response.text();
  if (!response.ok) {
    console.error("[telegram-poll] generateQuote API error:", response.status, respText.slice(0, 500));
    return { description: text, total: 0, items: [] };
  }

  let result: any;
  try { result = JSON.parse(respText); } catch {
    console.error("[telegram-poll] generateQuote non-JSON response:", respText.slice(0, 200));
    return { description: text, total: 0, items: [] };
  }

  const content = result.choices?.[0]?.message?.content || "{}";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  try {
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: text, total: 0, items: [] };
  }
}

async function editQuoteFromText(currentQuote: any, editInstructions: string, lovableKey: string): Promise<{ description: string; total: number; items: any[] }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Tu és um assistente que edita orçamentos de serviços de limpeza profissional para a empresa AM Clean.
O orçamento atual é: ${JSON.stringify({ description: currentQuote.description, items: currentQuote.items, total: currentQuote.total_amount })}
Aplica as alterações pedidas e responde APENAS em JSON com o formato:
{"description": "...", "items": [{"service": "...", "details": "...", "price": 0}], "total": 0}`,
        },
        { role: "user", content: editInstructions },
      ],
      temperature: 0.3,
    }),
  });

  const respText = await response.text();
  if (!response.ok) {
    console.error("[telegram-poll] editQuote API error:", response.status, respText.slice(0, 500));
    return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };
  }

  let result: any;
  try { result = JSON.parse(respText); } catch {
    console.error("[telegram-poll] editQuote non-JSON response:", respText.slice(0, 200));
    return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };
  }

  const content = result.choices?.[0]?.message?.content || "{}";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  try {
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return { description: currentQuote.description, total: currentQuote.total_amount || 0, items: currentQuote.items || [] };
  }
}

async function transcribeAudioFromTelegram(fileId: string, lovableKey: string, telegramKey: string): Promise<string | null> {
  try {
    // Get file path from Telegram
    const fileResp = await fetch(`${GATEWAY_URL}/getFile`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id: fileId }),
    });

    const fileRespText = await fileResp.text();
    if (!fileResp.ok) {
      console.error("[telegram-poll] getFile HTTP error:", fileResp.status, fileRespText.slice(0, 500));
      return null;
    }

    let fileData: any;
    try {
      fileData = JSON.parse(fileRespText);
    } catch {
      console.error("[telegram-poll] getFile returned non-JSON:", fileRespText.slice(0, 200));
      return null;
    }

    if (!fileData.ok || !fileData.result?.file_path) {
      console.error("[telegram-poll] getFile payload invalid:", fileData);
      return null;
    }

    const filePath = fileData.result.file_path;

    // Download audio via gateway
    const audioResp = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
      },
    });

    if (!audioResp.ok) {
      console.error("[telegram-poll] Audio download failed:", audioResp.status, await audioResp.text());
      return null;
    }

    const audioBuffer = await audioResp.arrayBuffer();
    const uint8 = new Uint8Array(audioBuffer);

    // Safe base64 encoding for large arrays
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64Audio = btoa(binary);

    // Use same AI gateway path/payload that already works in webhook-evolution
    const transcribeResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
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
                text: "Transcreve esta mensagem de áudio exatamente como foi falada. Responde APENAS com a transcrição, sem comentários.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: "ogg",
                },
              },
            ],
          },
        ],
      }),
    });

    const transcribeText = await transcribeResp.text();
    if (!transcribeResp.ok) {
      console.error("[telegram-poll] Transcription API error:", transcribeResp.status, transcribeText.slice(0, 500));
      return null;
    }

    let transcriptionPayload: any;
    try {
      transcriptionPayload = JSON.parse(transcribeText);
    } catch {
      console.error("[telegram-poll] Transcription returned non-JSON:", transcribeText.slice(0, 200));
      return null;
    }

    const transcription = (transcriptionPayload.choices?.[0]?.message?.content || "").trim();
    return transcription || null;
  } catch (err) {
    console.error("[telegram-poll] Audio transcription error:", err);
    return null;
  }
}

async function sendWhatsAppEvolution(text: string, number: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[telegram-poll] Evolution API not configured — WhatsApp not sent to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[telegram-poll] WhatsApp send error:", resp.status, await resp.text());
      return false;
    }
    console.log("[telegram-poll] WhatsApp sent to:", number);
    return true;
  } catch (err) {
    console.error("[telegram-poll] WhatsApp send exception:", err);
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

async function sendTelegram(lovableKey: string, telegramKey: string, chatId: string, text: string, reply_markup?: any) {
  const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (reply_markup) body.reply_markup = reply_markup;

  const resp = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[telegram-poll] sendMessage error:", err);
  }
}
