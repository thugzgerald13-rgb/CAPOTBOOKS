import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, Download, Users, RefreshCw, Mail, Calendar, LineChart, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import packageJson from '../../package.json';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  userRole?: string;
  lastLogin?: any;
  updatedAt?: any;
}

type AdminTab = 'users' | 'diagnostics';

// Masks a Supabase project URL down to just the host, e.g.
// "https://abcdefgh.supabase.co" -> "abcdefgh.supabase.co", so nothing
// beyond what's already visible in network requests gets shown/copied.
function maskSupabaseUrl(url: string | undefined): string {
  if (!url) return 'Not set';
  try {
    return new URL(url).host;
  } catch {
    return 'Invalid URL';
  }
}

function DiagSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden mb-6 page-panel">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h4>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">{children}</div>
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}

function DiagStatusRow({
  label,
  ok,
  okText,
  failText,
  pending,
}: {
  label: string;
  ok: boolean | null;
  okText: string;
  failText: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      {pending || ok === null ? (
        <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...
        </span>
      ) : ok ? (
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" /> {okText}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-bold">
          <XCircle className="w-3.5 h-3.5" /> {failText}
        </span>
      )}
    </div>
  );
}

function DiagnosticsTab() {
  const { clients, isSyncing, syncError } = useAccounting();
  const { user, isAdmin } = useAuth();

  const [dbReadOk, setDbReadOk] = useState<boolean | null>(null);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);
  const [supabaseLatencyMs, setSupabaseLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  const runChecks = async () => {
    setSupabaseOk(null);
    setSupabaseLatencyMs(null);
    setDbReadOk(null);
    setDbLatencyMs(null);

    // Supabase reachability + round-trip latency via a minimal auth call
    // (doesn't touch any table, so it still works when signed out).
    const start = performance.now();
    try {
      const { error } = await supabase.auth.getSession();
      setSupabaseLatencyMs(Math.round(performance.now() - start));
      setSupabaseOk(!error);
    } catch {
      setSupabaseLatencyMs(Math.round(performance.now() - start));
      setSupabaseOk(false);
    }

    // Database read probe: a lightweight, non-destructive query against the
    // clients table to confirm the DB connection and RLS policies are working.
    const dbStart = performance.now();
    try {
      const { error } = await supabase.from('clients').select('id').limit(1);
      setDbLatencyMs(Math.round(performance.now() - dbStart));
      setDbReadOk(!error);
    } catch {
      setDbLatencyMs(Math.round(performance.now() - dbStart));
      setDbReadOk(false);
    }

    setCheckedAt(new Date());
  };

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordCounts = useMemo(() => {
    const list = Object.values(clients);
    return {
      clients: list.length,
      sales: list.reduce((sum, c) => sum + (c.sales?.length || 0), 0),
      purchases: list.reduce((sum, c) => sum + (c.purchases?.length || 0), 0),
      glEntries: list.reduce(
        (sum, c) => sum + (c.glAccounts || []).reduce((s, g) => s + (g.entries?.length || 0), 0),
        0
      ),
      files: list.reduce((sum, c) => sum + (c.files?.length || 0), 0),
    };
  }, [clients]);

  // Approximate size of the currently loaded client data (in-memory, sourced
  // entirely from Supabase) rather than any on-device browser storage.
  const dataUsageKb = useMemo(() => {
    try {
      const bytes = new Blob([JSON.stringify(clients)]).size;
      return (bytes / 1024).toFixed(1);
    } catch {
      return 'N/A';
    }
  }, [clients]);

  const envReport = useMemo(() => {
    return [
      `CapotBooks Diagnostics — ${new Date().toISOString()}`,
      `App version: ${packageJson.version}`,
      `Supabase project: ${maskSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string)}`,
      `Build mode: ${import.meta.env.MODE}`,
      `User: ${user?.email || 'signed out'}`,
      `Admin: ${isAdmin}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${window.screen.width}x${window.screen.height}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      `Online: ${navigator.onLine}`,
      `Supabase reachable: ${supabaseOk} (${supabaseLatencyMs ?? '—'} ms)`,
      `Database read OK: ${dbReadOk} (${dbLatencyMs ?? '—'} ms)`,
      `Loaded client data size: ${dataUsageKb} KB`,
      `Clients: ${recordCounts.clients}, Sales: ${recordCounts.sales}, Purchases: ${recordCounts.purchases}, GL entries: ${recordCounts.glEntries}, Files: ${recordCounts.files}`,
      `Last sync error: ${syncError || 'none'}`,
    ].join('\n');
  }, [supabaseOk, supabaseLatencyMs, dbReadOk, dbLatencyMs, dataUsageKb, recordCounts, syncError, user, isAdmin]);

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(envReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — report is still visible on screen either way.
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">System &amp; Environment</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all active:scale-95"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Report'}
          </button>
          <button
            onClick={runChecks}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-run Checks
          </button>
        </div>
      </div>

      <DiagSection title="Connection Status">
        <DiagStatusRow
          label="Supabase API"
          ok={supabaseOk}
          okText={`Reachable (${supabaseLatencyMs ?? '—'} ms)`}
          failText="Unreachable"
        />
        <DiagStatusRow
          label="Database read (clients table)"
          ok={dbReadOk}
          okText={`Reachable (${dbLatencyMs ?? '—'} ms)`}
          failText="Unavailable"
        />
        <DiagStatusRow
          label="Last cloud sync"
          ok={!syncError}
          okText={isSyncing ? 'Syncing...' : 'OK'}
          failText={syncError || 'Error'}
          pending={isSyncing}
        />
        <DiagRow label="Checked at" value={checkedAt ? checkedAt.toLocaleTimeString() : '—'} />
      </DiagSection>

      <DiagSection title="App">
        <DiagRow label="Version" value={packageJson.version} />
        <DiagRow label="Build mode" value={import.meta.env.MODE} />
        <DiagRow label="Supabase project" value={maskSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string)} />
      </DiagSection>

      <DiagSection title="Session">
        <DiagRow label="Signed in as" value={user?.email || 'Signed out'} />
        <DiagRow label="Admin (developer) access" value={isAdmin ? 'Yes' : 'No'} />
      </DiagSection>

      <DiagSection title="Data">
        <DiagRow label="Clients loaded" value={String(recordCounts.clients)} />
        <DiagRow label="Sales records" value={String(recordCounts.sales)} />
        <DiagRow label="Purchase records" value={String(recordCounts.purchases)} />
        <DiagRow label="GL entries" value={String(recordCounts.glEntries)} />
        <DiagRow label="Files stored" value={String(recordCounts.files)} />
        <DiagRow label="Loaded data size" value={`${dataUsageKb} KB`} />
      </DiagSection>

      <DiagSection title="Browser / Environment">
        <DiagRow label="User agent" value={navigator.userAgent} />
        <DiagRow label="Screen size" value={`${window.screen.width} x ${window.screen.height}`} />
        <DiagRow label="Viewport size" value={`${window.innerWidth} x ${window.innerHeight}`} />
        <DiagRow label="Online" value={navigator.onLine ? 'Yes' : 'No'} />
      </DiagSection>
    </div>
  );
}

export function AdminSettings() {
  const { currentClient } = useAccounting();
  const { isAdmin, userRole, setUserRole } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbConnectionOk, setDbConnectionOk] = useState<boolean | null>(null);

  // Which tab shows is driven by the URL path itself
  // (/developertools/systemconfig vs /developertools/diagnostics), so each
  // tab has its own real, shareable/bookmarkable URL and the sidebar's
  // "System Config" / "Diagnostics" buttons link straight to the right one.
  const location = useLocation();
  const activeTab: AdminTab = location.pathname.endsWith('/diagnostics') ? 'diagnostics' : 'users';

  // Actually verify the Supabase database connection is live, instead of
  // showing a hardcoded "active" light regardless of real state.
  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.from('clients').select('id').limit(1);
        setDbConnectionOk(!error);
      } catch {
        setDbConnectionOk(false);
      }
    })();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, user_role, last_login, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const userList = (data || []).map((row) => ({
        uid: row.id,
        email: row.email,
        displayName: row.display_name,
        userRole: row.user_role,
        lastLogin: row.last_login,
        updatedAt: row.updated_at,
      })) as UserProfile[];
      setUsers(userList);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleBackup = () => {
    const dataStr = JSON.stringify(users, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capotbooks_users_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  if (!isAdmin) return null;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Developer System Config" icon={<ShieldAlert className="text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6 overflow-y-auto max-h-[80vh]">

        {/* Tab switcher: Superuser Dashboard (user directory/backup) vs
            Diagnostics (system/environment info). */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => navigate('/developertools/systemconfig')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px ${
              activeTab === 'users'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Superuser Dashboard
          </button>
          <button
            onClick={() => navigate('/developertools/diagnostics')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px ${
              activeTab === 'diagnostics'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LineChart className="w-4 h-4" />
            Diagnostics
          </button>
        </div>

        {activeTab === 'diagnostics' ? (
          <DiagnosticsTab />
        ) : (
        <>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Superuser Dashboard</h3>
          <button 
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Backup User Directory
          </button>
        </div>
        
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-8">
          <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium mb-4">
            Authorized Developer: thugz.gerald13@gmail.com
          </p>
          
          <div className="flex items-center gap-4">
            <label className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              Current Active View:
            </label>
            <select 
              value={userRole || ''} 
              onChange={(e) => setUserRole(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="owner">Business Owner</option>
              <option value="accountant">Accountant / Bookkeeper</option>
            </select>
          </div>
        </div>

        {/* User List Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200">Registered Users ({users.length})</h4>
            </div>
            <button 
              onClick={fetchUsers}
              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">User</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">Role</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 text-right">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          {u.displayName || 'Anonymous'}
                          {u.email === 'thugz.gerald13@gmail.com' && <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[10px] px-1 rounded border border-amber-200">DEV</span>}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.userRole === 'owner' ? 'bg-cyan-100 text-cyan-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {u.userRole || 'Not Set'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <Calendar className="w-3 h-3" />
                        {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'N/A'}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">
                      No users synchronized with central database yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Current Active Client Context</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {currentClient ? currentClient.id : 'No client selected'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Data is synced live to Supabase Postgres under `clients` (row id = `${currentClient?.id || 'CLIENT_ID'}`). No data is stored in the browser.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">System Status</h4>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  dbConnectionOk === null
                    ? 'bg-slate-400 animate-pulse'
                    : dbConnectionOk
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                    : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                }`}
              ></span>
              {dbConnectionOk === null
                ? 'Checking Database Connection...'
                : dbConnectionOk
                ? 'Supabase Database Connected'
                : 'Supabase Database Unavailable'}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Auth Active
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Postgres Sync Active
            </div>
          </div>
        </div>
        </>
        )}
      </div>
          </div>
    </div>
  );
}
