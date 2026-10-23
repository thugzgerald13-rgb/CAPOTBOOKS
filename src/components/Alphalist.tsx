import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../lib/supabase';
import { MONTHS, formatTIN } from '../lib/utils';
import { ALPHALIST_ATC_BY_MODULE, type AlphalistAtcEntry } from '../lib/alphalistAtc';
import { usePermission } from '../lib/teamPermissions';
import { FileSpreadsheet, Plus, Trash2, ShieldCheck, Save, Users, Receipt, Landmark, X } from 'lucide-react';

/**
 * BIR Alphalist Data Entry & Validation Module — reverse-engineered from
 * "Alphalist Data Entry and Validation ver. 7.4" (Visual FoxPro, efsbir.dbc).
 *
 * Original architecture (evidence-based, not guessed):
 *  - Two executables: Data Entry (menu BIR1604.MPR → forms mn1600/mn1604e/mn1604cf)
 *    and Validation (VALRLF.MPR).
 *  - Three monthly data-entry forms: 1600de (VT Schedule I), 1601ede (Expanded
 *    Withholding / 1604-E alphalist), 1601fde (Final Withholding / Compensation /
 *    1604-CF alphalist). All bind to the same master table DATA/alphadtl.dbf
 *    (FORM_TYPE distinguishes the module).
 *  - Bound fields (ControlSource extraction from *.SCT): period ("For the month of"),
 *    schedule_num, sequence_num (auto), tin (mandatory), branch_code, registered_name,
 *    last_name/first_name/middle_name, atc_code (validated via seek in reg_atcs),
 *    tax_rate (auto from ATC), income_payment, actual_amt_wthld (auto = income × rate).
 *  - Validation rules (exact messagebox strings from SCT): "TIN must be entered!",
 *    "TIN is invalid" — valid TINs start with 0, 1, 2, 3, 4 & 9 (4-series added
 *    2010-11-15); "Invalid ATC entered!" if not found in reg_atcs; mandatory-field
 *    check via valid_fields() ("There are a mandatory field").
 *  - Export: validation module builds comma-separated output — numerics formatted
 *    alltrim(str(value,20,2)) then joined with ',' (strings extracted from SCT).
 *
 * Annual returns 1604-E and 1604-CF are the aggregation of monthly 1601E / 1601F
 * entries; the "Annual Summary" tab below aggregates by ATC for the selected year.
 */

type AlphaModule = '1600' | '1601E' | '1601F';

const MODULES: { id: AlphaModule; label: string; sub: string; icon: React.ReactNode; form: string }[] = [
  { id: '1600', label: '1600 — VT', sub: 'Monthly %/VT Withholding (Schedule I)', icon: <Landmark className="w-4 h-4" />, form: 'BIR Form 1600' },
  { id: '1601E', label: '1601E — Expanded', sub: 'Creditable / Expanded Withholding (→ 1604-E alphalist)', icon: <Receipt className="w-4 h-4" />, form: 'BIR Form 1601-E' },
  { id: '1601F', label: '1601F — Final', sub: 'Final Withholding / Compensation (→ 1604-CF alphalist)', icon: <Users className="w-4 h-4" />, form: 'BIR Form 1601-F' },
];

interface AlphaEntry {
  id: string;
  formType: AlphaModule;
  returnPeriod: string; // YYYY-MM-01
  scheduleNum: string;
  sequenceNum: number;
  tin: string;
  branchCode: string;
  registeredName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  atcCode: string;
  taxRate: number;
  incomePayment: number;
  actualAmtWthld: number;
}

const VALID_TIN_PREFIX = ['0', '1', '2', '3', '4', '9']; // exact: "Valid values for TIN starts with 0, 1, 2, 3, 4 & 9"

