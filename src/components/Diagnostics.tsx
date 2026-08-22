import { useEffect, useMemo, useState } from 'react';
import { LineChart, RefreshCw, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import packageJson from '../../package.json';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h4>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}

function StatusRow({
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

export function Diagnostics() {
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
    <div className="w-full flex flex-col">
      <PageHeader
        title="Diagnostics"
        icon={<LineChart className="text-emerald-500" />}
        actions={
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
        }
      />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <Section title="Connection Status">
          <StatusRow
            label="Supabase API"
            ok={supabaseOk}
            okText={`Reachable (${supabaseLatencyMs ?? '—'} ms)`}
            failText="Unreachable"
          />
          <StatusRow
            label="Database read (clients table)"
            ok={dbReadOk}
            okText={`Reachable (${dbLatencyMs ?? '—'} ms)`}
            failText="Unavailable"
          />
          <StatusRow
            label="Last cloud sync"
            ok={!syncError}
            okText={isSyncing ? 'Syncing...' : 'OK'}
            failText={syncError || 'Error'}
            pending={isSyncing}
          />
          <Row label="Checked at" value={checkedAt ? checkedAt.toLocaleTimeString() : '—'} />
        </Section>

        <Section title="App">
          <Row label="Version" value={packageJson.version} />
          <Row label="Build mode" value={import.meta.env.MODE} />
          <Row label="Supabase project" value={maskSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string)} />
        </Section>

        <Section title="Session">
          <Row label="Signed in as" value={user?.email || 'Signed out'} />
          <Row label="Admin (developer) access" value={isAdmin ? 'Yes' : 'No'} />
        </Section>

        <Section title="Data">
          <Row label="Clients loaded" value={String(recordCounts.clients)} />
          <Row label="Sales records" value={String(recordCounts.sales)} />
          <Row label="Purchase records" value={String(recordCounts.purchases)} />
          <Row label="GL entries" value={String(recordCounts.glEntries)} />
          <Row label="Files stored" value={String(recordCounts.files)} />
          <Row label="Loaded data size" value={`${dataUsageKb} KB`} />
        </Section>

        <Section title="Browser / Environment">
          <Row label="User agent" value={navigator.userAgent} />
          <Row label="Screen size" value={`${window.screen.width} x ${window.screen.height}`} />
          <Row label="Viewport size" value={`${window.innerWidth} x ${window.innerHeight}`} />
          <Row label="Online" value={navigator.onLine ? 'Yes' : 'No'} />
        </Section>
      </div>
    </div>
  );
}
