import React, { useState } from 'react';
import { UserCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AccountSettings() {
  const {
    user,
    userRole,
    needsAccountSetup,
    completeAccountSetup,
  } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isGoogleUser = Boolean(user && (
    (user.identities || []).some((identity) => identity.provider === 'google') ||
    user.app_metadata?.provider === 'google' ||
    (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google'))
  ));

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

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center"><UserCircle className="w-6 h-6" /></div>
            <div><h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Settings</h1><p className="text-sm text-slate-500 dark:text-slate-400">Manage your account information and security.</p></div>
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
            <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label><div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 capitalize">{userRole || '—'}</div></div>
          </div>

          {isGoogleUser && (
            <form onSubmit={saveCredentials} className="pt-2 space-y-4 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-5"><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">CAPOT Login Credentials</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Update the password used for CAPOT email/password login.</p></div>
              <div className="grid md:grid-cols-2 gap-4"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" placeholder="New password" /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" placeholder="Confirm password" /></div>
              <button type="submit" disabled={loading} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold disabled:opacity-50">{loading ? 'Saving...' : needsAccountSetup ? 'Create Password' : 'Update Password'}</button>
            </form>
          )}


        </div>
      </div>
    </div>
  );
}
