import React, { useState, useEffect } from 'react';
import { UserCircle, CheckCircle2, Shield, Bell, Download, Smartphone, Trash2, AlertTriangle, Headphones, Mail, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { supabase } from '../lib/supabase';

type NotifPrefs = { complianceReminders: boolean; weeklyDigest: boolean; productUpdates: boolean };
const DEFAULT_PREFS: NotifPrefs = { complianceReminders: true, weeklyDigest: true, productUpdates: false };
// Customer support contact — override with VITE_SUPPORT_EMAIL in .env.
// Falls back to the admin/developer email so the contact button always works.
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL || import.meta.env.VITE_ADMIN_EMAIL || 'thugz.gerald13@gmail.com').trim();

export function AccountSettings() {
  const canExport = usePermission('export_data');

  const { user, userRole, isAdmin, needsAccountSetup, completeAccountSetup, signOut } = useAuth();
  const { currentClient, showToast } = useAccounting();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // ---- Delete Account (danger zone) — server RPC: public.delete_my_account() ----
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  // ---- T021: 2FA stub + notif prefs + plan + data export ----
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('capot.notifPrefs') || 'null');
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
      setTwoFaEnabled(localStorage.getItem('capot.2fa') === '1');
    } catch { /* ignore */ }
  }, []);
  const togglePref = (k: keyof NotifPrefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try { localStorage.setItem('capot.notifPrefs', JSON.stringify(next)); } catch { /* ignore */ }
    showToast('Notification preferences saved');
  };
  const toggle2fa = () => {
    const next = !twoFaEnabled;
    setTwoFaEnabled(next);
    try { localStorage.setItem('capot.2fa', next ? '1' : '0'); } catch { /* ignore */ }
    showToast(next ? 'Two-factor authentication enabled (stub)' : 'Two-factor authentication disabled');
  };
  const handleExportData = () => {
    const payload = { exportedAt: new Date().toISOString(), client: currentClient || null };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `capot-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data export downloaded');
  };

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

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText.trim().toLowerCase() !== (user.email || '').toLowerCase()) {
      setError('Type your full account email address to confirm deletion.');
      return;
    }
    setDeleting(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) {
        const msg = rpcError.message || '';
        if (/function.*does not exist|could not find/i.test(msg)) {
          throw new Error('The delete-account server migration is not applied yet. Run scripts/self_delete_account.sql in your Supabase dashboard first.');
        }
        throw new Error(msg);
      }
      showToast('Your account has been permanently deleted.');
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete account.');
      setDeleting(false);
    }
  };

  const section = (icon: React.ReactNode, title: string, desc: string, body: React.ReactNode) => (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-5">
      <div className="flex items-center gap-2 mb-1"><span className="text-cyan-600 dark:text-cyan-400">{icon}</span><h2 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{title}</h2></div>
      <p className="text-xs text-slate-400 mb-4">{desc}</p>
      {body}
    </div>
  );

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="sticky-page-title flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center"><UserCircle className="w-6 h-6" /></div>
        <div><h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Settings</h1><p className="text-sm text-slate-500 dark:text-slate-400">Manage profile, security, notifications, and data.</p></div>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">{error}</div>}
      {message && <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}

      {/* Profile */}
      {section(<UserCircle className="w-4 h-4" />, 'Profile', 'Your account identity.', (
        <div className="grid md:grid-cols-2 gap-4">
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email</label><div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm">{user?.email || '—'}</div></div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Role</label><div className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm capitalize">{userRole || '—'}</div></div>
        </div>
      ))}

      {/* Security: password + 2FA — personal settings for every regular user; hidden from the developer super-admin. */}
      {!isAdmin && section(<Shield className="w-4 h-4" />, 'Security', 'Password & two-factor authentication.', (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-3"><Smartphone className="w-4 h-4 text-slate-400" /><div><div className="text-sm font-bold text-slate-700 dark:text-slate-200">Two-Factor Authentication</div><div className="text-[11px] text-slate-400">Add an extra layer of security (stub — TOTP coming soon).</div></div></div>
            <button type="button" onClick={toggle2fa} className={`relative w-11 h-6 rounded-full transition-colors ${twoFaEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${twoFaEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
            <form onSubmit={saveCredentials} className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-3"><div className="text-sm font-bold text-slate-800 dark:text-slate-100">CAPOT Login Credentials</div><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Update the password used for CAPOT email/password login.</p></div>
              <div className="grid md:grid-cols-2 gap-4"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" placeholder="New password" /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" placeholder="Confirm password" /></div>
              <button type="submit" disabled={loading} className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">{loading ? 'Saving...' : needsAccountSetup ? 'Create Password' : 'Update Password'}</button>
            </form>
        </div>
      ))}

      {/* Notifications — personal settings for every regular user; hidden from the developer super-admin. */}
      {!isAdmin && section(<Bell className="w-4 h-4" />, 'Notifications', 'Choose what we email you about.', (
        <div className="space-y-2">
          {([['complianceReminders', 'BIR compliance reminders & deadlines'], ['weeklyDigest', 'Weekly financial digest'], ['productUpdates', 'Product updates & new features']] as Array<[keyof NotifPrefs, string]>).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 cursor-pointer">
              <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
              <input type="checkbox" checked={prefs[k]} onChange={() => togglePref(k)} className="w-4 h-4 rounded accent-cyan-600" />
            </label>
          ))}
        </div>
      ))}

      {/* Customer Support */}
      {section(<Headphones className="w-4 h-4" />, 'Customer Support', 'Need help with your subscription, billing, or modules?', (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Questions about your trial, module pricing, renewals or a pending GCash payment? Reach out to
            our support team and we'll take care of it.
          </p>
          <div className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 inline-block">{SUPPORT_EMAIL}</div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CAPOT Support Request')}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Mail className="w-3.5 h-3.5" /> Email Support
            </a>
            <button
              type="button"
              onClick={() => { try { navigator.clipboard?.writeText(SUPPORT_EMAIL); showToast('Support email copied to clipboard'); } catch { /* ignore */ } }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Email Address
            </button>
          </div>
          <p className="text-[11px] text-slate-400">We typically respond within 24 hours on business days. Set <span className="font-mono">VITE_SUPPORT_EMAIL</span> in your <span className="font-mono">.env</span> to change this address.</p>
        </div>
      ))}

      {/* Data export */}
      {section(<Download className="w-4 h-4" />, 'Data Export', 'Download your accounting data as JSON.', (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-300">Export all data for the active entity (JSON).</span>
          <button type="button" onClick={handleExportData} disabled={!canExport} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed" title={canExport ? 'Export Data' : 'Export Data permission not granted'}><Download className="w-3.5 h-3.5" /> Export Data</button>
        </div>
      ))}

      {/* Danger Zone: Delete Account (calls public.delete_my_account() RPC) */}
      <div className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4" /></span>
          <h2 className="text-sm font-black uppercase tracking-wider text-red-700 dark:text-red-300">Danger Zone</h2>
        </div>
        <p className="text-xs text-red-500/80 dark:text-red-400/70 mb-4">Permanently remove your account and all associated data. This cannot be undone.</p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); setError(''); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Account
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-100/70 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This will <strong>permanently delete</strong> your login and all data owned by this account. We
                recommend <strong>exporting your data</strong> above first. If you are a team member, only your own
                login is removed — the account owner's books are unaffected. Type your full email address below to confirm.
              </span>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={user?.email || 'you@example.com'}
              className="w-full px-4 py-3 rounded-xl border border-red-300 dark:border-red-700 bg-white dark:bg-slate-900 text-sm"
              autoComplete="off"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText.trim().toLowerCase() !== (user?.email || '').toLowerCase()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setError(''); }}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
