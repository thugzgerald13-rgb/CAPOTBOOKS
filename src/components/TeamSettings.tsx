import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Trash2,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Info,
  AlertTriangle,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  inviteSubuser,
  updateSubuserRole,
  setSubuserStatus,
  removeSubuser,
  resetSubuserPassword,
  SubusersNotEnabledError,
} from '../lib/subusers';
import type { MemberRole, TeamMember } from '../types';
import { ALL_PERMISSIONS } from '../lib/accessControl';
import {
  MEMBER_ROLE_PERMISSIONS,
  PERMISSION_LABELS,
  MATRIX_ROLES,
  roleHasPermission,
  MEMBER_ROLE_LABELS,
} from '../lib/teamPermissions';

const ROLE_OPTIONS: { value: MemberRole; label: string; desc: string }[] = [
  { value: 'accountant', label: 'Accountant', desc: 'Full access to books, reports and compliance.' },
  { value: 'bookkeeper', label: 'Bookkeeper', desc: 'Data entry across sales, purchases and journals.' },
  { value: 'staff', label: 'Staff', desc: 'Limited day-to-day transaction entry.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access to reports and records.' },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

function SecretReveal({
  email,
  password,
  existingUser,
  invitationPending = false,
  onDismiss,
}: {
  email: string;
  password: string | null;
  existingUser: boolean;
  invitationPending?: boolean;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 mb-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-emerald-900 dark:text-emerald-100">
            {invitationPending ? 'Invitation created' : existingUser ? 'Account linked' : 'Subuser created'}
          </p>
          <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1 break-all">
            {invitationPending ? (
              <>
                <span className="font-semibold">{email}</span> has a pending invitation. They must
                sign in or create a CAPOT account using this exact email address. Once authenticated,
                CAPOT will automatically connect their account to your team and apply the selected role.
              </>
            ) : existingUser ? (
              <>
                <span className="font-semibold">{email}</span> already has a CAPOT login. They now
                share your account data and can sign in with their existing password.
              </>
            ) : (
              <>
                <span className="font-semibold">{email}</span> can sign in with the temporary
                password below. Share it securely — it is shown only once. After signing in, they
                can change it from <span className="font-semibold">Settings → Account Settings</span>.
              </>
            )}
          </p>
          {password && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <code className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700 font-mono text-sm text-slate-900 dark:text-slate-100 select-all">
                {password}
              </code>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <button
            onClick={onDismiss}
            className="mt-3 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Dismiss (password will not be shown again)
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamSettings() {
  const { user, userRole, subusersEnabled, isSubuser, membership, teamMembers, refreshTeamMembers } =
    useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('bookkeeper');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notEnabled, setNotEnabled] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string | null; existingUser: boolean; invitationPending?: boolean } | null>(null);
  const [resetSecret, setResetSecret] = useState<{ email: string; password: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSecret(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const result = await inviteSubuser(email, displayName, memberRole);
      setSecret({ email: result.email, password: result.temporaryPassword, existingUser: result.existingUser, invitationPending: result.invitationPending });
      setEmail('');
      setDisplayName('');
      setMemberRole('bookkeeper');
      await refreshTeamMembers();
    } catch (err) {
      if (err instanceof SubusersNotEnabledError) {
        setNotEnabled(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not invite subuser.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, role: MemberRole) => {
    try {
      await updateSubuserRole(member.userId, role);
      await refreshTeamMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.');
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    try {
      await setSubuserStatus(member.userId, member.status === 'disabled' ? 'active' : 'disabled');
      await refreshTeamMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    try {
      await removeSubuser(confirmRemove.userId);
      setConfirmRemove(null);
      await refreshTeamMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove subuser.');
    }
  };

  const handleResetPassword = async (member: TeamMember) => {
    try {
      const pw = await resetSubuserPassword(member.userId);
      setResetSecret({ email: member.email, password: pw });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    }
  };

  if (notEnabled || !subusersEnabled) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Team &amp; Subusers</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Invite team members to share your account.</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-100">Subusers are not enabled yet</p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                  Run <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs">scripts/subusers_migration.sql</code>{' '}
                  in your Supabase SQL Editor (Project → SQL Editor → New query → paste → Run). It creates the
                  <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs"> account_members</code> table,
                  the invite/reset/remove RPCs, and extends Row Level Security so subusers share your clients and data.
                  See <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs">SUBUSER_SETUP.md</code> for the full runbook.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Team &amp; Subusers</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isSubuser
                  ? 'You are a team member on this account.'
                  : `Invite subusers to share your ${userRole === 'accountant' ? 'accounting practice' : 'business'} account.`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {isSubuser && (
            <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-5 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-sm text-cyan-900 dark:text-cyan-100">
                <p className="font-bold">Signed in as a team member</p>
                <p className="mt-1 text-cyan-800 dark:text-cyan-300">
                  This account is owned by <span className="font-semibold">{membership.ownerEmail ?? 'the account holder'}</span>.
                  Your role: <span className="font-semibold capitalize">{roleLabel(membership.memberRole ?? 'staff')}</span>.
                  You share the owner&apos;s clients, books and files. Only the owner can invite or remove members.
                </p>
              </div>
            </div>
          )}

          {!isSubuser && (
            <>
              {secret && (
                <SecretReveal email={secret.email} password={secret.password} existingUser={secret.existingUser} invitationPending={secret.invitationPending} onDismiss={() => setSecret(null)} />
              )}
              {resetSecret && (
                <SecretReveal email={resetSecret.email} password={resetSecret.password} existingUser={false} onDismiss={() => setResetSecret(null)} />
              )}

              <form onSubmit={handleInvite} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">Invite a subuser</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email *</label>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Display name</label>
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Maria, Bookkeeper"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label>
                    <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as MemberRole)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                      {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{ROLE_OPTIONS.find((r) => r.value === memberRole)?.desc}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ALL_PERMISSIONS.map((p) => {
                    const allowed = (MEMBER_ROLE_PERMISSIONS[memberRole] || []).includes(p.key);
                    return (
                      <span
                        key={p.key}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border ${
                          allowed
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 border-slate-200 dark:border-slate-700 line-through'
                        }`}
                      >
                        {allowed ? '✓' : '✕'} {p.label}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button type="submit" disabled={busy}
                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 disabled:opacity-50">
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    {busy ? 'Sending...' : 'Send Invitation'}
                  </button>
                  <span className="text-xs text-slate-400">Signed in as {user?.email}</span>
                </div>
              </form>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">What each role can do</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Invited users keep their own CAPOT account permanently — removing them only revokes access to your
                  books; their login and history elsewhere are untouched. Permissions are enforced server-side.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="py-2 pr-3 font-bold">Permission</th>
                        {MATRIX_ROLES.map((r) => (
                          <th key={r} className="py-2 px-2 font-bold text-center capitalize">
                            {r === 'owner' ? 'Owner (you)' : MEMBER_ROLE_LABELS[r as MemberRole]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      {ALL_PERMISSIONS.map((p) => (
                        <tr key={p.key}>
                          <td className="py-2 pr-3 text-slate-700 dark:text-slate-200 font-medium">{p.label}</td>
                          {MATRIX_ROLES.map((r) => (
                            <td key={r} className="py-2 px-2 text-center">
                              {roleHasPermission(r, p.key) ? (
                                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold">✓</span>
                              ) : (
                                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">Team members ({teamMembers.length})</h3>
                  <button onClick={refreshTeamMembers} className="p-2 text-slate-400 hover:text-cyan-600 transition-colors" title="Refresh">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                {teamMembers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-10 text-center">
                    <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No subusers yet. Invite your accountant, bookkeeper or staff above.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left px-4 py-3 font-bold">Member</th>
                            <th className="text-left px-4 py-3 font-bold">Role</th>
                            <th className="text-left px-4 py-3 font-bold">Status</th>
                            <th className="text-left px-4 py-3 font-bold">Last sign-in</th>
                            <th className="text-right px-4 py-3 font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                          {teamMembers.map((m) => (
                            <tr key={m.id} className={m.status === 'disabled' ? 'opacity-50' : ''}>
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800 dark:text-slate-100">{m.displayName || '—'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{m.email}</p>
                                {m.memberKind === 'independent' && (
                                  <span className="inline-flex mt-1 px-1.5 py-0.5 rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300 text-[10px] font-bold">Own account</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <select value={m.memberRole} onChange={(e) => handleRoleChange(m, e.target.value as MemberRole)}
                                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                                  {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                                  m.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : m.status === 'invited' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                  {m.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                  {m.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{m.lastLogin ? new Date(m.lastLogin).toLocaleString() : 'Never'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {m.memberKind !== 'independent' && (
                                    <button onClick={() => handleResetPassword(m)} className="p-2 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors" title="Reset password">
                                      <KeyRound className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button onClick={() => handleToggleStatus(m)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title={m.status === 'disabled' ? 'Enable access' : 'Disable access'}>
                                    <Ban className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setConfirmRemove(m)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove from account">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmRemove(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Remove subuser?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              <span className="font-semibold">{confirmRemove.email}</span> will lose access to your account data.
              Their login is kept (they may use it elsewhere) — only the link to your account is removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">Cancel</button>
              <button onClick={handleRemove} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-all active:scale-95">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
