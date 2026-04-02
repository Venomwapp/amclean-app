import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");

    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is not configured");

    const { appointment_id, lead_name, lead_phone, appointment_type, appointment_datetime, location } = await req.json();

    const dateStr = new Date(appointment_datetime).toLocaleString("pt-BR", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const typeLabel = appointment_type === "call" ? "📞 Chamada" : "🏠 Visita";

    const text = `🔔 <b>Nova ${typeLabel} Agendada</b>\n\n` +
      `👤 <b>Cliente:</b> ${lead_name || lead_phone || "—"}\n` +
      `📱 <b>WhatsApp:</b> ${lead_phone || "—"}\n` +
      `📅 <b>Data:</b> ${dateStr}\n` +
      `📍 <b>Local:</b> ${location || "A definir"}\n\n` +
      `ID: <code>${appointment_id}</code>`;

    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Visita realizada", callback_data: `visit_done:${appointment_id}` },
              { text: "❌ Visita cancelada", callback_data: `visit_cancel:${appointment_id}` },
            ],
          ],
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);
    }

    console.log("[telegram-notify] Message sent, message_id:", data.result?.message_id);

    return new Response(JSON.stringify({ ok: true, message_id: data.result?.message_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[telegram-notify] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
