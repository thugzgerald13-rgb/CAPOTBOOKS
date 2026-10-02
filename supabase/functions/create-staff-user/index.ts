// supabase/functions/create-staff-user/index.ts
// Deploy:  supabase functions deploy create-staff-user
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//          (set in dashboard → Edge Functions → Secrets, or `supabase secrets set`)
//
// Called by an owner/accountant from Team Settings → "Invite / Create Staff".
// Creates the auth user WITH a password (email auto-confirmed) so the staff
// member never has to go through signup themselves. Creates their profile
// (approved = true → bypasses the developer-approval gate) and links them to
// the invoker's account as a subuser via invite_subuser. Returns the temporary
// password ONCE (only for newly-created accounts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, display_name, member_role } = await req.json();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is a signed-in user (the owner/accountant creating staff).
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
    const { data: { user: invoker }, error: jwtError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (jwtError || !invoker) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Create the auth user. Email is auto-confirmed so they can sign in
    //    immediately with the temporary password. If the email already exists,
    //    createUser fails with 422 → we treat it as an existing user and link.
    const tempPassword =
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      "!";
    let targetUserId: string | null = null;
    let existingUser = false;

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: display_name || null,
        created_by: invoker.id,
        staff: true,
      },
    });

    if (createError) {
      // User already exists (or another auth error). Look them up by email.
      existingUser = true;
      const { data: found } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (found?.id) {
        targetUserId = found.id;
      } else {
        // Fall back to admin list search (first page only — acceptable fallback).
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const match = list?.users.find((u) => u.email?.toLowerCase() === cleanEmail);
        targetUserId = match?.id || null;
      }
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      targetUserId = created.user.id;
    }

    // 2) Ensure a profile row exists, auto-approved (bypasses approval gate).
    await supabaseAdmin.from("profiles").upsert(
      {
        id: targetUserId,
        email: cleanEmail,
        display_name: display_name || null,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: invoker.id,
        user_role: member_role || "staff",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    // 3) Link to the invoker's account via the existing invite_subuser RPC
    //    (handles account_membership + permissions + idempotency). Best-effort:
    //    the account exists and can sign in even if linking fails.
    try {
      await supabaseAdmin.rpc("invite_subuser", {
        p_email: cleanEmail,
        p_display_name: display_name || null,
        p_member_role: member_role || "staff",
      });
    } catch (_) {
      /* membership linking best-effort */
    }

    return new Response(
      JSON.stringify({
        user_id: targetUserId,
        email: cleanEmail,
        temporary_password: existingUser ? null : tempPassword,
        existing_user: existingUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
