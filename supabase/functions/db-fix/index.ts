import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: any = {};

  try {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === "hello@amclean.be");

    let userId: string;

    if (existing) {
      userId = existing.id;
      // Update password
      await supabase.auth.admin.updateUserById(userId, { password: "AMclean123" });
      results.user = "updated";
    } else {
      // Create user
      const { data, error } = await supabase.auth.admin.createUser({
        email: "hello@amclean.be",
        password: "AMclean123",
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user.id;
      results.user = "created";
    }

    results.user_id = userId;

    // Ensure user_roles entry exists
    const { data: roleExists } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roleExists) {
      const { error: roleErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (roleErr) results.role_error = String(roleErr);
      else results.role = "created";
    } else {
      results.role = "already_exists";
    }

    // Delete old admin@amclean.be user if exists
    const oldUser = existingUsers?.users?.find((u: any) => u.email === "admin@amclean.be");
    if (oldUser) {
      await supabase.auth.admin.deleteUser(oldUser.id);
      results.old_user = "deleted";
    }

    results.status = "ok";
  } catch (e) {
    results.error = String(e);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
