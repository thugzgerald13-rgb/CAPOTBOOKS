import React, { useEffect, useMemo, useState } from 'react';
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
  SlidersHorizontal,
  MoreHorizontal,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Mail,
  BadgeCheck,
  Eye,
  PencilLine,
  ShieldPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  inviteSubuser,
  updateSubuserRole,
  setSubuserStatus,
  removeSubuser,
  resetSubuserPassword,
  listSubuserClientPermissions,
  setSubuserClientPermissions,
  listSubuserClientUiPermissions,
  setSubuserClientUiPermissions,
  listMySubusers,
  SubusersNotEnabledError,
} from '../lib/subusers';
import type { MemberRole, TeamMember } from '../types';
import { useAccounting } from '../context/AccountingContext';
import { ALL_PERMISSIONS, type Permission } from '../lib/accessControl';
import { MEMBER_ROLE_PERMISSIONS } from '../lib/teamPermissions';
import { GranularPermissionEditor } from './GranularPermissionEditor';
import {
  buildDefaultUiPermissions,
  AVAILABLE_GRANULAR_PERMISSION_KEYS,
  GRANULAR_PERMISSION_REQUIREMENTS,
} from '../lib/granularPermissions';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: MemberRole; label: string; desc: string }[] = [
  { value: 'accountant', label: 'Accountant', desc: 'Professional accounting access for multiple client businesses.' },
  { value: 'bookkeeper', label: 'Bookkeeper', desc: 'Professional bookkeeping and transaction-entry access.' },
  { value: 'staff', label: 'Staff', desc: 'Day-to-day staff login. You choose exactly what they can use.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access to reports and records.' },
];

const BASE_KEYS = new Set<string>(ALL_PERMISSIONS.map((p) => p.key));

/** Plain-language description of every base capability. */
const PERMISSION_HELP: Record<Permission, string> = {
  edit_transactions: 'Create and edit invoices, bills, sales, purchases, journal entries and uploads.',
  delete_transactions: 'Delete transactions and records.',
  approve_journal: 'Approve journal entries.',
  view_reports: 'Open journals, ledgers, trial balance and financial reports.',
  manage_settings: 'Chart of accounts, business profiles, TIN library and other settings.',
  export_data: 'Export, print and download data.',
  lock_period: 'Lock an accounting period so it can no longer be changed.',
  manage_users: 'Invite, change and remove team members (owner only).',
};

type PresetId = 'full' | 'entry' | 'view' | 'custom';

/** One-click starting points. Owners can still tick/untick anything after. */
const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string; desc: string; icon: React.ElementType; base: Permission[] }[] = [
  {
    id: 'full',
    label: 'Full access',
    desc: 'Everything except managing people.',
    icon: BadgeCheck,
    base: ['edit_transactions', 'delete_transactions', 'approve_journal', 'view_reports', 'manage_settings', 'export_data', 'lock_period'],
  },
  {
    id: 'entry',
    label: 'Data entry',
    desc: 'Enter transactions and see reports.',
    icon: PencilLine,
    base: ['edit_transactions', 'view_reports', 'export_data'],
  },
  {
    id: 'view',
    label: 'View only',
    desc: 'Read reports and records. No changes.',
    icon: Eye,
    base: ['view_reports', 'export_data'],
  },
];

/** Capabilities a given kind of member may ever hold (server-side ceiling). */
const STAFF_ALLOWED: Permission[] = MEMBER_ROLE_PERMISSIONS.staff || [];
const INVITE_ALLOWED: Permission[] = MEMBER_ROLE_PERMISSIONS.accountant || [];

