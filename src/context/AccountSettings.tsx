import React, { useEffect, useMemo, useState } from 'react';
import { UserCircle, CheckCircle2, Users, UserPlus, ShieldCheck, Trash2, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type PermissionKey =
  | 'clients_view' | 'clients_edit' | 'clients_delete'
  | 'sales_view' | 'sales_edit' | 'sales_delete'
  | 'purchases_view' | 'purchases_edit' | 'purchases_delete'
  | 'coa_view' | 'coa_edit' | 'coa_delete'
  | 'journals_view' | 'journals_edit' | 'journals_delete'
  | 'inventory_view' | 'inventory_edit' | 'inventory_delete'
  | 'files_view' | 'files_edit' | 'files_delete'
  | 'tin_view' | 'tin_edit' | 'tin_delete'
  | 'tax_view' | 'tax_edit' | 'tax_delete'
  | 'bank_view' | 'bank_edit' | 'bank_delete'
  | 'billing_view' | 'billing_edit' | 'billing_delete'
  | 'reports_view';

type Member = {
  id: string;
  username: string;
  display_name: string;
  permissions: Record<string, boolean>;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type PermissionGroup = {
  label: string;
  description: string;
  prefix: string;
  actions: Array<'view' | 'edit' | 'delete'>;
};

const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const value = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };

  const parts = [
    value.message,
    value.code ? `Code: ${value.code}` : '',
    value.details ? `Details: ${value.details}` : '',
    value.hint ? `Hint: ${value.hint}` : '',
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : fallback;
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: 'Client Profiles', description: 'Business and client profile records', prefix: 'clients', actions: ['view', 'edit', 'delete'] },
  { label: 'Sales', description: 'Sales transactions and records', prefix: 'sales', actions: ['view', 'edit', 'delete'] },
  { label: 'Purchases', description: 'Purchases, receiving and payables', prefix: 'purchases', actions: ['view', 'edit', 'delete'] },
  { label: 'Journals', description: 'Special journals and journal vouchers', prefix: 'journals', actions: ['view', 'edit', 'delete'] },
  { label: 'Chart of Accounts', description: 'Accounts and account columns', prefix: 'coa', actions: ['view', 'edit', 'delete'] },
  { label: 'Inventory', description: 'Inventory items, movements and columns', prefix: 'inventory', actions: ['view', 'edit', 'delete'] },
  { label: 'Files', description: 'Client folders and uploaded files', prefix: 'files', actions: ['view', 'edit', 'delete'] },
  { label: 'TIN Library', description: 'Customer and supplier TIN records', prefix: 'tin', actions: ['view', 'edit', 'delete'] },
  { label: 'Tax & Compliance', description: 'Tax deadlines, withholding and tax-related records', prefix: 'tax', actions: ['view', 'edit', 'delete'] },
  { label: 'Bank / Cash', description: 'Bank accounts and cash-related records', prefix: 'bank', actions: ['view', 'edit', 'delete'] },
  { label: 'Billing', description: 'Billing invoices', prefix: 'billing', actions: ['view', 'edit', 'delete'] },
  { label: 'Reports', description: 'Financial reports and report snapshots', prefix: 'reports', actions: ['view'] },
];

const emptyPermissions = (): Record<PermissionKey, boolean> => ({
  clients_view: false, clients_edit: false, clients_delete: false,
  sales_view: false, sales_edit: false, sales_delete: false,
  purchases_view: false, purchases_edit: false, purchases_delete: false,
  coa_view: false, coa_edit: false, coa_delete: false,
  journals_view: false, journals_edit: false, journals_delete: false,
  inventory_view: false, inventory_edit: false, inventory_delete: false,
  files_view: false, files_edit: false, files_delete: false,
  tin_view: false, tin_edit: false, tin_delete: false,
  tax_view: false, tax_edit: false, tax_delete: false,
  bank_view: false, bank_edit: false, bank_delete: false,
  billing_view: false, billing_edit: false, billing_delete: false,
  reports_view: false,
});

