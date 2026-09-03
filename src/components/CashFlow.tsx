import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount } from '../lib/accountingBalances';
import { supabase } from '../lib/supabase';

interface CashFlowRow {
  section: string;
  line_type: string;
  account_id: string | null;
  account_name: string;
  amount: number;
  sort_order: number;
}

const SECTION_ORDER = ['Operating Activities', 'Investing Activities', 'Financing Activities'];

export function CashFlow() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();
  const year = new Date().getFullYear();
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!currentClientId) { setRows([]); return; }
    setLoading(true);
    setReportError(null);

    supabase.rpc('get_server_cash_flow', {
      p_client_id: currentClientId,
      p_start_date: `${year}-01-01`,
      p_end_date: `${year + 1}-01-01`,
    })
      .then(({ data, error }) => {
        if (error) throw error;
        if (!cancelled) setRows((data || []).map((r: any) => ({
          section: String(r.section || ''),
          line_type: String(r.line_type || ''),
          account_id: r.account_id == null ? null : String(r.account_id),
          account_name: String(r.account_name || ''),
          amount: Number(r.amount || 0),
          sort_order: Number(r.sort_order || 0),
        })));
      })
      .catch(err => { if (!cancelled) setReportError(err?.message || 'Unable to load Cash Flow from PostgreSQL.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [currentClientId, currentClient, year]);

  if (!currentClient || !currentClientId) return null;

  const data = currentClient.cfData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'STATEMENT OF CASH FLOWS',
  };

  const update = (field: 'companyName' | 'address' | 'reportName', value: string) =>
    saveFinancialReportSnapshot('Cash Flow', { ...data, [field]: value });

  const grouped = useMemo(() => Object.fromEntries(
    SECTION_ORDER.map(section => [section, rows.filter(r => r.section === section)])
  ) as Record<string, CashFlowRow[]>, [rows]);

  const sectionTotal = (section: string) => (grouped[section] || []).reduce((n, r) => n + r.amount, 0);
  const operating = sectionTotal('Operating Activities');
  const investing = sectionTotal('Investing Activities');
  const financing = sectionTotal('Financing Activities');
  const netChange = operating + investing + financing;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Cash Flow" icon={<Activity className="text-cyan-500" />} centered />
      <div className="p-4 md:p-6 flex-1">
        <div className="p-8 text-sm">
          <div className="text-center mb-8">
            <input value={data.companyName} onChange={e => update('companyName', e.target.value)}
              className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
            <input value={data.address} onChange={e => update('address', e.target.value)}
              className="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto mt-1" />
            <div className="mt-6">
              <input value={data.reportName} onChange={e => update('reportName', e.target.value)}
                className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
              <div className="text-center font-medium mt-1">For the year ended December 31, {year}</div>
              <div className="text-center text-xs text-slate-500 mt-1">Indirect method · calculated in PostgreSQL</div>
            </div>
          </div>

          {loading && <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading Cash Flow from PostgreSQL…</div>}
          {reportError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mb-6">{reportError}</div>}

          <div className="max-w-3xl mx-auto space-y-6">
            {SECTION_ORDER.map(section => {
              const items = grouped[section] || [];
              const total = sectionTotal(section);
              return (
                <section key={section}>
                  <div className="uppercase mb-2 font-bold">{section}</div>
                  <table className="w-full"><tbody>
                    {items.length ? items.map((r, i) => (
                      <tr key={`${r.account_id || r.line_type}-${i}`}>
                        <td className="pl-6 py-1.5">{r.account_id ? `${r.account_id} — ` : ''}{r.account_name}</td>
                        <td className="w-40 py-1.5 text-right font-mono pr-2">{formatAccountAmount(r.amount)}</td>
                      </tr>
                    )) : <tr><td colSpan={2} className="pl-6 py-2 text-slate-400">No activity.</td></tr>}
                    <tr className="font-bold border-t"><td className="pl-6 py-2">NET CASH FROM {section.toUpperCase()}</td><td className="text-right font-mono pr-2">{formatAccountAmount(total)}</td></tr>
                  </tbody></table>
                </section>
              );
            })}

            <div className="flex justify-between items-center py-3 border-t-2 border-slate-800 font-bold text-base">
              <div className="uppercase">NET CHANGE IN CASH</div>
              <div className="w-40 text-right font-mono pr-2">{formatAccountAmount(netChange)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
