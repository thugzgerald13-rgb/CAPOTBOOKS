// Subuser / team-member service.
// All mutations go through SECURITY DEFINER RPCs (see
// scripts/subusers_migration.sql) because the anon key cannot create or
// modify auth.users rows directly. Every call degrades gracefully if the
// migration has not been applied yet (the RPC simply returns an error, which
// the UI surfaces as "feature not enabled").
import { supabase } from './supabase';
import type {
  TeamMember,
  MemberRole,
  InviteResult,
  AccountMembership,
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

/** Invite (or link) a subuser to the current account holder's account.
 *
 * Tries the `create-staff-user` Edge Function FIRST: it creates the auth user
 * WITH a password (email auto-confirmed), auto-approves the profile, and links
 * membership — so staff/employees never have to sign up themselves. If the
 * Edge Function isn't deployed, falls back to the legacy invite_subuser RPC
 * (which only links an already-existing account).
 */
export async function inviteSubuser(
  email: string,
  displayName: string,
  memberRole: MemberRole
): Promise<InviteResult> {
  try {
    const { data, error } = await supabase.functions.invoke('create-staff-user', {
      body: {
        email: email.trim(),
        display_name: displayName.trim() || null,
        member_role: memberRole,
      },
    });
    if (!error && data?.user_id) {
      return {
        userId: String(data.user_id),
        email: String(data.email),
        temporaryPassword: data.temporary_password ? String(data.temporary_password) : null,
        existingUser: Boolean(data.existing_user),
      };
    }
  } catch {
    /* Edge Function not deployed — fall through to legacy RPC below. */
  }

  const r = await callRpc<Record<string, unknown>>('invite_subuser', {
    p_email: email.trim(),
    p_display_name: displayName.trim() || null,
    p_member_role: memberRole,
  });
  return {
    userId: String(r.user_id),
    email: String(r.email),
    temporaryPassword: r.temporary_password ? String(r.temporary_password) : null,
    existingUser: Boolean(r.existing_user),
  };
}

/** List subusers invited by the current account holder. */
export async function listMySubusers(): Promise<TeamMember[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_my_subusers', {});
  return (rows || []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    email: String(r.email),
    displayName: (r.display_name as string) || null,
    memberRole: (r.member_role as MemberRole) || 'staff',
    status: (r.status as TeamMember['status']) || 'active',
    lastLogin: (r.last_login as string) || null,
    createdAt: (r.created_at as string) || null,
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

/** Remove a subuser from the current account (does not delete their login). */
export async function removeSubuser(userId: string): Promise<void> {
  await callRpc<void>('remove_subuser', { p_user_id: userId });
}

/** Reset a subuser's password; returns a new one-time temporary password. */
export async function resetSubuserPassword(userId: string): Promise<string> {
  const pw = await callRpc<string>('reset_subuser_password', { p_user_id: userId });
  return String(pw);
}

/** Resolve whether the signed-in user is themselves a subuser of another account. */
export async function getMyAccountMembership(): Promise<AccountMembership> {
  const r = await callRpc<Record<string, unknown>>('get_my_account_membership', {});
  if (!r) return { isSubuser: false };
  return {
    isSubuser: Boolean(r.is_subuser),
    ownerId: r.owner_id ? String(r.owner_id) : null,
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    memberRole: (r.member_role as MemberRole) || null,
    status: (r.status as TeamMember['status']) || null,
  };
}