function deriveRoleFromPermissions(selected: Permission[]): MemberRole {
  const set = new Set(selected);
  const ordered: MemberRole[] = ['viewer', 'bookkeeper', 'accountant'];
  for (const role of ordered) {
    const allowed = new Set(MEMBER_ROLE_PERMISSIONS[role] || []);
    if ([...set].every((p) => allowed.has(p))) return role;
  }
  return 'accountant';
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

/** Base capability map + the matching sidebar/button/dropdown defaults. */
function buildAccess(base: Permission[]): Record<string, boolean> {
  const baseMap: Record<string, boolean> = Object.fromEntries(base.map((p) => [p, true]));
  const defaults = buildDefaultUiPermissions(baseMap);
  // Only pages that are available to users are ever selectable/saved.
  const ui = Object.fromEntries(AVAILABLE_GRANULAR_PERMISSION_KEYS.map((key) => [key, Boolean(defaults[key])]));
  return { ...baseMap, ...ui };
}

function presetAccess(id: Exclude<PresetId, 'custom'>, allowed: Permission[]): Record<string, boolean> {
  const preset = PRESETS.find((p) => p.id === id)!;
  return buildAccess(preset.base.filter((p) => allowed.includes(p)));
}

function selectedBase(value: Record<string, boolean>, allowed: Permission[]): Permission[] {
  return allowed.filter((p) => Boolean(value[p]));
}

/** Which preset (if any) the current selection exactly matches. */
function detectPreset(value: Record<string, boolean>, allowed: Permission[]): PresetId {
  const current = selectedBase(value, allowed);
  for (const preset of PRESETS) {
    const wanted = preset.base.filter((p) => allowed.includes(p));
    if (wanted.length !== current.length || !wanted.every((p) => current.includes(p))) continue;
    const defaults = buildDefaultUiPermissions(Object.fromEntries(wanted.map((p) => [p, true])));
    const same = AVAILABLE_GRANULAR_PERMISSION_KEYS.every((key) => Boolean(value[key]) === Boolean(defaults[key]));
    if (same) return preset.id;
  }
  return 'custom';
}

/** Toggle one base capability and keep dependent fine-grained keys consistent. */
function toggleBaseCapability(value: Record<string, boolean>, permission: Permission): Record<string, boolean> {
  const enabled = !Boolean(value[permission]);
  const next: Record<string, boolean> = { ...value, [permission]: enabled };
  Object.entries(GRANULAR_PERMISSION_REQUIREMENTS).forEach(([key, required]) => {
    if (required === permission) next[key] = enabled;
  });
  return next;
}

function initials(member: { displayName?: string | null; email: string }) {
  const source = (member.displayName || member.email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500';
const labelCls = 'block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5';

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function SecretReveal({
  email,
  password,
  existingUser,
  invitationPending = false,
  ownerClientRelationship = false,
  managedStaff = false,
  onDismiss,
}: {
  email: string;
  password: string | null;
  existingUser: boolean;
  invitationPending?: boolean;
  ownerClientRelationship?: boolean;
  managedStaff?: boolean;
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
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-emerald-900 dark:text-emerald-100">
            {managedStaff
              ? 'Staff login created'
              : invitationPending
                ? 'Invitation sent'
                : existingUser
                  ? 'Account linked'
                  : 'Team member created'}
          </p>
          <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1 break-words">
            {managedStaff ? (
              <>
                <span className="font-semibold">{email}</span> can now sign in with the login name and password you set.
                Their access is limited to the clients and functions you granted.
              </>
            ) : invitationPending ? (
              ownerClientRelationship ? (
                <>
                  <span className="font-semibold">{email}</span> keeps their own CAPOT account. Once they sign in, your
                  business appears in their <span className="font-semibold">Client Profiles</span>.
                </>
              ) : (
                <>
                  <span className="font-semibold">{email}</span> signs in with their own CAPOT login using this exact
                  email. After that they can work in your account with the access you granted.
                </>
              )
            ) : existingUser ? (
              <>
                <span className="font-semibold">{email}</span> already has a CAPOT login and now shares your account.
              </>
            ) : (
              <>
                <span className="font-semibold">{email}</span> can sign in with the temporary password below. It is
                shown only once — share it securely.
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
                {copied ? 'Copied' : 'Copy password'}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, closeDisabled]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={() => { if (!closeDisabled) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl w-full ${wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl'} max-h-[94vh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 break-words">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
            className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Disclosure({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
          {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/**
 * Shared access editor: pick a preset → optionally tweak functions → optionally
 * fine-tune sidebar / buttons / dropdowns. Used by both "Add member" and
 * "Manage access" so the experience is identical.
 */
function AccessEditor({
  value,
  onChange,
  memberRole,
  allowed,
  disabled = false,
  allowedNote,
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  memberRole: MemberRole;
  allowed: Permission[];
  disabled?: boolean;
  allowedNote?: string;
}) {
  const preset = detectPreset(value, allowed);
  const count = selectedBase(value, allowed).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">Start from a template</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(presetAccess(p.id, allowed))}
                aria-pressed={active}
                className={`text-left rounded-xl border p-3 transition-all disabled:opacity-50 ${
                  active
                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 ring-1 ring-cyan-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 bg-white dark:bg-slate-900/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${active ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-400'}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.label}</span>
                  {active && <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-300 ml-auto" />}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{p.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          {preset === 'custom'
            ? `Custom selection · ${count} of ${allowed.length} functions on.`
            : 'Templates are only a starting point — change anything below.'}
        </p>
      </div>

      <Disclosure title="Functions" hint={`${count} of ${allowed.length} enabled — what this person is allowed to do`}>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALL_PERMISSIONS.map((p) => {
            const canGrant = allowed.includes(p.key);
            const on = canGrant && Boolean(value[p.key]);
            return (
              <button
                type="button"
                key={p.key}
                disabled={disabled || !canGrant}
                onClick={() => onChange(toggleBaseCapability(value, p.key))}
                aria-pressed={on}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  !canGrant ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'
                } ${
                  on
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <span
                  className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-md border-2 shrink-0 ${
                    on ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {on && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{p.label}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {canGrant ? PERMISSION_HELP[p.key] : allowedNote || 'Reserved for the account owner.'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Disclosure>

      <Disclosure
        title="Sidebar, buttons & dropdowns"
        hint="Optional fine-tuning — hide individual pages, buttons and dropdown options"
      >
        <GranularPermissionEditor
          value={value}
          memberRole={memberRole}
          basePermissions={Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, Boolean(value[p.key])]))}
          disabled={disabled}
          onChange={(next) => onChange({ ...value, ...next })}
        />
      </Disclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add member (stepper)
// ---------------------------------------------------------------------------

type InviteType = 'staff' | 'email';
type Secret = { email: string; password: string | null; existingUser: boolean; invitationPending?: boolean; managedStaff?: boolean };

function AddMemberModal({
  isBusinessOwner,
  profiles,
  onClose,
  onCreated,
  onNotEnabled,
  refreshTeamMembers,
}: {
  isBusinessOwner: boolean;
  profiles: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (secret: Secret) => void;
  onNotEnabled: () => void;
  refreshTeamMembers: () => Promise<void>;
}) {
  const [type, setType] = useState<InviteType | null>(null);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [staffLogin, setStaffLogin] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const steps: string[] = type === 'staff' ? ['Type', 'Details', 'Clients', 'Access'] : ['Type', 'Details', 'Access'];
  const stepName = steps[step];
  const allowed = type === 'staff' ? STAFF_ALLOWED : INVITE_ALLOWED;

  const chooseType = (next: InviteType) => {
    setType(next);
    setError('');
    // Sensible starting point — the owner can change anything afterwards.
    setAccess(presetAccess('entry', next === 'staff' ? STAFF_ALLOWED : INVITE_ALLOWED));
    setStep(1);
  };

  const validate = (): string => {
    if (stepName === 'Details') {
      if (type === 'staff') {
        if (!/^[a-z0-9._-]{3,32}$/.test(staffLogin.trim().toLowerCase())) {
          return 'Login name must be 3–32 characters: lowercase letters, numbers, dot, underscore or hyphen.';
        }
        if (staffPassword.length < 6) return 'Password must be at least 6 characters.';
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        return 'Enter a valid email address.';
      }
    }
    if (stepName === 'Clients' && clientIds.length === 0) {
      return 'Select at least one Client Profile this staff login may open.';
    }
    if (stepName === 'Access' && selectedBase(access, allowed).length === 0) {
      return 'Turn on at least one function, or pick a template.';
    }
    return '';
  };

  const next = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const submit = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      const baseSelected = selectedBase(access, allowed);
      if (type === 'staff') {
        const login = staffLogin.trim().toLowerCase();
        const result = await inviteSubuser(login, displayName, 'staff', { loginName: login, password: staffPassword });
        const basePermissions = Object.fromEntries(baseSelected.map((p) => [p, true]));
        const uiPermissions = Object.fromEntries(AVAILABLE_GRANULAR_PERMISSION_KEYS.map((key) => [key, Boolean(access[key])]));
        await refreshTeamMembers();
        const after = await listMySubusers().catch(() => []);
        const created = after.find((m) => m.memberKind === 'managed' && m.email === login);
        if (created) {
          for (const clientId of clientIds) {
            await setSubuserClientPermissions(created.userId, clientId, basePermissions);
            await setSubuserClientUiPermissions(created.userId, clientId, uiPermissions);
          }
        }
        onCreated({ email: result.email, password: staffPassword, existingUser: false, invitationPending: false, managedStaff: true });
      } else {
        const role = deriveRoleFromPermissions(baseSelected);
        // Business-owner invitations create a professional client relationship
        // server-side, which requires at least bookkeeper level.
        const effectiveRole: MemberRole = isBusinessOwner && role === 'viewer' ? 'bookkeeper' : role;
        const result = await inviteSubuser(email, displayName, effectiveRole, {
          permissions: Object.fromEntries(baseSelected.map((p) => [p, true])),
        });
        await refreshTeamMembers();
        onCreated({ email: result.email, password: result.temporaryPassword, existingUser: result.existingUser, invitationPending: result.invitationPending, managedStaff: false });
      }
    } catch (err) {
      if (err instanceof SubusersNotEnabledError) {
        onNotEnabled();
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not add this team member.');
    } finally {
      setBusy(false);
    }
  };

  const isLast = step === steps.length - 1;
  const editorRole: MemberRole =
    type === 'staff' ? 'staff' : (() => {
      const role = deriveRoleFromPermissions(selectedBase(access, allowed));
      return isBusinessOwner && role === 'viewer' ? 'bookkeeper' : role;
    })();

  return (
    <Modal
      title="Add a team member"
      subtitle={type ? `Step ${step + 1} of ${steps.length} · ${stepName}` : 'Choose how this person will sign in'}
      onClose={onClose}
      closeDisabled={busy}
      wide={stepName === 'Access'}
      footer={
        type ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setError(''); if (step === 1) { setType(null); setStep(0); } else setStep((s) => s - 1); }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={() => { void submit(); }}
                disabled={busy}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold shadow-sm active:scale-95 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {busy ? 'Working…' : type === 'staff' ? 'Create staff login' : 'Send invitation'}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold shadow-sm active:scale-95"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="p-6 space-y-5">
        {type && (
          <ol className="flex items-center gap-2" aria-label="Progress">
            {steps.map((name, i) => (
              <li key={name} className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 ${
                    i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-cyan-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {i < step ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-xs font-semibold hidden sm:inline ${i === step ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>{name}</span>
                {i < steps.length - 1 && <span className="w-4 sm:w-8 h-px bg-slate-200 dark:bg-slate-700" />}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {stepName === 'Type' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => chooseType('staff')}
              className="text-left rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:border-cyan-400 dark:hover:border-cyan-600 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300 mb-3">
                <KeyRound className="w-5 h-5" />
              </span>
              <p className="font-bold text-slate-800 dark:text-slate-100">Staff login</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                For employees who don&apos;t need their own account. You create a login name and password, and choose
                which clients and functions they can use.
              </p>
            </button>
            <button
              type="button"
              onClick={() => chooseType('email')}
              className="text-left rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:border-cyan-400 dark:hover:border-cyan-600 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300 mb-3">
                <Mail className="w-5 h-5" />
              </span>
              <p className="font-bold text-slate-800 dark:text-slate-100">
                {isBusinessOwner ? 'Accountant / Bookkeeper' : 'Invite by email'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {isBusinessOwner
                  ? 'For a professional who already has a CAPOT account. Your business is added to their Client Profiles.'
                  : 'For someone who already has a CAPOT account. They keep their own login and password.'}
              </p>
            </button>
          </div>
        )}

        {stepName === 'Details' && type === 'staff' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tm-login" className={labelCls}>Login name *</label>
                <input id="tm-login" type="text" autoFocus value={staffLogin} onChange={(e) => setStaffLogin(e.target.value.toLowerCase())} placeholder="e.g. maria.staff" className={inputCls} />
                <p className="text-[11px] text-slate-500 mt-1">Lowercase letters, numbers, dot, underscore, hyphen.</p>
              </div>
              <div>
                <label htmlFor="tm-pass" className={labelCls}>Initial password *</label>
                <input id="tm-pass" type="password" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} placeholder="At least 6 characters" className={inputCls} />
                <p className="text-[11px] text-slate-500 mt-1">They can change it later in Account Settings.</p>
              </div>
            </div>
            <div>
              <label htmlFor="tm-name" className={labelCls}>Display name (optional)</label>
              <input id="tm-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Maria, Cashier" className={inputCls} />
            </div>
          </div>
        )}

        {stepName === 'Details' && type === 'email' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="tm-email" className={labelCls}>Email address *</label>
              <input id="tm-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isBusinessOwner ? 'accountant@company.com' : 'teammate@company.com'} className={inputCls} />
              <p className="text-[11px] text-slate-500 mt-1">Must match the email of their existing CAPOT account.</p>
            </div>
            <div>
              <label htmlFor="tm-name2" className={labelCls}>Display name (optional)</label>
              <input id="tm-name2" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Maria, Accountant" className={inputCls} />
            </div>
          </div>
        )}

        {stepName === 'Clients' && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Which Client Profiles can they open? *</p>
              <div className="flex gap-3 text-xs">
                <button type="button" className="font-semibold text-cyan-600 hover:underline" onClick={() => setClientIds(profiles.map((c) => c.id))}>Select all</button>
                <button type="button" className="font-semibold text-slate-500 hover:underline" onClick={() => setClientIds([])}>Clear</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Access is limited to the profiles ticked here. You can change this any time.</p>
            {profiles.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">No Client Profiles found. Create a profile before adding staff.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {profiles.map((client) => {
                  const on = clientIds.includes(client.id);
                  return (
                    <label key={client.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${on ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setClientIds((prev) => (e.target.checked ? [...prev, client.id] : prev.filter((id) => id !== client.id)))}
                        className="h-4 w-4 accent-cyan-600"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{client.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">{clientIds.length} of {profiles.length} selected</p>
          </div>
        )}

        {stepName === 'Access' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900 px-4 py-3 text-xs text-cyan-900 dark:text-cyan-100 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {type === 'staff'
                  ? 'Nothing is restricted automatically — you decide exactly what this staff login can use. The same access is applied to every client you selected.'
                  : 'Choose what this person may do in your account. You can fine-tune it per client after they join.'}
              </span>
            </div>
            <AccessEditor
              value={access}
              onChange={setAccess}
              memberRole={editorRole}
              allowed={allowed}
              disabled={busy}
              allowedNote={type === 'staff' ? 'Reserved for the account owner.' : 'Not available for invited accounts.'}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Manage access (per member, per client)
// ---------------------------------------------------------------------------

function ManageAccessModal({
  member,
  clientList,
  onClose,
}: {
  member: TeamMember;
  clientList: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState<string>(clientList[0]?.id || '');
  const [grants, setGrants] = useState<Record<string, Record<string, boolean>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [search, setSearch] = useState('');

  const allowed: Permission[] = MEMBER_ROLE_PERMISSIONS[member.memberRole] || [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [rows, uiRows] = await Promise.all([
          listSubuserClientPermissions(member.userId),
          listSubuserClientUiPermissions(member.userId).catch(() => []),
        ]);
        const byClient: Record<string, Record<string, boolean>> = {};
        const uiByClient = Object.fromEntries(uiRows.map((row) => [row.clientId, row.permissions || {}]));
        rows.forEach((row) => {
          const base = row.permissions || {};
          byClient[row.clientId] = {
            ...base,
            ...buildDefaultUiPermissions(base),
            ...((uiByClient[row.clientId] || {}) as Record<string, boolean>),
          };
        });
        // A client may be visible to the owner but not yet have a granted row —
        // show it as "no access" rather than silently inventing permissions.
        clientList.forEach((client) => {
          if (!byClient[client.id]) byClient[client.id] = {};
        });
        if (!cancelled) setGrants(byClient);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load client permissions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.userId]);

  const current = grants[clientId] || {};
  const setCurrent = (next: Record<string, boolean>) => {
    setSaved('');
    setGrants((prev) => ({ ...prev, [clientId]: next }));
    setDirty((prev) => new Set(prev).add(clientId));
  };

  const persist = async (targetIds: string[], source: Record<string, boolean>) => {
    const baseOnly = Object.fromEntries(
      Object.entries(source).filter(([key]) => BASE_KEYS.has(key)).map(([key, value]) => [key, Boolean(value)])
    );
    const ui = Object.fromEntries(AVAILABLE_GRANULAR_PERMISSION_KEYS.map((key) => [key, Boolean(source[key])]));
    for (const id of targetIds) {
      // Base capabilities first: the granular RPC caps every leaf against them.
      await setSubuserClientPermissions(member.userId, id, baseOnly);
      await setSubuserClientUiPermissions(member.userId, id, ui);
    }
    return { ...baseOnly, ...ui };
  };

  const save = async (targetIds: string[]) => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const savedValue = await persist(targetIds, current);
      setGrants((prev) => {
        const copy = { ...prev };
        targetIds.forEach((id) => { copy[id] = savedValue; });
        return copy;
      });
      setDirty((prev) => {
        const copy = new Set(prev);
        targetIds.forEach((id) => copy.delete(id));
        return copy;
      });
      setSaved(targetIds.length > 1 ? `Saved for ${targetIds.length} clients.` : 'Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save client permissions.');
    } finally {
      setSaving(false);
    }
  };

  const visibleClients = clientList.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const hasAccess = (id: string) => selectedBase(grants[id] || {}, allowed).length > 0;

  return (
    <Modal
      title="Manage access"
      subtitle={`${member.displayName || member.email} · ${roleLabel(member.memberRole)}`}
      onClose={onClose}
      closeDisabled={saving}
      wide
      footer={
        clientId && !loading && clientList.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {saved ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{saved}</span> : dirty.has(clientId) ? 'You have unsaved changes for this client.' : 'Unticked items are hidden or disabled for this client.'}
            </p>
            <div className="flex items-center gap-2">
              {clientList.length > 1 && (
                <button
                  type="button"
                  onClick={() => { void save(clientList.map((c) => c.id)); }}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  Apply to all clients
                </button>
              )}
              <button
                type="button"
                onClick={() => { void save([clientId]); }}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold shadow-sm active:scale-95 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div role="alert" className="mx-6 mt-5 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading access…
        </div>
      ) : clientList.length === 0 ? (
        <div className="p-12 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-700 dark:text-slate-200">No client profiles yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create a client profile first, then give this person access to it.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-[250px_1fr]">
          <div className="md:border-r border-b md:border-b-0 border-slate-200 dark:border-slate-700 p-3 md:max-h-[60vh] md:overflow-y-auto">
            <p className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Clients</p>
            {clientList.length > 6 && (
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
            )}
            <div className="flex md:block gap-2 overflow-x-auto md:overflow-visible">
              {visibleClients.map((client) => {
                const selected = clientId === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => { setClientId(client.id); setSaved(''); }}
                    className={`shrink-0 md:w-full text-left px-3 py-2.5 rounded-xl md:mb-1 transition-colors ${selected ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-sm truncate flex-1">{client.name}</span>
                      {dirty.has(client.id) && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />}
                    </span>
                    <span className={`block text-[11px] mt-0.5 ${hasAccess(client.id) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {hasAccess(client.id) ? 'Has access' : 'No access'}
                    </span>
                  </button>
                );
              })}
              {visibleClients.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">No matches.</p>}
            </div>
          </div>

          <div className="p-6 space-y-4 md:max-h-[60vh] md:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Selected client</p>
                <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{clientList.find((c) => c.id === clientId)?.name}</h4>
              </div>
              <button
                type="button"
                onClick={() => setCurrent({})}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" /> Remove all access
              </button>
            </div>
            <AccessEditor
              value={current}
              onChange={setCurrent}
              memberRole={member.memberRole}
              allowed={allowed}
              disabled={saving}
              allowedNote={`Not available for the ${roleLabel(member.memberRole)} role.`}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  menuOpen,
  onToggleMenu,
  onManageAccess,
  onRoleChange,
  onResetPassword,
  onToggleStatus,
  onRemove,
}: {
  member: TeamMember;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onManageAccess: () => void;
  onRoleChange: (role: MemberRole) => void;
  onResetPassword: () => void;
  onToggleStatus: () => void;
  onRemove: () => void;
}) {
  const ownerRelationship = member.inviteMode === 'owner_to_accountant';
  const invited = member.status === 'invited';
  const canManageAccess = member.status === 'active' && !ownerRelationship;
  const canToggle = !invited && !ownerRelationship;

  const kindBadge = ownerRelationship
    ? { text: 'Own account · client relationship', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300' }
    : member.memberKind === 'independent'
      ? { text: 'Own CAPOT account', cls: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300' }
      : { text: 'Staff login', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300' };

  const statusCls =
    member.status === 'active'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : invited
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

  return (
    <li className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 ${member.status === 'disabled' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 text-sm font-bold shrink-0" aria-hidden="true">
          {initials(member)}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{member.displayName || member.email}</p>
          {member.displayName && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.email}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${kindBadge.cls}`}>{kindBadge.text}</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusCls}`}>
              {member.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {invited ? 'Awaiting acceptance' : member.status}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 sm:justify-end">
        <div className="text-xs text-slate-500 dark:text-slate-400 hidden lg:block w-36">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">Last sign-in</span>
          {member.lastLogin ? new Date(member.lastLogin).toLocaleDateString() : 'Never'}
        </div>

        {member.memberKind === 'managed' ? (
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-300">Staff</span>
        ) : (
          <select
            value={member.memberRole}
            onChange={(e) => onRoleChange(e.target.value as MemberRole)}
            disabled={invited || ownerRelationship}
            aria-label={`Role for ${member.email}`}
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ROLE_OPTIONS.filter((r) => r.value !== 'staff' || member.memberRole === 'staff').map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
        )}

        <button
          type="button"
          onClick={onManageAccess}
          disabled={!canManageAccess}
          title={ownerRelationship ? 'This professional keeps their own account; per-client access does not apply' : canManageAccess ? 'Choose which clients and functions they can use' : 'Available once the member is active'}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-700"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Manage access
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={onToggleMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${member.email}`}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={onToggleMenu} />
              <div role="menu" className="absolute right-0 mt-1 w-56 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1">
                {member.memberKind !== 'independent' && (
                  <button role="menuitem" type="button" onClick={onResetPassword} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <KeyRound className="w-4 h-4 text-slate-400" /> Reset password
                  </button>
                )}
                {canToggle && (
                  <button role="menuitem" type="button" onClick={onToggleStatus} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Ban className="w-4 h-4 text-slate-400" /> {member.status === 'disabled' ? 'Enable access' : 'Disable access'}
                  </button>
                )}
                <button role="menuitem" type="button" onClick={onRemove} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" /> {invited ? 'Revoke invitation' : 'Remove from account'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TeamSettings() {
  const { user, userRole, subusersEnabled, isSubuser, membership, teamMembers, refreshTeamMembers } = useAuth();
  const { clients, ownerClientId } = useAccounting();
  const allProfiles = useMemo(
    () => (Object.values(clients) as Array<{ id: string; name: string }>).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const clientList = useMemo(() => allProfiles.filter((c) => c.id !== ownerClientId), [allProfiles, ownerClientId]);
  const isBusinessOwner = userRole === 'owner';
  const canInvite = isBusinessOwner || userRole === 'accountant' || userRole === 'bookkeeper';

  const [error, setError] = useState('');
  const [notEnabled, setNotEnabled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [resetSecret, setResetSecret] = useState<{ email: string; password: string; managedStaff?: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [accessMember, setAccessMember] = useState<TeamMember | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const handleRoleChange = async (member: TeamMember, role: MemberRole) => {
    try {
      await updateSubuserRole(member.userId, role);
      await refreshTeamMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.');
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    setMenuFor(null);
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
      await removeSubuser(confirmRemove.userId, confirmRemove.memberKind);
      setConfirmRemove(null);
      await refreshTeamMembers();
    } catch (err) {
      setConfirmRemove(null);
      setError(err instanceof Error ? err.message : 'Could not remove team member.');
    }
  };

  const handleResetPassword = async (member: TeamMember) => {
    setMenuFor(null);
    try {
      const pw = await resetSubuserPassword(member.userId);
      setResetSecret({ email: member.email, password: pw, managedStaff: member.memberKind === 'managed' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    }
  };

  const filteredMembers = teamMembers.filter((m) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return `${m.displayName || ''} ${m.email}`.toLowerCase().includes(q);
  });

  const header = (subtitle: string, action?: React.ReactNode) => (
    <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Team &amp; Subusers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );

  if (notEnabled || !subusersEnabled) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {header('Invite team members to share your account.')}
          <div className="p-6">
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-100">Team access isn&apos;t set up yet</p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                  Run <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 font-mono text-xs">scripts/subusers_migration.sql</code>{' '}
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

  const activeCount = teamMembers.filter((m) => m.status === 'active').length;
  const pendingCount = teamMembers.filter((m) => m.status === 'invited').length;

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {header(
          isSubuser
            ? 'You are a team member on this account.'
            : `Add people to your ${userRole === 'accountant' ? 'accounting practice' : 'business'} and choose what each one can use.`,
          !isSubuser && canInvite ? (
            <button
              type="button"
              onClick={() => { setError(''); setSecret(null); setAdding(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Add member
            </button>
          ) : undefined
        )}

        <div className="p-6 space-y-5">
          {error && (
            <div role="alert" className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss error" className="shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}

          {isSubuser && (
            <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-5 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-sm text-cyan-900 dark:text-cyan-100">
                <p className="font-bold">Signed in as a team member</p>
                <p className="mt-1 text-cyan-800 dark:text-cyan-300">
                  This account is owned by <span className="font-semibold">{membership.ownerEmail ?? 'the account holder'}</span>.
                  Your role: <span className="font-semibold">{roleLabel(membership.memberRole ?? 'staff')}</span>.
                  You can open the clients and functions the owner has granted you. Only the owner can add or remove members.
                </p>
              </div>
            </div>
          )}

          {!isSubuser && !canInvite && (
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-5">
              <p className="font-bold text-indigo-900 dark:text-indigo-100">Team invitations are managed from your professional account relationship.</p>
              <p className="mt-1 text-sm text-indigo-800 dark:text-indigo-300">
                Only a Business Owner can invite an Accountant or Bookkeeper. Accountant and Bookkeeper accounts can add their own team members.
              </p>
            </div>
          )}

          {!isSubuser && canInvite && (
            <>
              {secret && (
                <SecretReveal email={secret.email} password={secret.password} existingUser={secret.existingUser} invitationPending={secret.invitationPending} ownerClientRelationship={isBusinessOwner} managedStaff={secret.managedStaff} onDismiss={() => setSecret(null)} />
              )}
              {resetSecret && (
                <SecretReveal email={resetSecret.email} password={resetSecret.password} existingUser={false} managedStaff={resetSecret.managedStaff} onDismiss={() => setResetSecret(null)} />
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-bold text-slate-800 dark:text-slate-100">Your team</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'} · {activeCount} active{pendingCount ? ` · ${pendingCount} pending` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {teamMembers.length > 5 && (
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search members" aria-label="Search members" className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48" />
                      </div>
                    )}
                    <button onClick={() => { void refreshTeamMembers(); }} className="p-2 text-slate-400 hover:text-cyan-600 transition-colors" title="Refresh" aria-label="Refresh team list">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {teamMembers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-10 text-center">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300 mb-3">
                      <ShieldPlus className="w-6 h-6" />
                    </span>
                    <p className="font-bold text-slate-800 dark:text-slate-100">No team members yet</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Add an accountant, bookkeeper or staff login and decide exactly what they can use.</p>
                    <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold shadow-sm active:scale-95">
                      <UserPlus className="w-4 h-4" /> Add your first member
                    </button>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">No members match “{filter}”.</p>
                ) : (
                  <ul className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filteredMembers.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        menuOpen={menuFor === m.id}
                        onToggleMenu={() => setMenuFor((cur) => (cur === m.id ? null : m.id))}
                        onManageAccess={() => { setMenuFor(null); setAccessMember(m); }}
                        onRoleChange={(role) => { void handleRoleChange(m, role); }}
                        onResetPassword={() => { void handleResetPassword(m); }}
                        onToggleStatus={() => { void handleToggleStatus(m); }}
                        onRemove={() => { setMenuFor(null); setConfirmRemove(m); }}
                      />
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-slate-400 mt-3">Signed in as {user?.email}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {adding && (
        <AddMemberModal
          isBusinessOwner={isBusinessOwner}
          profiles={allProfiles}
          onClose={() => setAdding(false)}
          onCreated={(s) => { setSecret(s); setAdding(false); }}
          onNotEnabled={() => setNotEnabled(true)}
          refreshTeamMembers={refreshTeamMembers}
        />
      )}

      {accessMember && (
        <ManageAccessModal member={accessMember} clientList={clientList} onClose={() => setAccessMember(null)} />
      )}

      {confirmRemove && (
        <Modal
          title={confirmRemove.status === 'invited' ? 'Revoke invitation?' : confirmRemove.inviteMode === 'owner_to_accountant' ? 'Remove accountant relationship?' : 'Remove team member?'}
          onClose={() => setConfirmRemove(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-white dark:hover:bg-slate-700">Cancel</button>
              <button onClick={() => { void handleRemove(); }} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm active:scale-95">
                {confirmRemove.status === 'invited' ? 'Revoke' : 'Remove'}
              </button>
            </div>
          }
        >
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold">{confirmRemove.email}</span>
            {confirmRemove.status === 'invited'
              ? ' has a pending invitation that has not been accepted yet. Revoking it means they can no longer accept access to your account.'
              : confirmRemove.inviteMode === 'owner_to_accountant'
                ? ' is linked as your Accountant/Bookkeeper. Removing the relationship severs the client link; their own CAPOT account and the synced client profile remain intact.'
                : <> will lose access to your account data.{' '}
                    {confirmRemove.memberKind === 'managed'
                      ? 'Their staff login will be disabled.'
                      : 'Their own CAPOT account remains theirs; only its link to your account is removed.'}
                  </>}
          </p>
        </Modal>
      )}
    </div>
  );
}
