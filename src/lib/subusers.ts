// Team-member service.
//
// Professional roles use account-to-account invitations. Staff use managed
// credentials created inside the inviter's account and never create a separate
// CAPOT business/webapp account.
import { supabase } from './supabase';
import type {
  TeamMember,
  MemberRole,
  InviteResult,
  AccountMembership,
  ClientPermissionAssignment,
} from '../types';

function isRpcMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /function.*does not exist|could not find function|schema cache/i.test(msg);
}

export class SubusersNotEnabledError extends Error {
  constructor() {
    super('subusers_not_enabled');
    this.name = 'SubusersNotEnabledError';
  }
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isRpcMissing(error)) throw new SubusersNotEnabledError();
    throw new Error(error.message);
  }
  return data as unknown as T;
}

/**
 * Invite a professional account, or create a managed staff login under the
 * inviter's account. Staff never create or own a separate CAPOT webapp account.
 */
export async function inviteSubuser(
  email: string,
  displayName: string,
  memberRole: MemberRole,
  options?: { loginName?: string; password?: string; permissions?: Record<string, boolean> }
): Promise<InviteResult> {
  if (memberRole === 'staff') {
    const { data, error } = await supabase.functions.invoke('managed-staff', {
      body: {
        action: 'create',
        loginName: options?.loginName?.trim(),
        password: options?.password,
        displayName: displayName.trim() || null,
      },
    });
    if (error) {
      // Supabase FunctionsHttpError keeps the non-2xx Response in `context`.
      // Read its JSON body so the UI shows the Edge Function's real validation
      // or database error instead of the generic "non-2xx status code" message.
      let msg = String(error.message || '');
      const context = (error as Error & { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json() as { error?: unknown; message?: unknown };
          const serverMessage = payload?.error ?? payload?.message;
          if (typeof serverMessage === 'string' && serverMessage.trim()) {
            msg = serverMessage.trim();
          }
        } catch {
          // The response may not contain JSON; keep the SDK message as fallback.
        }
      }

      const networkFailure = /failed to send|failed to fetch|networkerror|cors|load failed/i.test(msg) || !msg;
      throw new Error(
        networkFailure
          ? 'Could not reach the managed-staff Edge Function. Deploy it to your Supabase project first: npx supabase functions deploy managed-staff (or upload supabase/functions/managed-staff in the Dashboard → Edge Functions).'
          : msg
      );
    }
    if (!data || data.error) throw new Error(String(data?.error || 'Could not create managed staff login.'));

    return {
      userId: null,
      email: String(data.loginName),
      temporaryPassword: options?.password || null,
      existingUser: false,
      invitationPending: false,
    };
  }

  const rows = await callRpc<Array<Record<string, unknown>>>('send_team_invitation', {
    p_email: email.trim(),
    p_display_name: displayName.trim() || null,
    p_member_role: memberRole,
    p_permissions: options?.permissions ?? {},
  });
  const r = rows?.[0];
  if (!r) throw new Error('Invitation could not be created.');

  return {
    userId: null,
    email: String(r.email || email.trim()),
    temporaryPassword: null,
    existingUser: false,
    invitationPending: true,
  };
}

/**
 * Claim the newest valid invitation addressed to the authenticated user's
 * email. This is deliberately email-bound on the server, so merely knowing
 * an invitation id/token is not enough to attach a different account.
 */
export async function claimTeamInvitation(): Promise<AccountMembership | null> {
  try {
    const r = await callRpc<Record<string, unknown> | null>('claim_team_invitation', {});
    if (!r) return null;
    return {
      isSubuser: Boolean(r.is_subuser),
      ownerId: r.owner_id ? String(r.owner_id) : null,
      ownerEmail: r.owner_email ? String(r.owner_email) : null,
      memberRole: (r.member_role as MemberRole) || 'staff',
      status: (r.status as TeamMember['status']) || 'active',
    };
  } catch (err) {
    // This RPC is an optional enhancement for existing databases. Do not block
    // ordinary login when the migration has not been installed yet.
    if (err instanceof SubusersNotEnabledError) return null;
    throw err;
  }
}

