import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supaUrl, service);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { email, password, display_name, role } = await req.json();
    if (!email || !password) return new Response(JSON.stringify({ error: "email & password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: display_name ?? email.split("@")[0] },
    });
    if (error) throw error;

    if (role === "admin" && created.user) {
      await admin.from("user_roles").delete().eq("user_id", created.user.id);
      await admin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
    }

    return new Response(JSON.stringify({ ok: true, user_id: created.user?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
