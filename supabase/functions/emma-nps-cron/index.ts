import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NPS_MESSAGES: Record<string, string> = {
  fr: "Bonjour {name} ! C'est Emma d'AM Clean. 😊 Comment évalueriez-vous notre service ce mois-ci, de 0 à 10 ?",
  nl: "Goedendag {name}! Het is Emma van AM Clean. 😊 Hoe zou u onze service deze maand beoordelen, van 0 tot 10?",
  en: "Hello {name}! It's Emma from AM Clean. 😊 How would you rate our service this month, from 0 to 10?",
};

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!url || !apiKey || !instance) {
    console.log("[Emma-NPS] Evolution API not configured");
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Emma-NPS] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Emma-NPS] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Find all converted clients managed by Emma
    const { data: clients, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("status", "converted")
      .eq("active_agent", "emma");

    if (error) {
      console.error("[Emma-NPS] Query error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!clients || clients.length === 0) {
      console.log("[Emma-NPS] No converted clients found");
      return new Response(JSON.stringify({ status: "ok", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let sentCount = 0;

    for (const client of clients) {
      // Check if NPS was already sent this month
      const npsData = (client as any).nps_data || {};
      const lastNpsDate = npsData.last_nps_date;
      if (lastNpsDate && lastNpsDate.startsWith(currentMonth)) {
        console.log(`[Emma-NPS] Already sent NPS this month for ${client.id}`);
        continue;
      }

      if (!client.whatsapp_number) {
        console.log(`[Emma-NPS] No WhatsApp number for ${client.id}`);
        continue;
      }

      // Build NPS message
      const lang = (client.language || "fr") as string;
      const template = NPS_MESSAGES[lang] || NPS_MESSAGES.fr;
      const name = client.contact_name || client.company_name || "cher client";
      const message = template.replace("{name}", name);

      // Send via WhatsApp
      const sent = await sendWhatsApp(client.whatsapp_number, message);
      if (sent) {
        sentCount++;

        // Save in conversations
        await supabaseAdmin.from("conversations").insert({
          lead_id: client.id,
          role: "assistant",
          content: message,
          agent: "emma",
          metadata: { type: "nps_survey", month: currentMonth },
        });

        // Update nps_data with current date
        const updatedNpsData = { ...npsData, last_nps_date: now.toISOString().split("T")[0] };
        await supabaseAdmin.from("leads").update({
          nps_data: updatedNpsData,
          updated_at: new Date().toISOString(),
        }).eq("id", client.id);

        console.log(`[Emma-NPS] NPS sent to ${client.contact_name || client.id}`);
      }

      // Small delay between messages to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`[Emma-NPS] Done. Sent: ${sentCount}/${clients.length}`);

    return new Response(JSON.stringify({ status: "ok", total_clients: clients.length, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Emma-NPS] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
