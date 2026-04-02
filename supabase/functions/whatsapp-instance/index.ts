import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const evoUrl = Deno.env.get('EVOLUTION_API_URL');
  const evoKey = Deno.env.get('EVOLUTION_API_KEY');
  const evoInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME');

  if (!evoUrl || !evoKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Evolution API not configured', status: 'not_configured' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Action: get instance status
    if (action === 'status') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: true, status: 'no_instance', instance: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const resp = await fetch(`${evoUrl}/instance/connectionState/${evoInstance}`, {
          headers: { apikey: evoKey },
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error('[WhatsApp] Status check failed:', resp.status, errText);
          return new Response(
            JSON.stringify({ success: true, status: 'disconnected', instance: evoInstance, error: errText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await resp.json();
        // Evolution API returns { instance: { state: 'open' | 'close' | 'connecting' } }
        const state = data?.instance?.state || data?.state || 'unknown';
        const connected = state === 'open';

        // If connected, get instance info
        let phoneNumber = null;
        let profileName = null;
        if (connected) {
          try {
            const infoResp = await fetch(`${evoUrl}/instance/fetchInstances`, {
              headers: { apikey: evoKey },
            });
            if (infoResp.ok) {
              const instances = await infoResp.json();
              const inst = Array.isArray(instances) 
                ? instances.find((i: any) => i.instance?.instanceName === evoInstance || i.instanceName === evoInstance)
                : null;
              if (inst) {
                phoneNumber = inst.instance?.owner || inst.owner || null;
                profileName = inst.instance?.profileName || inst.profileName || null;
              }
            }
          } catch (e) {
            console.error('[WhatsApp] Fetch instance info error:', e);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: connected ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected',
            instance: evoInstance,
            phone_number: phoneNumber,
            profile_name: profileName,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('[WhatsApp] Connection state error:', e);
        return new Response(
          JSON.stringify({ success: true, status: 'error', instance: evoInstance, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: get QR code
    if (action === 'qrcode') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: false, error: 'No instance configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const resp = await fetch(`${evoUrl}/instance/connect/${evoInstance}`, {
          headers: { apikey: evoKey },
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error('[WhatsApp] QR code fetch failed:', resp.status, errText);
          return new Response(
            JSON.stringify({ success: false, error: `Failed to get QR code: ${errText}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await resp.json();
        // Evolution API returns { base64: 'data:image/png;base64,...', code: '...' } or { pairingCode: '...' }
        const qrBase64 = data?.base64 || null;
        const qrCode = data?.code || null;
        const pairingCode = data?.pairingCode || null;

        return new Response(
          JSON.stringify({ 
            success: true, 
            qr_base64: qrBase64,
            qr_code: qrCode,
            pairing_code: pairingCode,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('[WhatsApp] QR code error:', e);
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: set webhook URL on Evolution API
    if (action === 'set_webhook') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: false, error: 'No instance configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-evolution`;

      try {
        // Try both formats and key styles (snake_case + camelCase) for compatibility
        const webhookEvents = [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
        ];

        // Format 1: Direct payload
        let resp = await fetch(`${evoUrl}/webhook/set/${evoInstance}`, {
          method: 'POST',
          headers: { apikey: evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: true,
            webhookByEvents: true,
            webhook_base64: false,
            webhookBase64: false,
            events: webhookEvents,
            enabled: true,
          }),
        });

        let data = await resp.json().catch(() => ({}));

        // If direct format fails, try wrapper payload
        if (!resp.ok) {
          console.log('[WhatsApp] Direct format failed, trying wrapper format');
          resp = await fetch(`${evoUrl}/webhook/set/${evoInstance}`, {
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhook: {
                url: webhookUrl,
                webhook_by_events: true,
                webhookByEvents: true,
                webhook_base64: false,
                webhookBase64: false,
                events: webhookEvents,
                enabled: true,
              },
            }),
          });
          data = await resp.json().catch(() => ({}));
        }

        console.log('[WhatsApp] Webhook set result:', JSON.stringify(data));
        return new Response(
          JSON.stringify({ success: resp.ok, webhook_url: webhookUrl, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('[WhatsApp] Set webhook error:', e);
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: check current webhook config
    if (action === 'get_webhook') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: false, error: 'No instance configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const resp = await fetch(`${evoUrl}/webhook/find/${evoInstance}`, {
          headers: { apikey: evoKey },
        });
        const data = await resp.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ success: resp.ok, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: restart/reconnect instance
    if (action === 'restart') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: false, error: 'No instance configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const resp = await fetch(`${evoUrl}/instance/restart/${evoInstance}`, {
          method: 'PUT',
          headers: { apikey: evoKey },
        });

        const data = await resp.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ success: resp.ok, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: disconnect/logout
    if (action === 'logout') {
      if (!evoInstance) {
        return new Response(
          JSON.stringify({ success: false, error: 'No instance configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const resp = await fetch(`${evoUrl}/instance/logout/${evoInstance}`, {
          method: 'DELETE',
          headers: { apikey: evoKey },
        });

        const data = await resp.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ success: resp.ok, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action. Use: status, qrcode, restart, logout' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[WhatsApp Instance] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
