import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const decodeJwt = (token: string) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Log check for env variables
    if (!supaUrl || !serviceRoleKey) {
      console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Edge function configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!anonKey) {
      console.error("Missing environment variables: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
      return new Response(
        JSON.stringify({ error: "Edge function configuration error: SUPABASE_ANON_KEY is missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate the requester using their own token
    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) {
      console.error("Requester is not authenticated. Authorization header was:", authHeader);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Requester is not authenticated." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Enforce recent authentication (session under 60 minutes old)
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const payload = decodeJwt(token);
    if (!payload || !payload.iat) {
      console.error("Requester token could not be parsed as JWT:", token);
      return new Response(
        JSON.stringify({ error: "Invalid session token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const nowSecs = Math.floor(Date.now() / 1000);
    if (nowSecs - payload.iat > 3600) {
      console.error(`Session is too old: iat=${payload.iat}, now=${nowSecs}`);
      return new Response(
        JSON.stringify({ error: "Session is too old. Please sign out and sign back in to confirm authentication." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify requester is approved, active and has the Admin role
    const adminClient = createClient(supaUrl, serviceRoleKey);
    const requesterId = ures.user.id;

    const [{ data: profileRow }, { data: roleRow }] = await Promise.all([
      adminClient.from("profiles").select("status, is_active").eq("id", requesterId).maybeSingle(),
      adminClient.from("user_roles").select("role").eq("user_id", requesterId).eq("role", "admin").maybeSingle(),
    ]);

    if (!profileRow || profileRow.status !== "approved" || !profileRow.is_active || !roleRow) {
      console.error(`Forbidden: requesterId=${requesterId}, profileRow=${JSON.stringify(profileRow)}, roleRow=${JSON.stringify(roleRow)}`);
      return new Response(
        JSON.stringify({ error: "You are not authorized to perform password resets." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate body inputs
    let body;
    try {
      body = await req.json();
      console.log("Parsed request body:", JSON.stringify(body));
    } catch (parseErr) {
      console.error("Failed to parse request JSON:", parseErr);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body in request." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { employeeId, newPassword } = body || {};
    if (!employeeId || !newPassword) {
      console.error("Validation failed: missing employeeId or newPassword");
      return new Response(
        JSON.stringify({ error: "Employee ID and new password are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Prevent admins from resetting their own password
    if (requesterId === employeeId) {
      console.error("Admin attempted to reset their own password via Admin Edge Function.");
      return new Response(
        JSON.stringify({ error: "Use Change Password instead of resetting your own password." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Verify target employee exists, is active and approved
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, status, is_active")
      .eq("id", employeeId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      console.error(`Target employee profile not found: employeeId=${employeeId}, error=${JSON.stringify(targetError)}`);
      return new Response(
        JSON.stringify({ error: "Employee profile not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetProfile.status !== "approved" || !targetProfile.is_active) {
      console.error(`Target employee cannot be reset: status=${targetProfile.status}, is_active=${targetProfile.is_active}`);
      return new Response(
        JSON.stringify({ error: "Cannot reset password for unapproved or disabled employee." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Verify password strength
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasDigit = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    const validLen = newPassword.length >= 8 && newPassword.length <= 128;

    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial || !validLen) {
      console.error("New password strength requirements not satisfied.");
      return new Response(
        JSON.stringify({ error: "New password does not satisfy strength requirements. It must be 8-128 characters and include uppercase, lowercase, numbers, and special characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Enforce rate limiting: maximum 5 resets per admin per minute
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count, error: countError } = await adminClient
      .from("admin_password_reset_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("admin_id", requesterId)
      .gte("created_at", oneMinuteAgo);

    if (countError) {
      console.error("Audit log count error:", JSON.stringify(countError));
      throw countError;
    }
    if (count !== null && count >= 5) {
      console.warn(`Rate limit exceeded for admin: requesterId=${requesterId}`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Maximum 5 password resets per admin per minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Reset password via Admin Auth API
    console.log(`Resetting auth password for employeeId: ${employeeId}`);
    const updateResponse = await adminClient.auth.admin.updateUserById(employeeId, {
      password: newPassword,
    });
    console.log("admin.auth.updateUserById response:", JSON.stringify(updateResponse));
    if (updateResponse.error) {
      throw updateResponse.error;
    }

    // 10. Update target employee profile: must_change_password = true
    console.log(`Setting must_change_password to true for employeeId: ${employeeId}`);
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", employeeId);
    if (profileUpdateError) {
      console.error("Profile must_change_password update error:", JSON.stringify(profileUpdateError));
      throw profileUpdateError;
    }

    // 11. Write audit log entry
    console.log(`Writing audit log entry for admin: ${requesterId} resetting employee: ${employeeId}`);
    const { error: auditError } = await adminClient
      .from("admin_password_reset_audit_logs")
      .insert({
        admin_id: requesterId,
        employee_id: employeeId,
        action: "PASSWORD_RESET",
      });
    if (auditError) {
      console.error("Failed to insert audit log entry:", JSON.stringify(auditError));
      throw auditError;
    }

    console.log(`Password reset sequence completed successfully for employeeId: ${employeeId}`);
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Caught exception in reset-password edge function:", e);
    const errMessage = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: `Server error: ${errMessage}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
