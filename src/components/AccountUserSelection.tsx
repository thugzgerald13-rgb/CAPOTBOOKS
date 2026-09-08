import React, { useState } from 'react';
import { Building2, KeyRound, UserCircle, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AccountUserSelection() {
  const { user, accountUsers, selectAccountUser, selectOwnerAccount, signOut } = useAuth();
  const [selectedId, setSelectedId] = useState<string>('owner');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMember = accountUsers.find((member) => member.id === selectedId) || null;

  const enter = async () => {
    setError('');
    if (selectedId === 'owner') {
      selectOwnerAccount();
      return;
    }
    if (!password) {
      setError('Enter the password for this user.');
      return;
    }
    setLoading(true);
    try {
      await selectAccountUser(selectedId, password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in as this user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 font-sans">
      <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-600">{user?.email}</p>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">Select User</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose who is using this CAPOT account. Users with limited permissions must enter their own password.</p>
        </div>
        <div className="p-6 space-y-3">
          <button type="button" onClick={() => { setSelectedId('owner'); setPassword(''); setError(''); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition ${selectedId === 'owner' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="w-11 h-11 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
            <div><p className="font-bold text-slate-800 dark:text-slate-100">Account Owner</p><p className="text-xs text-slate-500">Full access</p></div>
          </button>

          {accountUsers.map((member) => (
            <button key={member.id} type="button" disabled={!member.active} onClick={() => { setSelectedId(member.id); setPassword(''); setError(''); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition disabled:opacity-40 ${selectedId === member.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center"><UserCircle className="w-5 h-5" /></div>
              <div className="min-w-0"><p className="font-bold text-slate-800 dark:text-slate-100 truncate">{member.display_name}</p><p className="text-xs text-slate-500 truncate">@{member.username} · {member.active ? 'Active' : 'Disabled'}</p></div>
              <ShieldCheck className="ml-auto w-5 h-5 text-slate-400" />
            </button>
          ))}

          {selectedMember && (
            <div className="pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">User Password</label>
              <div className="relative"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void enter(); }} autoComplete="current-password" className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" placeholder={`Password for ${selectedMember.display_name}`} /></div>
            </div>
          )}

          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}
          <button type="button" onClick={() => void enter()} disabled={loading} className="w-full px-5 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold disabled:opacity-50">{loading ? 'Checking password...' : selectedId === 'owner' ? 'Continue as Owner' : 'Enter Workspace'}</button>
          <button type="button" onClick={() => void signOut()} className="w-full px-5 py-3 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold"><LogOut className="w-4 h-4 inline mr-2" />Sign out</button>
        </div>
      </div>
    </div>
  );
}
