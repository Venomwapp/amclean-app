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
    console.log("[Followup] Evolution API not configured — skipping send to", number);
    return false;
  }
  try {
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) {
      console.error("[Followup] Send failed:", resp.status, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error("[Followup] Send error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Get pending followups that are due
    const { data: followups, error } = await supabaseAdmin
      .from("followups")
      .select("*, leads!inner(id, whatsapp_number, contact_name, language, status)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (error) throw new Error(`Followup query error: ${error.message}`);
    if (!followups || followups.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, cancelled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let cancelledCount = 0;

    for (const followup of followups) {
      const lead = (followup as any).leads;

      // Check if lead replied since followup was created
      const { count } = await supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("role", "user")
        .gt("created_at", followup.created_at);

      if (count && count > 0) {
        await supabaseAdmin.from("followups").update({ status: "cancelled" }).eq("id", followup.id);
        cancelledCount++;
        continue;
      }

      // Send the message
      if (lead.whatsapp_number) {
        const sent = await sendWhatsApp(lead.whatsapp_number, followup.message);
        
        // Save to conversations
        await supabaseAdmin.from("conversations").insert({
          lead_id: lead.id,
          role: "assistant",
          content: followup.message,
          agent: "claire",
          metadata: { followup: true, step: followup.step },
        });

        await supabaseAdmin.from("followups").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", followup.id);

        // If step 3 (last followup) → mark lead as lost
        if (followup.step === 3) {
          await supabaseAdmin.from("leads").update({ status: "lost" }).eq("id", lead.id);
        }

        sentCount++;
      }
    }

    console.log(`[Followups] Processed: ${followups.length}, Sent: ${sentCount}, Cancelled: ${cancelledCount}`);

    return new Response(JSON.stringify({ processed: followups.length, sent: sentCount, cancelled: cancelledCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Followups] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
