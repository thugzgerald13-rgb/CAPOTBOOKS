// Subuser / team-member service (hybrid model).
//
// Two member kinds:
//   'managed'     -> owner creates the login directly (staff who don't sign up
//                    themselves). Backed by invite_subuser() RPC.
//   'independent' -> owner sends a pending invite; the invitee accepts from
//                    THEIR OWN account. Their account stays fully independent.
//
// All mutations go through SECURITY DEFINER RPCs (see
// scripts/subusers_migration.sql + scripts/subusers_invites_migration.sql)
// because the anon key cannot create or modify auth.users rows directly.
// Every call degrades gracefully if the migration has not been applied yet
// (the RPC simply returns an error, which the UI surfaces as
// "feature not enabled").
import { supabase } from './supabase';
import type {
  TeamMember,
  MemberRole,
  InviteResult,
  AccountMembership,
  IndependentInviteResult,
  PendingInvitation,
  PendingInviteForMe,
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

// ---------------------------------------------------------------------------
// Managed logins — owner creates the login directly (staff, no sign-up needed)
// ---------------------------------------------------------------------------

/** Create (or link) a MANAGED login for a teammate. Returns a temp password. */
export async function inviteSubuser(
  email: string,
  displayName: string,
  memberRole: MemberRole
): Promise<InviteResult> {
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
    memberKind: 'managed',
  };
}

// ---------------------------------------------------------------------------
// Independent invites — pending invite, invitee accepts from their own account
// ---------------------------------------------------------------------------

/** Send an independent invite (no account created; invitee accepts later). */
export async function sendIndependentInvite(
  email: string,
  displayName: string,
  memberRole: MemberRole
): Promise<IndependentInviteResult> {
  const r = await callRpc<Record<string, unknown>>('send_independent_invite', {
    p_email: email.trim(),
    p_display_name: displayName.trim() || null,
    p_member_role: memberRole,
  });
  return {
    email: String(r.email),
    inviteToken: String(r.invite_token),
    hasExistingAccount: Boolean(r.has_existing_account),
  };
}

/** Pending independent invites SENT BY the current owner. */
export async function listMyInvitations(): Promise<PendingInvitation[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_my_invitations', {});
  return (rows || []).map((r) => ({
    id: String(r.id),
    inviteeEmail: String(r.invitee_email),
    displayName: (r.display_name as string) || null,
    memberRole: (r.member_role as MemberRole) || 'staff',
    status: (r.status as PendingInvitation['status']) || 'pending',
    createdAt: (r.created_at as string) || null,
    expiresAt: (r.expires_at as string) || null,
  }));
}

/** Owner cancels a pending independent invite. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await callRpc<void>('revoke_invitation', { p_invitation_id: invitationId });
}

/** Pending invites ADDRESSED TO the current signed-in user (invitee view). */
export async function listMyPendingInvites(): Promise<PendingInviteForMe[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_my_pending_invites', {});
  return (rows || []).map((r) => ({
    id: String(r.id),
    inviteToken: String(r.invite_token),
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    ownerDisplayName: (r.owner_display_name as string) || null,
    memberRole: (r.member_role as MemberRole) || 'staff',
    createdAt: (r.created_at as string) || null,
    expiresAt: (r.expires_at as string) || null,
  }));
}

/** Invitee accepts an independent invite from their own (signed-in) account. */
export async function acceptInvitation(token: string): Promise<string | null> {
  const r = await callRpc<Record<string, unknown>>('accept_invitation', { p_token: token });
  return r?.owner_email ? String(r.owner_email) : null;
}

/** Invitee declines an independent invite. */
export async function declineInvitation(token: string): Promise<void> {
  await callRpc<void>('decline_invitation', { p_token: token });
}

/** A member leaves the owner's account; their own account stays intact. */
export async function leaveMyMembership(): Promise<void> {
  await callRpc<void>('leave_my_membership', {});
}

// ---------------------------------------------------------------------------
// Shared management (both kinds)
// ---------------------------------------------------------------------------

/** List subusers/members invited or created by the current account holder. */
export async function listMySubusers(): Promise<TeamMember[]> {
  const rows = await callRpc<Array<Record<string, unknown>>>('list_my_subusers', {});
  return (rows || []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    email: String(r.email),
    displayName: (r.display_name as string) || null,
    memberRole: (r.member_role as MemberRole) || 'staff',
    memberKind: ((r.member_kind as string) || 'managed') as TeamMember['memberKind'],
    status: (r.status as TeamMember['status']) || 'active',
    lastLogin: (r.last_login as string) || null,
    createdAt: (r.created_at as string) || null,
  }));
}

/** Change a member's role. */
export async function updateSubuserRole(
  userId: string,
  memberRole: MemberRole
): Promise<void> {
  await callRpc<void>('update_subuser_role', {
    p_user_id: userId,
    p_member_role: memberRole,
  });
}

/** Toggle a member between active and disabled. */
export async function setSubuserStatus(
  userId: string,
  status: TeamMember['status']
): Promise<void> {
  await callRpc<void>('set_subuser_status', {
    p_user_id: userId,
    p_status: status,
  });
}

/** Remove a member from the current account (does not delete their login). */
export async function removeSubuser(userId: string): Promise<void> {
  await callRpc<void>('remove_subuser', { p_user_id: userId });
}

/** Reset a managed member's password; returns a new one-time temporary password. */
export async function resetSubuserPassword(userId: string): Promise<string> {
  const pw = await callRpc<string>('reset_subuser_password', { p_user_id: userId });
  return String(pw);
}

/** Resolve whether the signed-in user is themselves a member of another account. */
export async function getMyAccountMembership(): Promise<AccountMembership> {
  const r = await callRpc<Record<string, unknown>>('get_my_account_membership', {});
  if (!r) return { isSubuser: false };
  return {
    isSubuser: Boolean(r.is_subuser),
    ownerId: r.owner_id ? String(r.owner_id) : null,
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    memberRole: (r.member_role as MemberRole) || null,
    status: (r.status as TeamMember['status']) || null,
    memberKind: (r.member_kind as AccountMembership['memberKind']) || null,
  };
}
