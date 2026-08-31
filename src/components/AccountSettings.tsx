import React, { useEffect, useState } from 'react';
import { UserCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export function AccountSettings() {
  const { user, userRole, needsAccountSetup, completeAccountSetup } = useAuth();
  const [username, setUsername] = useState('');
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

  useEffect(() => {
    setUsername(String(user?.user_metadata?.account_username || ''));
  }, [user?.id, user?.user_metadata?.account_username]);

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanUsername = username.trim();
    if (!cleanUsername) return setError('Username is required.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      await completeAccountSetup(cleanUsername, password);
      setUsername(cleanUsername);
      setPassword('');
      setConfirmPassword('');
      setMessage('Your CAPOT username and password have been created successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center">
              <UserCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Settings</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage your account information.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {isGoogleUser && needsAccountSetup && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="font-bold text-amber-800 dark:text-amber-300">Complete your account setup</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Because you registered with Google, you must create a CAPOT username and password before continuing to use the application.
              </p>
            </div>
          )}

          {error && <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">{error}</div>}
          {message && <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Email</label>
            <div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200">{user?.email || '—'}</div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Role</label>
            <div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 capitalize">{userRole || '—'}</div>
          </div>

          {isGoogleUser && (
            <form onSubmit={saveCredentials} className="pt-2 space-y-4">
              <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">CAPOT Login Credentials</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create the username and password associated with your CAPOT account. These fields are required for Google-registered accounts.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="Choose a username" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="At least 6 characters" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="Re-enter password" />
              </div>
              <button type="submit" disabled={loading} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
                {loading ? 'Saving...' : needsAccountSetup ? 'Complete Account Setup' : 'Save Credentials'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
