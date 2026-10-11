import React, { useCallback, useState } from 'react';
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FUNCTIONS } from '../lib/functionRegistry';

type CheckItem = { label: string; status: 'ok' | 'warn' | 'error'; detail: string };
type Snapshot = { checkedAt: string; checks: CheckItem[]; counts: Record<string, number>; debit: number; credit: number };

const TABLES = [
  { table: 'sales', label: 'Income / Sales', page: 'Sales' },
  { table: 'purchases', label: 'Purchases / Bills', page: 'Purchases' },
  { table: 'journal_entries', label: 'Journal entries', page: 'General Journal' },
  { table: 'coa_accounts', label: 'Chart of accounts', page: 'Chart of Accounts' },
  { table: 'app_files', label: 'Files', page: 'File Manager' },
] as const;

const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'PHP' });

export function AccountHealthMonitor({ userId, email }: { userId: string; email: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const runAudit = useCallback(async () => {
    setRunning(true);
    setRunError('');
    try {
      const checks: CheckItem[] = [];
      const { data: clients, error: clientsError } = await supabase
        .from('clients').select('id,name').eq('user_id', userId);
      if (clientsError) throw new Error(`Unable to read target account clients: ${clientsError.message}`);
      const clientIds = (clients || []).map((c: { id: string }) => c.id);
      checks.push({
        label: 'Account data access',
        status: 'ok',
        detail: `${clientIds.length} client workspace(s) found for ${email}`,
      });

      const counts: Record<string, number> = {};
      let debit = 0;
      let credit = 0;
      for (const item of TABLES) {
        if (clientIds.length === 0) {
          counts[item.table] = 0;
          checks.push({ label: item.label, status: 'warn', detail: 'No client workspace to inspect' });
          continue;
        }
        const { count, error: countError } = await supabase
          .from(item.table).select('id', { count: 'exact', head: true }).in('client_id', clientIds);
        if (countError) {
          checks.push({ label: item.label, status: 'error', detail: `Check failed: ${countError.message}` });
          counts[item.table] = -1;
          continue;
        }
        counts[item.table] = count ?? 0;
        if (item.table === 'journal_entries') {
          // Page through every journal row so the balance check is not silently capped.
          for (let from = 0; from < counts[item.table]; from += 1000) {
            const { data, error } = await supabase.from('journal_entries')
              .select('total_debit,total_credit').in('client_id', clientIds)
              .range(from, Math.min(from + 999, counts[item.table] - 1));
            if (error) {
              counts[item.table] = -1;
              checks.push({ label: item.label, status: 'error', detail: `Could not read all journal rows: ${error.message}` });
              break;
            }
            for (const row of (data || []) as { total_debit?: number | string | null; total_credit?: number | string | null }[]) {
              debit += Number(row.total_debit || 0);
              credit += Number(row.total_credit || 0);
            }
          }
        }
        if (counts[item.table] >= 0) checks.push({
          label: item.label,
          status: 'ok',
          detail: `${counts[item.table].toLocaleString()} record(s) readable`,
        });
        else continue;
      }

      const delta = Math.abs(debit - credit);
      checks.push({
        label: 'Journal debit / credit balance',
        status: counts.journal_entries === -1 ? 'error' : delta < 0.01 ? 'ok' : 'warn',
        detail: counts.journal_entries === -1
          ? 'Could not verify journal totals'
          : `${money(debit)} debit vs ${money(credit)} credit; difference ${money(delta)}`,
      });

      checks.push({
        label: 'Function registry',
        status: FUNCTIONS.length > 0 && FUNCTIONS.every(f => f.pageIds.length > 0) ? 'ok' : 'warn',
        detail: `${FUNCTIONS.length} configured functions checked for page mapping (configuration check only; not an end-to-end UI test)`,
      });

      setSnapshot({ checkedAt: new Date().toISOString(), checks, counts, debit, credit });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
      setSnapshot(null);
    } finally {
      setRunning(false);
    }
  }, [userId, email]);

  const issueCount = snapshot?.checks.filter(c => c.status !== 'ok').length ?? 0;

  return (
    <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100">Account Function &amp; Data Health Monitor</h4>
            <p className="text-xs text-slate-500">System Config · scoped to {email}</p>
          </div>
        </div>
        <button onClick={runAudit} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 text-xs font-bold">
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Checking…' : 'Run account audit'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">Runs an on-demand read-only check of registered data tables, configured function-to-page mappings, and aggregate journal debit/credit totals. It does not modify records or continuously monitor activity.</p>
      {runError && <div className="mb-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300">{runError}</div>}
      {snapshot && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
            <span className={`font-bold ${issueCount ? 'text-amber-600' : 'text-emerald-600'}`}>{issueCount ? `${issueCount} warning/error(s)` : 'All checks passed'}</span>
            <span className="text-slate-400">Checked {new Date(snapshot.checkedAt).toLocaleString()}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {TABLES.map(item => (
              <div key={item.table} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{snapshot.counts[item.table] < 0 ? 'Unavailable' : snapshot.counts[item.table].toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {snapshot.checks.map((check, i) => (
              <div key={`${check.label}-${i}`} className="flex items-start gap-2 py-2 text-xs">
                {check.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : check.status === 'warn' ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                <div><div className="font-semibold text-slate-700 dark:text-slate-200">{check.label}</div><div className="text-slate-500 break-words">{check.detail}</div></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
