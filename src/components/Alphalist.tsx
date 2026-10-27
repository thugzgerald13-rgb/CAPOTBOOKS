import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../lib/supabase';
import { MONTHS, formatTIN } from '../lib/utils';
import { buildMonthlyAlphalistPrintHtml, buildMonthlyAlphalistRows, type MonthlyAlphalistPayeeRow, type MonthlyAlphalistWorkflowState } from '../lib/monthlyAlphalist';
import { printHtml } from '../lib/reliefInquiry';
import { ALPHALIST_ATC_BY_MODULE, type AlphalistAtcEntry } from '../lib/alphalistAtc';
import { usePermission } from '../lib/teamPermissions';
import { FileSpreadsheet, Plus, Trash2, ShieldCheck, Save, Users, Receipt, Landmark, X, Printer, Lock, Unlock, ArrowRightLeft } from 'lucide-react';

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
  const { currentClient, currentClientId, showToast } = useAccounting();
  const canAdd = usePermission('edit_transactions');
  const canDelete = usePermission('delete_transactions');
  const canExport = usePermission('export_data');
  const canPrint = usePermission('view_reports');

  const [module, setModule] = useState<AlphaModule>('1601E');
  const [view, setView] = useState<'entry' | 'annual' | 'monthly-payees'>('entry');
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

  // Monthly Alphalist month assignment and filing state is persisted per client
  // in relief_records, matching the RELIEF page's cross-session workflow.
  const [monthlyWorkflow, setMonthlyWorkflow] = useState<MonthlyAlphalistWorkflowState>({ transfers: {}, filedMonths: {} });
  const [monthlyWorkflowStatus, setMonthlyWorkflowStatus] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error'>('idle');
  const [monthlyWorkflowClientId, setMonthlyWorkflowClientId] = useState<string | null>(null);

  const returnPeriod = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthlyPayeeMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyWorkflowReady = !!currentClientId && monthlyWorkflowClientId === currentClientId && monthlyWorkflowStatus === 'ready';
  const isMonthlyPayeeMonthFiled = !!monthlyWorkflow.filedMonths[monthlyPayeeMonthKey];
  const monthlyPayeeRows = useMemo(
    () => buildMonthlyAlphalistRows(currentClient, month, year, monthlyWorkflow),
    [currentClient, month, year, monthlyWorkflow],
  );
  const monthlyPayeeTotals = useMemo(() => ({
    income: monthlyPayeeRows.reduce((sum, row) => sum + row.incomePayment, 0),
    withheld: monthlyPayeeRows.reduce((sum, row) => sum + row.taxWithheld, 0),
  }), [monthlyPayeeRows]);
  const reportCompanyName = currentClient?.tradeName?.trim() || currentClient?.registeredName?.trim() || currentClient?.name || '';
  const reportAddress = currentClient?.address?.trim() || [currentClient?.substreet, currentClient?.street, currentClient?.barangay, currentClient?.district, currentClient?.city, currentClient?.zipCode].filter(Boolean).join(', ');
  const reportOwnerName = currentClient?.proprietor?.trim() || [currentClient?.firstName, currentClient?.middleName, currentClient?.lastName].filter(Boolean).join(' ') || currentClient?.name || '';

  useEffect(() => {
    if (!currentClientId) {
      setMonthlyWorkflow({ transfers: {}, filedMonths: {} });
      setMonthlyWorkflowClientId(null);
      setMonthlyWorkflowStatus('idle');
      return;
    }

    let cancelled = false;
    setMonthlyWorkflowStatus('loading');
    setMonthlyWorkflowClientId(null);
    (async () => {
      const { data, error } = await supabase
        .from('relief_records')
        .select('record_type,record_id,data')
        .eq('client_id', currentClientId)
        .in('record_type', ['alphalist_transfer', 'alphalist_filed']);
      if (cancelled) return;
      if (error) {
        console.warn('[Alphalist] month workflow load failed:', error.message);
        setMonthlyWorkflowStatus('error');
        showToast(`Monthly Alphalist month controls could not load: ${error.message}. Apply scripts/alphalist_monthly_workflow.sql in Supabase.`);
        return;
      }

      const next: MonthlyAlphalistWorkflowState = { transfers: {}, filedMonths: {} };
      for (const record of data || []) {
        const recordId = String((record as any).record_id || '');
        const payload = ((record as any).data || {}) as Record<string, any>;
        if ((record as any).record_type === 'alphalist_transfer' && recordId && payload.fromMonth && payload.toMonth) {
          next.transfers[recordId] = { fromMonth: String(payload.fromMonth), toMonth: String(payload.toMonth) };
        } else if ((record as any).record_type === 'alphalist_filed' && /^\d{4}-\d{2}$/.test(recordId)) {
          next.filedMonths[recordId] = {
            filedAt: String(payload.filedAt || ''),
            purchaseIds: Array.isArray(payload.purchaseIds) ? payload.purchaseIds.map(String) : [],
          };
        }
      }
      setMonthlyWorkflow(next);
      setMonthlyWorkflowClientId(currentClientId);
      setMonthlyWorkflowStatus('ready');
    })().catch((error: any) => {
      if (cancelled) return;
      console.error('[Alphalist] month workflow load failed:', error);
      setMonthlyWorkflowStatus('error');
      showToast(`Monthly Alphalist month controls could not load: ${error?.message || 'Unexpected error'}. Check the Supabase migration and permissions.`);
    });

    return () => { cancelled = true; };
  // AccountingContext recreates showToast on each render; reload only when the active profile changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId]);

  const handlePrintMonthlyPayees = () => {
    if (!canPrint) { showToast('You do not have permission to print reports.'); return; }
    printHtml(buildMonthlyAlphalistPrintHtml(currentClient, month, year, monthlyPayeeRows));
  };

  const handleMonthlyPayeeTransfer = async (row: MonthlyAlphalistPayeeRow, targetMonth: string) => {
    if (!currentClientId) { showToast('Select a business profile before transferring Alphalist data.'); return; }
    if (!canAdd) { showToast('You do not have permission to transfer Monthly Alphalist data.'); return; }
    if (!monthlyWorkflowReady) { showToast('Monthly Alphalist cloud data is still loading. Please retry.'); return; }
    if (isMonthlyPayeeMonthFiled) { showToast('This Alphalist month is FILED and locked. Click Amend before transferring data.'); return; }
    if (targetMonth === monthlyPayeeMonthKey) return;

    if (targetMonth === '__reset__') {
      const idsToReset = row.purchaseSources.map(source => source.id).filter(id => !!monthlyWorkflow.transfers[id]);
      if (!idsToReset.length) return;
      setMonthlyWorkflowStatus('saving');
      const { error } = await supabase.from('relief_records').delete()
        .eq('client_id', currentClientId).eq('record_type', 'alphalist_transfer').in('record_id', idsToReset);
      if (error) {
        setMonthlyWorkflowStatus('ready');
        showToast(`Could not reset Alphalist month transfer: ${error.message}`);
        return;
      }
      setMonthlyWorkflow(prev => {
        const transfers = { ...prev.transfers };
        idsToReset.forEach(id => { delete transfers[id]; });
        return { ...prev, transfers };
      });
      setMonthlyWorkflowStatus('ready');
      showToast('Alphalist month transfer reset. The entries returned to their original or automatically assigned unfiled month.');
      return;
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth) || targetMonth.slice(0, 4) !== String(year)
      || targetMonth <= monthlyPayeeMonthKey || monthlyWorkflow.filedMonths[targetMonth]) {
      showToast('Transfers are allowed only to a succeeding, unfiled month in the same calendar year.');
      return;
    }
    if (row.purchaseSources.some(source => source.sourceMonth.slice(0, 4) !== String(year) || targetMonth <= source.sourceMonth)) {
      showToast('Every purchase must move forward to a later month within its original calendar year.');
      return;
    }

    const changedAt = new Date().toISOString();
    const records = row.purchaseSources.map(source => ({
      client_id: currentClientId,
      record_type: 'alphalist_transfer',
      record_id: source.id,
      data: { purchaseId: source.id, fromMonth: source.sourceMonth, toMonth: targetMonth, changedAt },
    }));
    setMonthlyWorkflowStatus('saving');
    const { error } = await supabase.from('relief_records').upsert(records, { onConflict: 'client_id,record_type,record_id' });
    if (error) {
      setMonthlyWorkflowStatus('ready');
      showToast(`Could not save Alphalist month transfer: ${error.message}. Confirm scripts/alphalist_monthly_workflow.sql was applied.`);
      return;
    }
    setMonthlyWorkflow(prev => ({
      ...prev,
      transfers: {
        ...prev.transfers,
        ...Object.fromEntries(row.purchaseSources.map(source => [source.id, { fromMonth: source.sourceMonth, toMonth: targetMonth }])),
      },
    }));
    setMonthlyWorkflowStatus('ready');
    showToast(`Transferred ${row.purchaseSources.length} purchase record(s) to ${MONTHS[Number(targetMonth.slice(5, 7)) - 1]} ${year}.`);
  };

  const handleFileMonthlyPayees = async () => {
    if (!currentClientId) { showToast('Select a business profile before filing the Monthly Alphalist.'); return; }
    if (!canAdd) { showToast('You do not have permission to file the Monthly Alphalist.'); return; }
    if (!monthlyWorkflowReady) { showToast('Monthly Alphalist cloud data is still loading. Please retry.'); return; }
    if (isMonthlyPayeeMonthFiled) return;

    const purchaseSources = Array.from(new Map(monthlyPayeeRows.flatMap(row => row.purchaseSources).map(source => [source.id, source])).values());
    const purchaseIds = purchaseSources.map(source => source.id);
    const filedAt = new Date().toISOString();
    // Materialize any automatic rollover into a stable month assignment before filing.
    // This mirrors RELIEF: entries already assigned to another period stay there if amended later.
    const assignmentsToPersist = purchaseSources
      .filter(source => source.sourceMonth !== monthlyPayeeMonthKey && monthlyWorkflow.transfers[source.id]?.toMonth !== monthlyPayeeMonthKey)
      .map(source => ({
        client_id: currentClientId,
        record_type: 'alphalist_transfer',
        record_id: source.id,
        data: { purchaseId: source.id, fromMonth: source.sourceMonth, toMonth: monthlyPayeeMonthKey, changedAt: filedAt, autoRolloverLockedAtFile: true },
      }));

    setMonthlyWorkflowStatus('saving');
    if (assignmentsToPersist.length) {
      const { error: transferError } = await supabase.from('relief_records').upsert(assignmentsToPersist, { onConflict: 'client_id,record_type,record_id' });
      if (transferError) {
        setMonthlyWorkflowStatus('ready');
        showToast(`Could not lock Alphalist month assignments: ${transferError.message}`);
        return;
      }
      setMonthlyWorkflow(prev => ({
        ...prev,
        transfers: {
          ...prev.transfers,
          ...Object.fromEntries(assignmentsToPersist.map(record => [record.record_id, {
            fromMonth: String((record.data as any).fromMonth), toMonth: String((record.data as any).toMonth),
          }])),
        },
      }));
    }

    const { error } = await supabase.from('relief_records').insert({
      client_id: currentClientId,
      record_type: 'alphalist_filed',
      record_id: monthlyPayeeMonthKey,
      data: { monthKey: monthlyPayeeMonthKey, filedAt, purchaseIds, rowCount: monthlyPayeeRows.length },
    }, { onConflict: 'client_id,record_type,record_id' });
    if (error) {
      setMonthlyWorkflowStatus('ready');
      showToast(`Monthly Alphalist filing failed: ${error.message}`);
      return;
    }
    setMonthlyWorkflow(prev => ({
      ...prev,
      filedMonths: { ...prev.filedMonths, [monthlyPayeeMonthKey]: { filedAt, purchaseIds } },
    }));
    setMonthlyWorkflowStatus('ready');
    showToast(`Monthly Alphalist for ${MONTHS[month - 1]} ${year} is now FILED and locked. New purchases in this period will roll to the next unfiled month in the same year.`);
  };

  const handleAmendMonthlyPayees = async () => {
    if (!currentClientId || !isMonthlyPayeeMonthFiled) return;
    if (!canAdd) { showToast('You do not have permission to amend the Monthly Alphalist.'); return; }
    if (!monthlyWorkflowReady) { showToast('Monthly Alphalist cloud data is still loading. Please retry.'); return; }
    setMonthlyWorkflowStatus('saving');
    const { data, error } = await supabase.rpc('amend_alphalist_month', {
      p_client_id: currentClientId,
      p_month_key: monthlyPayeeMonthKey,
    });
    if (error) {
      setMonthlyWorkflowStatus('ready');
      showToast(`Monthly Alphalist amend failed: ${error.message}`);
      return;
    }
    if (!data) {
      setMonthlyWorkflowStatus('ready');
      showToast('The filed month was already amended or could not be found. Refresh the month status.');
      return;
    }
    setMonthlyWorkflow(prev => {
      const filedMonths = { ...prev.filedMonths };
      delete filedMonths[monthlyPayeeMonthKey];
      return { ...prev, filedMonths };
    });
    setMonthlyWorkflowStatus('ready');
    showToast(`Monthly Alphalist for ${MONTHS[month - 1]} ${year} is now AMENDED and unlocked. Existing transfers to other months remain in place.`);
  };

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
      <PageHeader title={view === 'monthly-payees' ? 'Monthly Alphalist of Payees' : 'Alphalist Data Entry & Validation'} icon={<Users className="w-5 h-5 text-indigo-500" />} actions={view === 'monthly-payees' ? (
        <button type="button" onClick={handlePrintMonthlyPayees} disabled={!canPrint} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 disabled:opacity-40" title="Print Monthly Alphalist of Payees">
          <Printer className="w-4 h-4" /> Print
        </button>
      ) : undefined} />
      <div className="p-4 md:p-6 flex-1 flex flex-col gap-5">
        {/* Alphalist pages and withholding report */}
        <div className="flex flex-wrap gap-2">
          {view !== 'monthly-payees' && MODULES.map(m => (
            <button key={m.id} onClick={() => { setModule(m.id); setValidationResults(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${module === m.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
              {m.icon}<span>{m.label}</span>
            </button>
          ))}
          <div className="flex-1" />
          {view !== 'monthly-payees' && (
            <button onClick={() => setView(view === 'entry' ? 'annual' : 'entry')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 border border-slate-200 dark:border-slate-700">
              {view === 'entry' ? 'Annual 1604 Summary →' : '← Monthly Data Entry'}
            </button>
          )}
          <button onClick={() => setView(view === 'monthly-payees' ? 'entry' : 'monthly-payees')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border ${view === 'monthly-payees' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'}`}>
            {view === 'monthly-payees' ? '← Back to Alphalist' : 'Monthly Alphalist of Payees →'}
          </button>
        </div>
        {view !== 'monthly-payees' && <p className="text-xs text-slate-500 -mt-3">{mod.sub} · {mod.form}</p>}

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
        ) : view === 'annual' ? (
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
        ) : (
          /* One-page Monthly Alphalist of Payees, sourced only from Expense History purchases with withholding. */
          <div className="flex flex-col gap-4">
            <div className="no-print flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">For the month of:</span>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Automatic from Expense History purchases with withholding tax.</span>
              <div className="flex-1" />
              {isMonthlyPayeeMonthFiled ? (
                <button type="button" onClick={() => void handleAmendMonthlyPayees()} disabled={!canAdd || !monthlyWorkflowReady}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 text-xs font-bold hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40">
                  <Unlock className="w-4 h-4" /> Amend
                </button>
              ) : (
                <button type="button" onClick={() => void handleFileMonthlyPayees()} disabled={!canAdd || !monthlyWorkflowReady}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40">
                  <Lock className="w-4 h-4" /> Mark as Filed
                </button>
              )}
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${monthlyWorkflowStatus === 'error' ? 'text-red-600 dark:text-red-400' : isMonthlyPayeeMonthFiled ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {monthlyWorkflowStatus === 'loading' ? 'Loading month status…' : monthlyWorkflowStatus === 'saving' ? 'Saving…' : monthlyWorkflowStatus === 'error' ? 'Sync error' : isMonthlyPayeeMonthFiled ? 'FILED · LOCKED' : 'UNFILED'}
              </span>
            </div>

            <div className="no-print flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3 text-xs text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-indigo-500" /> Transfer payee rows forward to a later, unfiled month in the same calendar year. Transfers do not change Expense History purchases.</span>
              {isMonthlyPayeeMonthFiled && <span className="font-bold text-emerald-700 dark:text-emerald-300">This month is locked. Amend it before changing transfers.</span>}
            </div>

            <div className="monthly-alphalist-paper bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm p-5 md:p-8">
              <header className="text-center mb-6">
                <h2 className="text-base md:text-lg font-black uppercase tracking-wide">{reportCompanyName || 'BUSINESS NAME'}</h2>
                {currentClient?.tin && <p className="text-sm font-semibold mt-1">{currentClient.tin}</p>}
                {reportAddress && <p className="text-xs mt-1">{reportAddress}</p>}
                <h3 className="text-base md:text-lg font-black mt-5 tracking-wide">MONTHLY ALPHALIST OF PAYEES</h3>
                <p className="text-sm mt-1">For the month of {MONTHS[month - 1]} {year}</p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="text-[10px] uppercase tracking-wide">
                    {['#', 'Taxpayer Identification Number', 'Name of Payees', 'ATC Code', 'Nature of Payment', 'Amount of Income Payment', 'Tax Rate', 'Amount of Tax Withheld'].map(label => <th key={label} className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-center font-black align-middle">{label}</th>)}
                    <th className="no-print border border-slate-500 dark:border-slate-600 px-2 py-2 text-center font-black align-middle">Claim Month</th>
                  </tr></thead>
                  <tbody>
                    {monthlyPayeeRows.length === 0 ? <tr><td colSpan={9} className="border border-slate-500 dark:border-slate-600 px-3 py-8 text-center text-slate-500 dark:text-slate-400">No withholding purchase records found for {MONTHS[month - 1]} {year}.</td></tr> : monthlyPayeeRows.map((row, index) => {
                      const latestSourceMonth = row.purchaseSources.reduce((latest, source) => source.sourceMonth > latest ? source.sourceMonth : latest, '0000-00');
                      const minimumFutureMonth = latestSourceMonth > monthlyPayeeMonthKey ? latestSourceMonth : monthlyPayeeMonthKey;
                      const hasSavedTransfer = row.purchaseSources.some(source => !!monthlyWorkflow.transfers[source.id]);
                      return (
                      <tr key={`${row.tin}-${row.name}-${row.atcCode}-${row.natureOfPayment}-${row.taxRate}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-center">{index + 1}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 font-mono">{row.tin || '—'}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 font-semibold">{row.name}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 font-mono font-bold">{row.atcCode || '—'}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2">{row.natureOfPayment}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right whitespace-nowrap">{row.incomePayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right whitespace-nowrap">{(row.taxRate * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%</td>
                        <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right whitespace-nowrap">{row.taxWithheld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="no-print border border-slate-500 dark:border-slate-600 px-2 py-2 min-w-[180px]">
                          <select value={monthlyPayeeMonthKey} onChange={e => void handleMonthlyPayeeTransfer(row, e.target.value)} disabled={!canAdd || !monthlyWorkflowReady || isMonthlyPayeeMonthFiled}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 py-1.5 text-[11px] disabled:opacity-50" aria-label={`Transfer ${row.name} to another month`}>
                            <option value={monthlyPayeeMonthKey}>{MONTHS[month - 1]} {year} (current)</option>
                            {MONTHS.map((targetName, targetIndex) => {
                              const targetKey = `${year}-${String(targetIndex + 1).padStart(2, '0')}`;
                              return targetKey > minimumFutureMonth && !monthlyWorkflow.filedMonths[targetKey]
                                ? <option key={targetKey} value={targetKey}>{targetName} {year}</option> : null;
                            })}
                            {hasSavedTransfer && <option value="__reset__">Reset transfer</option>}
                          </select>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                  <tfoot><tr className="font-black">
                    <td colSpan={5} className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right tracking-widest">T O T A L</td>
                    <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right whitespace-nowrap">{monthlyPayeeTotals.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="border border-slate-500 dark:border-slate-600 px-2 py-2"></td>
                    <td className="border border-slate-500 dark:border-slate-600 px-2 py-2 text-right whitespace-nowrap">{monthlyPayeeTotals.withheld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="no-print border border-slate-500 dark:border-slate-600 px-2 py-2"></td>
                  </tr></tfoot>
                </table>
              </div>
              <div className="mt-14 w-72 max-w-full text-center">
                <div className="border-b border-slate-700 dark:border-slate-300 pb-1 text-sm font-black uppercase">{reportOwnerName || 'Owner'}</div>
                <p className="text-xs mt-1">Owner</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
