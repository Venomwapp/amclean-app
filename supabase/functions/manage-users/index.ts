import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsError } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claims.claims.sub;

    // Use service role to check admin status
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, email, password, display_name, user_id } = await req.json();

    if (action === "list") {
      // List all admins
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "admin");

      const admins = [];
      if (roles) {
        for (const r of roles) {
          const { data: userData } = await adminClient.auth.admin.getUserById(r.user_id);
          admins.push({
            user_id: r.user_id,
            email: userData?.user?.email || "unknown",
            display_name: userData?.user?.user_metadata?.display_name || userData?.user?.email,
            created_at: userData?.user?.created_at,
          });
        }
      }

      return new Response(JSON.stringify({ admins }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email and password required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign admin role
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "admin",
      });

      return new Response(
        JSON.stringify({ success: true, user_id: newUser.user.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "revoke") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow self-revoke
      if (user_id === callerId) {
        return new Response(
          JSON.stringify({ error: "Cannot revoke your own admin access" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", "admin");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
