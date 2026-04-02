import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { lead_id, message } = await req.json();
    if (!lead_id || !message) {
      return new Response(JSON.stringify({ error: "Missing lead_id or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get lead
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("whatsapp_number")
      .eq("id", lead_id)
      .single();

    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to conversations
    await supabaseAdmin.from("conversations").insert({
      lead_id,
      role: "assistant",
      content: message,
      agent: "claire",
      metadata: { manual: true, sent_by: user.email },
    });

    // Send via WhatsApp if configured
    let whatsappSent = false;
    const evoUrl = Deno.env.get("EVOLUTION_API_URL");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    const evoInstance = Deno.env.get("EVOLUTION_INSTANCE_NAME");

    if (evoUrl && evoKey && evoInstance && lead.whatsapp_number) {
      try {
        const resp = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
          method: "POST",
          headers: { apikey: evoKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: lead.whatsapp_number, text: message }),
        });
        whatsappSent = resp.ok;
        await resp.text();
      } catch (e) {
        console.error("[AdminSend] WhatsApp error:", e);
      }
    }

    return new Response(JSON.stringify({ status: "ok", whatsapp_sent: whatsappSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[AdminSend] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