/** Mirror of the original valid_fields() + TIN + ATC validation. Returns error messages. */
export function validateAlphaEntry(e: Partial<AlphaEntry>, atcList: AlphalistAtcEntry[]): string[] {
  const errs: string[] = [];
  const tinDigits = (e.tin || '').replace(/\D/g, '');
  if (!tinDigits) errs.push('TIN must be entered!');
  else if (tinDigits.length !== 9) errs.push('TIN is invalid — must be 9 digits.');
  else if (!VALID_TIN_PREFIX.includes(tinDigits[0])) errs.push('TIN is invalid — valid values for TIN start with 0, 1, 2, 3, 4 & 9.');
  if (!(e.registeredName || '').trim() && !((e.lastName || '').trim() && (e.firstName || '').trim())) {
    errs.push('Registered Name, or Last + First Name, is mandatory.');
  }
  if (!e.atcCode) errs.push('ATC Code is mandatory.');
  else if (!atcList.some(a => a.code === e.atcCode)) errs.push('Invalid ATC entered!');
  if (!(e.incomePayment && e.incomePayment > 0)) errs.push('Amount of Income Payment is mandatory.');
  return errs;
}

/** CSV export mirroring the validation module: numerics alltrim(str(n,20,2)) joined by ','. */
function fmt202(n: number): string {
  return n.toFixed(2).padStart(20, ' ').trim();
}

