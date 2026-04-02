import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REMINDER_MESSAGES: Record<string, (date: string, type: string) => string> = {
  fr: (date, type) =>
    `Bonjour ! Un petit rappel pour votre rendez-vous de demain avec AM Clean :\n📅 ${date}\n📍 ${type === "visit" ? "Visite sur place" : "Appel téléphonique"}\nNous avons hâte de vous rencontrer ! Si un empêchement survient, n'hésitez pas à me prévenir.`,
  nl: (date, type) =>
    `Goedendag! Een kleine herinnering aan uw afspraak van morgen met AM Clean:\n📅 ${date}\n📍 ${type === "visit" ? "Bezoek ter plaatse" : "Telefoongesprek"}\nWe kijken ernaar uit! Laat het me weten als er iets tussenkomt.`,
  en: (date, type) =>
    `Hello! A quick reminder about your appointment tomorrow with AM Clean:\n📅 ${date}\n📍 ${type === "visit" ? "On-site visit" : "Phone call"}\nWe look forward to meeting you! Let me know if something comes up.`,
};

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[Reminder] Evolution API not configured — skipping send to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Reminder] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Reminder] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const from = new Date(now.getTime() + 23 * 3600 * 1000).toISOString();
    const to = new Date(now.getTime() + 25 * 3600 * 1000).toISOString();

    const { data: appointments, error } = await supabaseAdmin
      .from("appointments")
      .select("*, leads!inner(id, whatsapp_number, contact_name, language)")
      .eq("reminder_sent", false)
      .in("status", ["scheduled", "confirmed"])
      .gte("datetime", from)
      .lte("datetime", to);

    if (error) throw new Error(`Appointments query error: ${error.message}`);
    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;

    for (const apt of appointments) {
      const lead = (apt as any).leads;
      if (!lead?.whatsapp_number) continue;

      const lang = (lead.language || "fr") as string;
      const msgFn = REMINDER_MESSAGES[lang] || REMINDER_MESSAGES.fr;
      const dateStr = new Date(apt.datetime).toLocaleString("fr-BE", {
        weekday: "long", day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit",
      });
      const message = msgFn(dateStr, apt.type);

      await sendWhatsApp(lead.whatsapp_number, message);
      await supabaseAdmin.from("appointments").update({ reminder_sent: true }).eq("id", apt.id);
      sentCount++;
    }

    console.log(`[Reminders] Processed: ${appointments.length}, Sent: ${sentCount}`);

    return new Response(JSON.stringify({ processed: appointments.length, sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Reminders] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