export function AccountSettings() {
  const {
    user,
    userRole,
    needsAccountSetup,
    completeAccountSetup,
    activeAccountUser,
    reloadAccountUsers,
  } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [isAccountOwner, setIsAccountOwner] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSaving, setMemberSaving] = useState<string | null>(null);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberDisplayName, setMemberDisplayName] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<Record<PermissionKey, boolean>>(emptyPermissions());
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const isGoogleUser = Boolean(user && (
    (user.identities || []).some((identity) => identity.provider === 'google') ||
    user.app_metadata?.provider === 'google' ||
    (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google'))
  ));

  const loadMembers = async () => {
    if (!user || activeAccountUser) {
      setIsAccountOwner(false);
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setError('');
    try {
      const { data: ownerData, error: ownerError } = await supabase.rpc('is_account_owner');
      if (ownerError) throw ownerError;
      const owner = Boolean(ownerData);
      setIsAccountOwner(owner);
      if (!owner) {
        setMembers([]);
        return;
      }
      const { data, error: listError } = await supabase.rpc('list_account_members');
      if (listError) throw listError;
      setMembers((data || []) as Member[]);
    } catch (err) {
      console.error('Account user load failed:', err);
      setError(getSupabaseErrorMessage(err, 'Unable to load account users.'));
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [user?.id, activeAccountUser?.id]);

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await completeAccountSetup(password);
      setPassword(''); setConfirmPassword('');
      setMessage('Your CAPOT login password has been saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account settings.');
    } finally { setLoading(false); }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    const username = memberUsername.trim().toLowerCase().replace(/\s+/g, '');
    const displayName = memberDisplayName.trim();
    if (!username) return setError('Username is required.');
    if (!displayName) return setError('User name is required.');
    if (memberPassword.length < 6) return setError('User password must be at least 6 characters.');
    setMemberSaving('new');
    try {
      const { error: rpcError } = await supabase.rpc('create_account_member', {
        p_username: username,
        p_display_name: displayName,
        p_password: memberPassword,
        p_permissions: newPermissions,
      });
      if (rpcError) throw rpcError;
      setMemberUsername(''); setMemberDisplayName(''); setMemberPassword('');
      setNewPermissions(emptyPermissions());
      await loadMembers();
      await reloadAccountUsers();
      setMessage(`User ${displayName} was added to this account.`);
    } catch (err) {
      console.error('Add account user failed:', err);
      setError(getSupabaseErrorMessage(err, 'Unable to add account user.'));
    } finally { setMemberSaving(null); }
  };

  const saveMember = async (member: Member) => {
    setError(''); setMessage(''); setMemberSaving(member.id);
    try {
      const { error: rpcError } = await supabase.rpc('update_account_member', {
        p_member_id: member.id,
        p_username: member.username,
        p_display_name: member.display_name,
        p_password: null,
        p_permissions: member.permissions,
        p_active: member.active,
      });
      if (rpcError) throw rpcError;
      await loadMembers(); await reloadAccountUsers();
      setMessage(`Permissions saved for ${member.display_name}.`);
    } catch (err) {
      console.error('Account user update failed:', err);
      setError(getSupabaseErrorMessage(err, 'Unable to save account user permissions.'));
    } finally { setMemberSaving(null); }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.display_name} from this account?`)) return;
    setError(''); setMessage(''); setMemberSaving(member.id);
    try {
      const { error: rpcError } = await supabase.rpc('remove_account_member', { p_member_id: member.id });
      if (rpcError) throw rpcError;
      if (selectedMember === member.id) setSelectedMember(null);
      await loadMembers(); await reloadAccountUsers();
      setMessage('Account user removed.');
    } catch (err) {
      console.error('Remove account user failed:', err);
      setError(getSupabaseErrorMessage(err, 'Unable to remove account user.'));
    } finally { setMemberSaving(null); }
  };

  const setPermission = (permissions: Record<string, boolean>, key: PermissionKey, value: boolean) => ({ ...permissions, [key]: value });
  const setAllForGroup = (permissions: Record<string, boolean>, group: PermissionGroup, value: boolean) => {
    const next = { ...permissions };
    group.actions.forEach((action) => { next[`${group.prefix}_${action}`] = value; });
    return next;
  };
  const selected = useMemo(() => members.find((member) => member.id === selectedMember) || null, [members, selectedMember]);

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center"><UserCircle className="w-6 h-6" /></div>
            <div><h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Settings</h1><p className="text-sm text-slate-500 dark:text-slate-400">Manage your account information, security and account users.</p></div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {isGoogleUser && needsAccountSetup && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"><p className="font-bold text-amber-800 dark:text-amber-300">Complete your account setup</p><p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Create a CAPOT password so you can sign in with your email as well as Google.</p></div>
          )}
          {error && <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">{error}</div>}
          {message && <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}

          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email</label><div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200">{user?.email || '—'}</div></div>
            <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label><div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 capitalize">{activeAccountUser ? activeAccountUser.display_name : (userRole || '—')}</div></div>
          </div>

          {isGoogleUser && (
            <form onSubmit={saveCredentials} className="pt-2 space-y-4 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-5"><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">CAPOT Login Credentials</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Update the password used for CAPOT email/password login.</p></div>
              <div className="grid md:grid-cols-2 gap-4"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" placeholder="New password" /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" placeholder="Confirm password" /></div>
              <button type="submit" disabled={loading} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold disabled:opacity-50">{loading ? 'Saving...' : needsAccountSetup ? 'Create Password' : 'Update Password'}</button>
            </form>
          )}

          {isAccountOwner && !activeAccountUser && (
            <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between gap-4 pt-5 mb-5"><div><div className="flex items-center gap-2"><Users className="w-5 h-5 text-cyan-600" /><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Account Users</h2></div><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create users inside this account. They do not need their own CAPOT account. Each user has a separate username and password and only the permissions you give them.</p></div><button onClick={loadMembers} disabled={membersLoading} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${membersLoading ? 'animate-spin' : ''}`} /></button></div>

              <form onSubmit={addMember} className="rounded-2xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/60 dark:bg-cyan-900/10 p-4 space-y-4">
                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100"><UserPlus className="w-4 h-4" /> Add Account User</div>
                <div className="grid md:grid-cols-3 gap-3">
                  <input value={memberDisplayName} onChange={(e) => setMemberDisplayName(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="User name" required />
                  <input value={memberUsername} onChange={(e) => setMemberUsername(e.target.value)} autoComplete="off" className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="Username" required />
                  <input type="password" value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} autoComplete="new-password" minLength={6} className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="Password (min. 6)" required />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">The username/password belongs only to this account user. It is not a separate CAPOT/Supabase account.</p>
                <div className="grid lg:grid-cols-2 gap-3">
                  {PERMISSION_GROUPS.map((group) => <div key={group.prefix} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3"><div className="flex items-center justify-between gap-2 mb-2"><div><p className="text-sm font-bold">{group.label}</p><p className="text-xs text-slate-500">{group.description}</p></div><button type="button" onClick={() => setNewPermissions(setAllForGroup(newPermissions, group, true) as Record<PermissionKey, boolean>)} className="text-[11px] font-bold text-cyan-600">All</button></div><div className="flex flex-wrap gap-2">{group.actions.map((action) => { const key = `${group.prefix}_${action}` as PermissionKey; return <label key={key} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={Boolean(newPermissions[key])} onChange={(e) => setNewPermissions(setPermission(newPermissions, key, e.target.checked) as Record<PermissionKey, boolean>)} />{action === 'view' ? 'View' : action === 'edit' ? 'Edit' : 'Delete'}</label>; })}</div></div>)}
                </div>
                <button type="submit" disabled={memberSaving === 'new'} className="px-5 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold disabled:opacity-50">{memberSaving === 'new' ? 'Creating User...' : 'Create User'}</button>
              </form>

              <div className="mt-5 space-y-3">
                {membersLoading && members.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Loading account users...</div> : members.length === 0 ? <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm text-slate-500">No additional users have been added to this account.</div> : members.map((member) => {
                  const open = selectedMember === member.id;
                  return <div key={member.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button type="button" onClick={() => setSelectedMember(open ? null : member.id)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40"><div className="flex items-center gap-3 min-w-0"><div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-cyan-600" /></div><div className="min-w-0"><p className="font-bold text-sm truncate">{member.display_name}</p><p className="text-xs text-slate-500 truncate">@{member.username}</p></div></div><span className={`text-xs font-bold ${member.active ? 'text-emerald-600' : 'text-slate-400'}`}>{member.active ? 'Active' : 'Disabled'}</span></button>
                    {open && selected && <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20 space-y-4">
                      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selected.active} onChange={(e) => setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, active: e.target.checked } : m))} /> User is active</label>
                      <div className="grid lg:grid-cols-2 gap-3">{PERMISSION_GROUPS.map((group) => <div key={group.prefix} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3"><div className="flex items-center justify-between gap-2 mb-2"><div><p className="text-sm font-bold">{group.label}</p><p className="text-xs text-slate-500">{group.description}</p></div><button type="button" onClick={() => setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, permissions: setAllForGroup(m.permissions, group, true) } : m))} className="text-[11px] font-bold text-cyan-600">All</button></div><div className="flex flex-wrap gap-2">{group.actions.map((action) => { const key = `${group.prefix}_${action}` as PermissionKey; return <label key={key} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={Boolean(selected.permissions[key])} onChange={(e) => setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, permissions: setPermission(m.permissions, key, e.target.checked) } : m))} />{action === 'view' ? 'View' : action === 'edit' ? 'Edit' : 'Delete'}</label>; })}</div></div>)}</div>
                      <div className="grid md:grid-cols-2 gap-3"><input value={selected.display_name} onChange={(e) => setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, display_name: e.target.value } : m))} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="User name" /><input value={selected.username} onChange={(e) => setMembers((prev) => prev.map((m) => m.id === selected.id ? { ...m, username: e.target.value.toLowerCase().replace(/\s+/g, '') } : m))} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="Username" /></div>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2"><button type="button" onClick={() => removeMember(selected)} disabled={memberSaving === selected.id} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-sm disabled:opacity-50"><Trash2 className="w-4 h-4 inline mr-2" />Remove User</button><button type="button" onClick={() => saveMember(selected)} disabled={memberSaving === selected.id} className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm disabled:opacity-50"><Save className="w-4 h-4 inline mr-2" />{memberSaving === selected.id ? 'Saving...' : 'Save User'}</button></div>
                    </div>}
                  </div>;
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
