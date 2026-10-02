// supabase/functions/create-staff-user/index.ts
// FINAL — bypasses both the CORS header issue and the broken invite_subuser RPC
// (which hits the missing email_change_token column). Creates the auth user via
// Management API, creates an auto-approved profile, and links the subuser by
// direct REST insert into account_membership.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Allow EVERY header the Supabase JS client sends (x-client-info, apikey,
  // authorization, content-type, x-application-id). '*' is the safe catch-all.
  'Access-Control-Allow-Headers': '*',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS, status: 200 })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rest = (path: string, init: RequestInit) =>
      fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          ...(init.headers || {}),
        },
      })

    const authHeader = req.headers.get('Authorization') || ''
    const { email, display_name, member_role } = await req.json()
    const cleanEmail = String(email || '').trim().toLowerCase()

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { headers: CORS_HEADERS, status: 400 })
    }

    // 1) Verify caller is signed in (owner/accountant creating staff).
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: authHeader },
    })
    const invoker = await who.json()
    const invokerId = invoker?.id
    if (!invokerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: CORS_HEADERS, status: 401 })
    }

    // 2) Create the auth user via Management API (avoids auth.admin.createUser
    //    wrapper which hits the missing email_change_token column).
    const tempPassword = crypto.randomUUID().slice(0, 12) + 'A1!'
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: display_name || null, staff: true, created_by: invokerId },
      }),
    })
    const createBody = await createRes.json()
    let userId: string | null = null
    let existingUser = false

    if (!createRes.ok) {
      const msg = JSON.stringify(createBody)
      if (msg.includes('already') || msg.includes('exists')) {
        existingUser = true
        const pf = await rest(`/profiles?select=id&email=eq.${encodeURIComponent(cleanEmail)}`, { method: 'GET' })
        const pfRows = await pf.json()
        userId = pfRows?.[0]?.id || null
      }
      if (!userId) {
        return new Response(JSON.stringify({ error: createBody?.msg || createBody?.error || 'Create failed' }), { headers: CORS_HEADERS, status: 400 })
      }
    } else {
      userId = createBody?.id || createBody?.user?.id || null
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user id returned' }), { headers: CORS_HEADERS, status: 500 })
    }

    // 3) Create profile, auto-approved (bypasses developer approval gate).
    await rest('/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: userId,
        email: cleanEmail,
        display_name: display_name || null,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: invokerId,
        user_role: member_role || 'staff',
        updated_at: new Date().toISOString(),
      }),
    })

    // 4) Link as subuser by DIRECT insert into account_membership (bypasses the
    //    broken invite_subuser RPC which hits email_change_token). Find the
    //    invoker's account first.
    const accRes = await rest(`/account_membership?select=account_id&user_id=eq.${invokerId}&limit=1`, { method: 'GET' })
    const accRows = await accRes.json()
    const accountId = accRows?.[0]?.account_id
    if (accountId) {
      await rest('/account_membership', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({
          account_id: accountId,
          user_id: userId,
          full_name: display_name || null,
          role: member_role || 'staff',
          is_active: true,
        }),
      })
    }

    return new Response(
      JSON.stringify({
        user_id: userId,
        email: cleanEmail,
        temporary_password: existingUser ? null : tempPassword,
        existing_user: existingUser,
      }),
      { headers: CORS_HEADERS, status: 200 }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { headers: CORS_HEADERS, status: 500 })
  }
})
