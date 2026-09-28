import React, { useEffect, useState } from 'react';
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
  Ban,
  Mail,
  LogOut,
  X,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  inviteSubuser,
  updateSubuserRole,
  setSubuserStatus,
  removeSubuser,
  resetSubuserPassword,
  sendIndependentInvite,
  listMyInvitations,
  revokeInvitation,
  acceptInvitation,
  declineInvitation,
  leaveMyMembership,
  SubusersNotEnabledError,
} from '../lib/subusers';
import type { MemberRole, TeamMember, PendingInvitation } from '../types';

const ROLE_OPTIONS: { value: MemberRole; label: string; desc: string }[] = [
  { value: 'accountant', label: 'Accountant', desc: 'Full access to books, reports and compliance.' },
  { value: 'bookkeeper', label: 'Bookkeeper', desc: 'Data entry across sales, purchases and journals.' },
  { value: 'staff', label: 'Staff', desc: 'Limited day-to-day transaction entry.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access to reports and records.' },
];

type InviteMode = 'independent' | 'managed';

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

function kindBadge(kind: string) {
  if (kind === 'independent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        <UserCheck className="w-3 h-3" /> Own account
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      <KeyRound className="w-3 h-3" /> Managed login
    </span>
  );
}

function SecretReveal({
  title,
  children,
  onDismiss,
  tone = 'emerald',
}: {
  title: string;
  children: React.ReactNode;
  onDismiss: () => void;
  tone?: 'emerald' | 'cyan';
}) {
  const tones =
    tone === 'cyan'
      ? 'border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-100'
      : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100';
  return (
    <div className={`rounded-2xl border p-5 mb-6 ${tones}`}>
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold">{title}</p>
          <div className="text-sm mt-1 opacity-90">{children}</div>
          <button
            onClick={onDismiss}
            className="mt-3 text-xs font-bold opacity-70 hover:underline"
          >
            Dismiss (will not be shown again)
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide opacity-70 mb-1.5">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border font-mono text-sm select-all break-all">
          {value}
        </code>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold transition-all active:scale-95"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function TeamSettings() {
  const {
    user,
    userRole,
    subusersEnabled,
    isSubuser,
    membership,
    teamMembers,
    refreshTeamMembers,
    pendingInvites,
    refreshPendingInvites,
  } = useAuth();

  const [mode, setMode] = useState<InviteMode>('independent');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('bookkeeper');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notEnabled, setNotEnabled] = useState(false);
  const [managedSecret, setManagedSecret] = useState<{ email: string; password: string | null; existingUser: boolean } | null>(null);
  const [inviteSecret, setInviteSecret] = useState<{ email: string; token: string; hasExistingAccount: boolean } | null>(null);
  const [resetSecret, setResetSecret] = useState<{ email: string; password: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sentInvites, setSentInvites] = useState<PendingInvitation[]>([]);
  const [success, setSuccess] = useState('');

  const loadSentInvites = async () => {
    try {
      setSentInvites(await listMyInvitations());
    } catch (e) {
      if (!(e instanceof SubusersNotEnabledError)) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    if (subusersEnabled && !isSubuser) loadSentInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subusersEnabled, isSubuser]);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setManagedSecret(null);
    setInviteSecret(null);
    if (!validEmail) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'managed') {
        const result = await inviteSubuser(email, displayName, memberRole);
        setManagedSecret({
          email: result.email,
          password: result.temporaryPassword,
          existingUser: result.existingUser,
        });
      } else {
        const result = await sendIndependentInvite(email, displayName, memberRole);
        setInviteSecret({
          email: result.email,
          token: result.inviteToken,
          hasExistingAccount: result.hasExistingAccount,
        });
      }
      setEmail('');
      setDisplayName('');
      setMemberRole('bookkeeper');
      await refreshTeamMembers();
      await loadSentInvites();
    } catch (err) {
      if (err instanceof SubusersNotEnabledError) {
        setNotEnabled(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not send invitation.');
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
      setError(err instanceof Error ? err.message : 'Could not remove member.');
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

  const handleRevokeInvite = async (inv: PendingInvitation) => {
    try {
      await revokeInvitation(inv.id);
      await loadSentInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke invitation.');
    }
  };

  const handleAcceptInvite = async (token: string) => {
    setBusy(true);
    setError('');
    try {
      const ownerEmail = await acceptInvitation(token);
      setSuccess(`Joined ${ownerEmail ?? "the owner"}'s account. Reloading…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invitation.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineInvite = async (token: string) => {
    try {
      await declineInvitation(token);
      await refreshPendingInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline invitation.');
    }
  };

  const handleLeave = async () => {
    try {
      await leaveMyMembership();
      setSuccess('You have left the account. Reloading…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave account.');
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
                  and then <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs">scripts/subusers_invites_migration.sql</code>{' '}
                  in your Supabase SQL Editor (Project → SQL Editor → New query → paste → Run). See{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs">SUBUSER_SETUP.md</code> for the full runbook.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inviteLink = inviteSecret
    ? `${window.location.origin}/?invite=${inviteSecret.token}`
    : '';

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
                  : `Add people to your ${userRole === 'accountant' ? 'accounting practice' : 'business'} account.`}
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
          {success && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
              {success}
            </div>
          )}

          {/* ---- Subuser (member) view ---- */}
          {isSubuser && (
            <>
              <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-sm text-cyan-900 dark:text-cyan-100 flex-1">
                  <p className="font-bold">Signed in as a team member</p>
                  <p className="mt-1 text-cyan-800 dark:text-cyan-300">
                    This account is owned by <span className="font-semibold">{membership.ownerEmail ?? 'the account holder'}</span>.
                    Your role: <span className="font-semibold capitalize">{roleLabel(membership.memberRole ?? 'staff')}</span>.
                    {membership.memberKind === 'independent' ? (
                      <> You signed in with <span className="font-semibold">your own independent account</span> — it stays yours even if you leave.</>
                    ) : (
                      <> This is a managed login created by the account holder.</>
                    )}
                  </p>
                  {membership.memberKind === 'independent' && !confirmLeave && (
                    <button
                      onClick={() => setConfirmLeave(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-cyan-300 dark:border-cyan-700 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Leave this account (keep my own)
                    </button>
                  )}
                  {confirmLeave && (
                    <div className="mt-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-cyan-300 dark:border-cyan-700">
                      <p className="text-xs font-bold mb-2">Leave {membership.ownerEmail ?? "the owner"}'s account? You will lose access to their data, but your own account stays intact.</p>
                      <div className="flex gap-2">
                        <button onClick={handleLeave} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700">Yes, leave</button>
                        <button onClick={() => setConfirmLeave(false)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-bold">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {pendingInvites.length > 0 && (
                <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <h3 className="font-bold text-violet-900 dark:text-violet-100">Invitations for you ({pendingInvites.length})</h3>
                  </div>
                  <div className="space-y-3">
                    {pendingInvites.map((inv) => (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {inv.ownerDisplayName || inv.ownerEmail || 'An account holder'} invited you
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {inv.ownerEmail} · Role: <span className="font-semibold capitalize">{roleLabel(inv.memberRole)}</span>
                            {inv.expiresAt && ` · Expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptInvite(inv.inviteToken)}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineInvite(inv.inviteToken)}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---- Owner view ---- */}
          {!isSubuser && (
            <>
              {managedSecret && (
                <SecretReveal
                  title={managedSecret.existingUser ? 'Account linked' : 'Managed login created'}
                  onDismiss={() => setManagedSecret(null)}
                >
                  {managedSecret.existingUser ? (
                    <span className="font-semibold">{managedSecret.email}</span>
                  ) : (
                    <>
                      <span className="font-semibold">{managedSecret.email}</span> can sign in with the temporary
                      password below. Share it securely — shown only once. They can change it in Settings → Account Settings.
                    </>
                  )}
                  {managedSecret.password && (
                    <CopyField value={managedSecret.password} label="Temporary password" />
                  )}
                </SecretReveal>
              )}

              {inviteSecret && (
                <SecretReveal
                  title="Independent invitation sent"
                  tone="cyan"
                  onDismiss={() => setInviteSecret(null)}
                >
                  <p>
                    <span className="font-semibold">{inviteSecret.email}</span> keeps their own CAPOT account.
                    {inviteSecret.hasExistingAccount
                      ? ' They already have an account — share the link below and they accept after signing in.'
                      : ' They sign up for their own free account first, then accept via the link below. No account was created for them.'}
                  </p>
                  <CopyField value={inviteLink} label="Invitation link (share this)" />
                  <CopyField value={inviteSecret.token} label="Invitation code" />
                </SecretReveal>
              )}

              {resetSecret && (
                <SecretReveal title="Password reset" onDismiss={() => setResetSecret(null)}>
                  <span className="font-semibold">{resetSecret.email}</span> — new one-time temporary password:
                  <CopyField value={resetSecret.password} label="New temporary password" />
                </SecretReveal>
              )}

              {/* Mode toggle */}
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('independent')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    mode === 'independent'
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className={`w-4 h-4 ${mode === 'independent' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Invite (their own account)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    For accountants &amp; partners. They keep full ownership of their account; you only grant access. They accept the invite themselves.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('managed')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    mode === 'managed'
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className={`w-4 h-4 ${mode === 'managed' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Create managed login</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    For staff who don&apos;t want to sign up. You create their email + password directly; the login is connected to your account.
                  </p>
                </button>
              </div>

              {/* Invite / create form */}
              <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  {mode === 'independent' ? (
                    <Mail className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  ) : (
                    <UserPlus className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  )}
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">
                    {mode === 'independent' ? 'Send an independent invitation' : 'Create a managed login'}
                  </h3>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Display name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Maria, Bookkeeper"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label>
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value as MemberRole)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  {ROLE_OPTIONS.find((r) => r.value === memberRole)?.desc}
                  {mode === 'independent' && (
                    <span className="block mt-1 text-violet-600 dark:text-violet-400">
                      Their account stays fully independent — you can revoke access anytime without affecting their account.
                    </span>
                  )}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : mode === 'independent' ? <Mail className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    {busy ? 'Sending...' : mode === 'independent' ? 'Send Invitation' : 'Create Login'}
                  </button>
                  <span className="text-xs text-slate-400">Signed in as {user?.email}</span>
                </div>
              </form>

              {/* Pending independent invites (sent by owner) */}
              {sentInvites.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">Pending invitations ({sentInvites.length})</h3>
                    <button onClick={loadSentInvites} className="p-2 text-slate-400 hover:text-cyan-600 transition-colors" title="Refresh">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left px-4 py-3 font-bold">Invitee</th>
                            <th className="text-left px-4 py-3 font-bold">Role</th>
                            <th className="text-left px-4 py-3 font-bold">Expires</th>
                            <th className="text-right px-4 py-3 font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                          {sentInvites.map((inv) => (
                            <tr key={inv.id}>
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800 dark:text-slate-100">{inv.displayName || '—'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{inv.inviteeEmail}</p>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold capitalize text-slate-600 dark:text-slate-300">
                                {roleLabel(inv.memberRole)}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleRevokeInvite(inv)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  title="Revoke invitation"
                                >
                                  <X className="w-3.5 h-3.5" /> Revoke
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Team members */}
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
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No members yet. Add someone above.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left px-4 py-3 font-bold">Member</th>
                            <th className="text-left px-4 py-3 font-bold">Type</th>
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
                              </td>
                              <td className="px-4 py-3">{kindBadge(m.memberKind)}</td>
                              <td className="px-4 py-3">
                                <select
                                  value={m.memberRole}
                                  onChange={(e) => handleRoleChange(m, e.target.value as MemberRole)}
                                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                  m.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : m.status === 'invited'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                  {m.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                {m.lastLogin ? new Date(m.lastLogin).toLocaleDateString() : 'Never'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {m.memberKind === 'managed' && (
                                    <button
                                      onClick={() => handleResetPassword(m)}
                                      className="p-2 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors"
                                      title="Reset password"
                                    >
                                      <KeyRound className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleToggleStatus(m)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                    title={m.status === 'disabled' ? 'Enable access' : 'Disable access'}
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemove(m)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Remove member"
                                  >
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

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmRemove(null)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Remove member?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Remove <span className="font-semibold">{confirmRemove.email}</span> from your account?
              {confirmRemove.memberKind === 'independent'
                ? ' Their own account stays fully intact — they just lose access to your data.'
                : ' Their managed login is kept (so it can be re-linked later) but no longer has access.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
