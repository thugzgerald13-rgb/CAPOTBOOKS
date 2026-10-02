// Team-member service.
//
// Independent invitations intentionally do NOT create an auth account for the
// invitee. The inviter creates a pending invitation keyed to the invitee's
// email. Once that person signs in (or signs up) with that same email,
// AuthContext claims the invitation and the account link is created server-side.
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
 * Create an invitation without creating an auth.users record.
 *
 * The invitee keeps their own CAPOT login. On their next authenticated
 * session, AuthContext calls claimTeamInvitation(), which links that existing
 * account to this owner's clients and applies the invited role.
 */
export async function inviteSubuser(
  email: string,
  displayName: string,
  memberRole: MemberRole
): Promise<InviteResult> {
  const rows = await callRpc<Array<Record<string, unknown>>>('send_team_invitation', {
    p_email: email.trim(),
    p_display_name: displayName.trim() || null,
    p_member_role: memberRole,
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
      isSubuser: true,
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

/** Remove a subuser from the current account without deleting their login. */
export async function removeSubuser(userId: string): Promise<void> {
  await callRpc<void>('remove_subuser', { p_user_id: userId });
}

/** Reset a managed subuser's password. Independent members own their login. */
export async function resetSubuserPassword(userId: string): Promise<string> {
  const pw = await callRpc<string>('reset_subuser_password', { p_user_id: userId });
  return String(pw);
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