/** List subusers linked to the current account owner. */
export async function listMySubusers(): Promise<TeamMember[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_my_subusers', {});
  return (rows || []).map((r) => ({
    id: String(r.id ?? r.user_id),
    userId: String(r.user_id),
    email: String(r.email || ''),
    displayName: (r.display_name as string) || null,
    memberRole: (r.member_role as MemberRole) || 'staff',
    status: (r.status as TeamMember['status']) || 'active',
    lastLogin: (r.last_login as string) || null,
    createdAt: (r.created_at as string) || null,
    memberKind: (r.member_kind as 'managed' | 'independent') || 'managed',
    inviteMode: (r.invite_mode as TeamMember['inviteMode']) ?? null,
  }));
}

/** Change a subuser's role. */
export async function updateSubuserRole(
  userId: string,
  memberRole: MemberRole
): Promise<void> {
  await callRpc<void>('update_subuser_role', {
    p_user_id: userId,
    p_member_role: memberRole,
  });
}

/** Toggle a subuser between active and disabled. */
export async function setSubuserStatus(
  userId: string,
  status: TeamMember['status']
): Promise<void> {
  await callRpc<void>('set_subuser_status', {
    p_user_id: userId,
    p_status: status,
  });
}

/** Remove a team member. Managed staff credentials are disabled via the
 *  managed-staff edge function; independent professional accounts are
 *  unlinked and pending invitations are revoked by the remove_subuser RPC,
 *  which also handles legacy managed subusers.
 *
 *  The edge function is only tried for managed members. Previously it was
 *  always invoked first, and its 400 "Team member not found" (e.g. for a
 *  pending invitation, which has no account_team_links row yet) was thrown
 *  before the RPC fallback ever ran — so pending invites could not be
 *  revoked from the UI. */
export async function removeSubuser(
  userId: string,
  memberKind?: 'managed' | 'independent'
): Promise<void> {
  if (memberKind === 'managed') {
    try {
      const { data, error } = await supabase.functions.invoke('managed-staff', {
        body: { action: 'remove', userId },
      });
      if (!error && data && !data.error) return;
    } catch {
      /* fall through to the RPC below for legacy managed subusers */
    }
  }
  await callRpc<void>('remove_subuser', { p_user_id: userId });
}

/** Reset only a managed staff login password. */
export async function resetSubuserPassword(userId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('managed-staff', {
    body: { action: 'reset', userId },
  });
  if (error) throw new Error(error.message);
  if (!data || data.error) throw new Error(String(data?.error || 'Could not reset staff password.'));
  return String(data.temporaryPassword);
}

/** Resolve whether the signed-in user is a member of another account. */
export async function getMyAccountMembership(): Promise<AccountMembership> {
  const r = await callRpc<Record<string, unknown> | null>('get_my_account_membership', {});
  if (!r) return { isSubuser: false };
  return {
    isSubuser: Boolean(r.is_subuser),
    ownerId: r.owner_id ? String(r.owner_id) : null,
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    memberRole: (r.member_role as MemberRole) || null,
    status: (r.status as TeamMember['status']) || null,
  };
}

/** List client-specific permission grants for an invited team member. */
export async function listSubuserClientPermissions(userId: string): Promise<ClientPermissionAssignment[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_subuser_client_permissions', {
    p_user_id: userId,
  });
  return (rows || []).map((r) => ({
    clientId: String(r.client_id),
    clientName: r.client_name ? String(r.client_name) : null,
    permissions: (r.permissions || {}) as Record<string, boolean>,
  }));
}

/** Replace the permission grant for one member on one client. */
export async function setSubuserClientPermissions(
  userId: string,
  clientId: string,
  permissions: Record<string, boolean>
): Promise<void> {
  await callRpc<void>('set_subuser_client_permissions', {
    p_user_id: userId,
    p_client_id: clientId,
    p_permissions: permissions,
  });
}
