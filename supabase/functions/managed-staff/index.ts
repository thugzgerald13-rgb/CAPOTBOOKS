import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeLogin(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function getCaller(req: Request, admin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Not authenticated');
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const caller = await getCaller(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'create');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('user_role, display_name')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!['owner', 'accountant', 'bookkeeper'].includes(String(profile?.user_role ?? '').toLowerCase())) {
      throw new Error('Only a Business Owner, Accountant, or Bookkeeper can manage staff');
    }

    if (action === 'create') {
      const loginName = normalizeLogin(body.loginName);
      const password = String(body.password ?? '');
      const displayName = String(body.displayName ?? '').trim() || null;

      if (!/^[a-z0-9._-]{3,32}$/.test(loginName)) {
        throw new Error('Staff Login must be 3-32 characters using lowercase letters, numbers, dot, underscore, or hyphen');
      }
      if (password.length < 6) throw new Error('Staff password must be at least 6 characters');

      const { count: ownerClientCount, error: clientsError } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', caller.id);
      if (clientsError) throw clientsError;
      if (!ownerClientCount) throw new Error('Create at least one client before creating managed staff logins');

      const { data: existing, error: existingError } = await admin
        .from('account_managed_staff_credentials')
        .select('id, auth_user_id, owner_user_id, is_active')
        .eq('login_name', loginName)
        .maybeSingle();
      if (existingError) throw existingError;

      let authUserId: string;
      const syntheticEmailSuffix = existing?.auth_user_id ?? crypto.randomUUID();
      const syntheticEmail = `staff+${syntheticEmailSuffix}@staff.capot.app`;

      if (existing && existing.owner_user_id !== caller.id) {
        throw new Error('That Staff Login is already in use. Choose another login.');
      }

      if (existing) {
        authUserId = existing.auth_user_id;
        const { error } = await admin.auth.admin.updateUserById(authUserId, {
          password,
          user_metadata: {
            managed_staff: true,
            managed_by_owner_id: caller.id,
            display_name: displayName,
          },
        });
        if (error) throw error;
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: syntheticEmail,
          password,
          email_confirm: true,
          user_metadata: {
            managed_staff: true,
            managed_by_owner_id: caller.id,
            display_name: displayName,
          },
          app_metadata: { managed_staff: true },
        });
        if (error || !created.user) throw error ?? new Error('Could not create managed staff login');
        authUserId = created.user.id;
      }

      const { error: linkError } = await admin
        .from('account_team_links')
        .upsert({
          owner_user_id: caller.id,
          member_user_id: authUserId,
          member_email: syntheticEmail,
          display_name: displayName,
          member_role: 'staff',
          member_kind: 'managed',
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_user_id' });
      if (linkError) throw linkError;

      const { error: credentialError } = await admin
        .from('account_managed_staff_credentials')
        .upsert({
          owner_user_id: caller.id,
          auth_user_id: authUserId,
          login_name: loginName,
          display_name: displayName,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'auth_user_id' });
      if (credentialError) throw credentialError;

      const { error: profileUpsertError } = await admin
        .from('profiles')
        .upsert({
          id: authUserId,
          user_role: 'staff',
          display_name: displayName,
          approved: true,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (profileUpsertError) throw profileUpsertError;

      return json({ loginName, displayName, memberRole: 'staff', managed: true });
    }

    const userId = String(body.userId ?? '');
    if (!userId) throw new Error('Staff member is required');

    const { data: link, error: linkQueryError } = await admin
      .from('account_team_links')
      .select('id, owner_user_id, member_user_id, member_kind, member_role, status')
      .eq('owner_user_id', caller.id)
      .eq('member_user_id', userId)
      .maybeSingle();
    if (linkQueryError) throw linkQueryError;
    if (!link) throw new Error('Team member not found');

    if (action === 'reset') {
      if (link.member_kind !== 'managed' || link.member_role !== 'staff') {
        throw new Error('Only managed staff credentials can be reset here');
      }
      const temporaryPassword = `${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}Aa1!`;
      const { error } = await admin.auth.admin.updateUserById(userId, { password: temporaryPassword });
      if (error) throw error;
      return json({ temporaryPassword });
    }

    if (action === 'remove') {
      if (link.member_kind === 'managed') {
        const { error: credentialError } = await admin
          .from('account_managed_staff_credentials')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('owner_user_id', caller.id)
          .eq('auth_user_id', userId);
        if (credentialError) throw credentialError;
      }

      const { error: disableError } = await admin
        .from('account_team_links')
        .update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('owner_user_id', caller.id)
        .eq('member_user_id', userId);
      if (disableError) throw disableError;

      return json({ removed: true });
    }

    throw new Error('Unsupported staff action');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json({ error: message }, 400);
  }
});