export function Alphalist() {
  const { currentClientId, showToast } = useAccounting();
  const canAdd = usePermission('edit_transactions');
  const canDelete = usePermission('delete_transactions');
  const canExport = usePermission('export_data');

  const [module, setModule] = useState<AlphaModule>('1601E');
  const [view, setView] = useState<'entry' | 'annual'>('entry');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const years = useMemo(() => Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i), []);

  const atcList = ALPHALIST_ATC_BY_MODULE[module] || [];

  // Form state
  const [scheduleNum, setScheduleNum] = useState('D1');
  const [tin, setTin] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [registeredName, setRegisteredName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [atcCode, setAtcCode] = useState('');
  const [incomePayment, setIncomePayment] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [entries, setEntries] = useState<AlphaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResults, setValidationResults] = useState<{ id: string; seq: number; name: string; errors: string[] }[] | null>(null);

  const returnPeriod = `${year}-${String(month).padStart(2, '0')}-01`;

  const selectedAtc = atcList.find(a => a.code === atcCode);
  const taxRate = selectedAtc?.rate ?? 0;
  const incomeNum = parseFloat(incomePayment.replace(/,/g, '')) || 0;
  const actualAmtWthld = Math.round(incomeNum * taxRate * 100) / 100;

  // Load entries for module + period.
  useEffect(() => {
    if (!currentClientId) { setEntries([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('alphalist_entries')
        .select('*')
        .eq('client_id', currentClientId)
        .eq('form_type', module)
        .eq('return_period', returnPeriod)
        .order('schedule_num')
        .order('sequence_num');
      if (cancelled) return;
      setLoading(false);
      if (error) {
        console.warn('[Alphalist] load failed:', error.message);
        setEntries([]);
        if (error.message.includes('does not exist')) showToast('Alphalist table not found. Run scripts/add_alphalist_tables.sql in Supabase first.');
        return;
      }
      setEntries((data || []).map((r: any) => ({
        id: r.id, formType: r.form_type, returnPeriod: r.return_period, scheduleNum: r.schedule_num,
        sequenceNum: r.sequence_num, tin: r.tin, branchCode: r.branch_code, registeredName: r.registered_name,
        lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name, atcCode: r.atc_code,
        taxRate: Number(r.tax_rate || 0), incomePayment: Number(r.income_payment || 0), actualAmtWthld: Number(r.actual_amt_wthld || 0),
      })));
    })();
    return () => { cancelled = true; };
  }, [currentClientId, module, returnPeriod, showToast]);

  const nextSequence = useMemo(() => {
    const forSched = entries.filter(e => e.scheduleNum === scheduleNum);
    return forSched.length ? Math.max(...forSched.map(e => e.sequenceNum)) + 1 : 1;
  }, [entries, scheduleNum]);

  const totals = useMemo(() => ({
    income: entries.reduce((s, e) => s + e.incomePayment, 0),
    withheld: entries.reduce((s, e) => s + e.actualAmtWthld, 0),
  }), [entries]);

  // Annual summary (1604-E / 1604-CF aggregation by ATC) for the selected year.
  const [annualRows, setAnnualRows] = useState<{ atcCode: string; rate: number; income: number; withheld: number; count: number }[]>([]);
  useEffect(() => {
    if (!currentClientId || view !== 'annual') { setAnnualRows([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('alphalist_entries')
        .select('atc_code,tax_rate,income_payment,actual_amt_wthld')
        .eq('client_id', currentClientId)
        .eq('form_type', module)
        .gte('return_period', `${year}-01-01`)
        .lte('return_period', `${year}-12-31`);
      if (cancelled || error) return;
      const agg = new Map<string, { rate: number; income: number; withheld: number; count: number }>();
      (data || []).forEach((r: any) => {
        const k = r.atc_code;
        const cur = agg.get(k) || { rate: Number(r.tax_rate || 0), income: 0, withheld: 0, count: 0 };
        cur.income += Number(r.income_payment || 0); cur.withheld += Number(r.actual_amt_wthld || 0); cur.count += 1;
        agg.set(k, cur);
      });
      setAnnualRows(Array.from(agg.entries()).map(([atcCode, v]) => ({ atcCode, ...v })).sort((a, b) => a.atcCode.localeCompare(b.atcCode)));
    })();
    return () => { cancelled = true; };
  }, [currentClientId, module, year, view]);

  const resetForm = () => {
    setTin(''); setBranchCode(''); setRegisteredName(''); setLastName(''); setFirstName(''); setMiddleName('');
    setAtcCode(''); setIncomePayment(''); setFormErrors([]);
  };

  const handleSave = async () => {
    if (!canAdd) { showToast('You do not have permission to add alphalist entries.'); return; }
    if (!currentClientId) return;
    const draft: Partial<AlphaEntry> = { tin, registeredName, lastName, firstName, atcCode, incomePayment: incomeNum };
    const errs = validateAlphaEntry(draft, atcList);
    if (errs.length) { setFormErrors(errs); showToast('Validation failed — see errors below the form.'); return; }
    setFormErrors([]);
    setSaving(true);
    const id = `${currentClientId}_${module}_${returnPeriod}_${scheduleNum}_${nextSequence}`;
    const row = {
      id, client_id: currentClientId, form_type: module, return_period: returnPeriod, schedule_num: scheduleNum,
      sequence_num: nextSequence, tin: tin.replace(/\D/g, ''), branch_code: branchCode.slice(0, 4),
      registered_name: registeredName.trim(), last_name: lastName.trim(), first_name: firstName.trim(),
      middle_name: middleName.trim(), atc_code: atcCode, tax_rate: taxRate,
      income_payment: incomeNum, actual_amt_wthld: actualAmtWthld,
    };
    const { error } = await supabase.from('alphalist_entries').upsert(row);
    setSaving(false);
    if (error) { showToast(`Save failed: ${error.message}`); return; }
    setEntries(prev => [...prev, { ...row, id, formType: module, returnPeriod, scheduleNum, sequenceNum: nextSequence, taxRate, incomePayment: incomeNum, actualAmtWthld } as unknown as AlphaEntry]);
    showToast(`Alphalist entry #${nextSequence} saved (${atcCode} @ ${(taxRate * 100).toFixed(1)}%, withheld ₱${actualAmtWthld.toLocaleString()}).`);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) { showToast('You do not have permission to delete alphalist entries.'); return; }
    const { error } = await supabase.from('alphalist_entries').delete().eq('id', id);
    if (error) { showToast(`Delete failed: ${error.message}`); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    showToast('Alphalist entry deleted.');
  };

  const handleValidateAll = () => {
    const results = entries.map(e => ({
      id: e.id, seq: e.sequenceNum, name: e.registeredName || `${e.lastName}, ${e.firstName}`,
      errors: validateAlphaEntry(e, atcList),
    }));
    setValidationResults(results);
    const bad = results.filter(r => r.errors.length);
    showToast(bad.length ? `${bad.length} of ${entries.length} entries failed validation.` : `All ${entries.length} entries passed validation.`);
  };

  const handleExportCsv = () => {
    if (!canExport) { showToast('You do not have permission to export.'); return; }
    if (!entries.length) { showToast('No entries to export for this period.'); return; }
    const header = ['FORM_TYPE','RETURN_PERIOD','SCHEDULE_NUM','SEQUENCE_NUM','TIN','BRANCH_CODE','REGISTERED_NAME','LAST_NAME','FIRST_NAME','MIDDLE_NAME','ATC_CODE','TAX_RATE','INCOME_PAYMENT','ACTUAL_AMT_WTHLD'];
    const lines = [header.join(',')];
    entries.forEach(e => {
      lines.push([
        e.formType, e.returnPeriod, e.scheduleNum, String(e.sequenceNum), e.tin, e.branchCode || '',
        `"${(e.registeredName || '').replace(/"/g, '""')}"`, `"${(e.lastName || '').replace(/"/g, '""')}"`,
        `"${(e.firstName || '').replace(/"/g, '""')}"`, `"${(e.middleName || '').replace(/"/g, '""')}"`,
        e.atcCode, fmt202(e.taxRate * 100), fmt202(e.incomePayment), fmt202(e.actualAmtWthld),
      ].join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ALPHALIST_${module}_${year}${String(month).padStart(2, '0')}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${entries.length} alphalist entries (CSV, numerics formatted STR(20,2) per BIR validation module).`);
  };

  const mod = MODULES.find(m => m.id === module)!;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Alphalist Data Entry & Validation" icon={<Users className="w-5 h-5 text-indigo-500" />} />
      <div className="p-4 md:p-6 flex-1 flex flex-col gap-5">
        {/* Module tabs */}
        <div className="flex flex-wrap gap-2">
          {MODULES.map(m => (
            <button key={m.id} onClick={() => { setModule(m.id); setValidationResults(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${module === m.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
              {m.icon}<span>{m.label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setView(view === 'entry' ? 'annual' : 'entry')}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 border border-slate-200 dark:border-slate-700">
            {view === 'entry' ? 'Annual 1604 Summary →' : '← Monthly Data Entry'}
          </button>
        </div>
        <p className="text-xs text-slate-500 -mt-3">{mod.sub} · {mod.form}</p>

        {view === 'entry' ? (
          <>
            {/* Period selector + actions */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500 uppercase">For the month of:</span>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex-1" />
              <button onClick={handleValidateAll} disabled={!entries.length}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40">
                <ShieldCheck className="w-4 h-4" /> Validate All ({entries.length})
              </button>
              <button onClick={handleExportCsv} disabled={!entries.length}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40">
                <FileSpreadsheet className="w-4 h-4" /> Export CSV
              </button>
            </div>

            {/* Data entry form — exact fields from original 1600de/1601ede/1601fde */}
            {canAdd && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-500" /> Add Alphalist Entry — Sequence #{nextSequence} (auto)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="form-label">Schedule</label>
                    <input value={scheduleNum} onChange={e => setScheduleNum(e.target.value.toUpperCase())} maxLength={4} className="form-input font-mono font-bold" />
                  </div>
                  <div>
                    <label className="form-label text-red-500">Taxpayer TIN *</label>
                    <input value={tin} onChange={e => { const v = e.target.value.replace(/[^\d-]/g, ''); setTin(v.length <= 12 ? v : v.slice(0, 12)); }} onBlur={() => tin.replace(/\D/g, '').length === 9 && setTin(formatTIN(tin))} placeholder="000-000-000" className="form-input font-mono" />
                  </div>
                  <div>
                    <label className="form-label">Branch Code</label>
                    <input value={branchCode} onChange={e => setBranchCode(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} placeholder="0000" className="form-input font-mono" />
                  </div>
                  <div>
                    <label className="form-label">Registered Name (corporate)</label>
                    <input value={registeredName} onChange={e => setRegisteredName(e.target.value)} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Last Name</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">First Name</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Middle Name</label>
                    <input value={middleName} onChange={e => setMiddleName(e.target.value)} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label text-red-500">ATC Code *</label>
                    <select value={atcCode} onChange={e => setAtcCode(e.target.value)} className="form-input">
                      <option value="">— Select ATC —</option>
                      {atcList.map(a => <option key={a.code} value={a.code}>{a.code} — {(a.rate * 100).toFixed(a.rate * 100 % 1 ? 1 : 0)}% — {a.description.slice(0, 60)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Tax Rate (auto)</label>
                    <input readOnly value={selectedAtc ? `${(taxRate * 100).toFixed(2)}%` : '—'} className="form-input bg-slate-100 dark:bg-slate-800 font-bold text-emerald-600 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="form-label text-red-500">Amount of Income Payment *</label>
                    <input value={incomePayment} onChange={e => /^[0-9.,]*$/.test(e.target.value) && setIncomePayment(e.target.value)} placeholder="0.00" className="form-input text-right font-bold text-amber-900 dark:text-amber-300" />
                  </div>
                  <div>
                    <label className="form-label">Amount of Tax Withheld (auto)</label>
                    <input readOnly value={actualAmtWthld ? `₱${actualAmtWthld.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} className="form-input bg-slate-100 dark:bg-slate-800 font-bold text-orange-600 cursor-not-allowed" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleSave} disabled={saving}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
                      <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Entry'}
                    </button>
                  </div>
                </div>
                {formErrors.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">Validation errors (mirrors BIR module messages):</p>
                    <ul className="text-xs text-red-500 list-disc list-inside space-y-0.5">{formErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {/* Validation results */}
            {validationResults && (
              <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-500" /> Validation Results</h3>
                  <button onClick={() => setValidationResults(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {validationResults.map(r => (
                    <div key={r.id} className={`text-xs p-2 rounded-lg ${r.errors.length ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'}`}>
                      <span className="font-bold">#{r.seq} {r.name}:</span>{' '}
                      {r.errors.length ? r.errors.join(' ') : 'PASSED'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entries list */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Entries — {MONTHS[month - 1]} {year} ({entries.length})</h3>
                <div className="text-xs text-slate-500">Income: <b className="text-emerald-600">₱{totals.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b> · Withheld: <b className="text-orange-600">₱{totals.withheld.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div>
              </div>
              {loading ? <p className="p-8 text-center text-xs text-slate-400">Loading…</p> : entries.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">No alphalist entries for this period yet. Add one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Sched</th>
                        <th className="px-3 py-2 text-left">TIN</th><th className="px-3 py-2 text-left">Payee Name</th>
                        <th className="px-3 py-2 text-left">ATC</th><th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Income Payment</th><th className="px-3 py-2 text-right">Tax Withheld</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {entries.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-bold text-slate-400">{e.sequenceNum}</td>
                          <td className="px-3 py-2 font-mono font-bold">{e.scheduleNum}</td>
                          <td className="px-3 py-2 font-mono">{formatTIN(e.tin)}{e.branchCode ? `-${e.branchCode}` : ''}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{e.registeredName || `${e.lastName}, ${e.firstName} ${e.middleName}`}</td>
                          <td className="px-3 py-2 font-mono font-bold text-indigo-600">{e.atcCode}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-bold">{(e.taxRate * 100).toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right font-bold">₱{e.incomePayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-bold text-orange-600">₱{e.actualAmtWthld.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right">{canDelete && <button onClick={() => handleDelete(e.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-slate-500">TOTALS</td>
                        <td className="px-3 py-2 text-right">₱{totals.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right text-orange-600">₱{totals.withheld.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Annual 1604 summary (aggregation by ATC) */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Annual 1604 Summary — {module} · {year} (aggregated by ATC)</h3>
              <p className="text-[11px] text-slate-400 mt-1">1604-E aggregates monthly 1601E; 1604-CF aggregates monthly 1601F. Use with the official eBIRForms package for final submission.</p>
            </div>
            {annualRows.length === 0 ? <p className="p-8 text-center text-xs text-slate-400">No entries for {year} in this module.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[10px]">
                    <tr><th className="px-3 py-2 text-left">ATC</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right"># Payees</th><th className="px-3 py-2 text-right">Total Income Payment</th><th className="px-3 py-2 text-right">Total Tax Withheld</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {annualRows.map(r => (
                      <tr key={r.atcCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono font-bold text-indigo-600">{r.atcCode}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-bold">{(r.rate * 100).toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">{r.count}</td>
                        <td className="px-3 py-2 text-right font-bold">₱{r.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-bold text-orange-600">₱{r.withheld.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-slate-500">TOTAL</td>
                      <td className="px-3 py-2 text-right">₱{annualRows.reduce((s, r) => s + r.income, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right text-orange-600">₱{annualRows.reduce((s, r) => s + r.withheld, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
