import React, { useState, useMemo, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { PageHeader, Button, Card, CardContent, Select, Field, Input, EmptyState, Badge, Modal } from './ui';
import { buildInquiry, inquiryAoa, inquiryPrintHtml, printHtml, formatMoney, taxMonthLabel, type InquiryReport } from '../lib/reliefInquiry';
import { fetchHistoryMonthRecords } from '../lib/historySource';
import { ReliefReportPreviewModal } from "./ReliefReportPreviewModal";
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { useGranularPermissions } from '../lib/useGranularPermissions';
import { supabase } from '../lib/supabase';
import { FileText, Receipt, ShoppingCart, Boxes, FileDown, Plus, Trash2, Undo2, Search, Printer, FileSpreadsheet, ArrowLeft, Lock, Unlock, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * BIR RELIEF (Reconciliation of Listings for Enforcement) — SLSP.
 *
 * EXPORT FORMAT — aligned character-for-character to BIR Relief-generated
 * samples (…S032026.DAT / …P032026.DAT):
 *
 *   FILENAME : <9-digit TIN><S|P|I><MM><YYYY>.DAT
 *   H,S,"tin","regName","last","first","middle","trade","addr1","addr2",
 *       exempt,zeroRated,taxable,outputVAT,<RDO>,<MM/DD/YYYY last day>,<FY-end month>
 *   D,S,"tin","name",,,,"addr1(city)","addr2(province)",exempt,zeroRated,taxable,outputVAT,ownerTin,<date>
 *   H,P,... same owner block, then 8 amounts:
 *       exempt,zeroRated,services,capital,goodsOther,totalInputVAT,creditable,nonCreditable
 *   D,P,"tin","name",,,,"city","province",exempt,zeroRated,services,capital,goodsOther,inputVAT,ownerTin,<date>
 *   Header amounts are always 2-decimals ("0.00"); detail zero amounts are "0".
 *   Consolidated rows: "000000001" VARIOUS SALES / "000000002" VARIOUS PURCHASES.
 *   D,I (importations) is unchanged (no sample supplied).
 * Source: reverse-engineered from BIR Relief v2.3 (birrlf2.exe genfile/mfilter) and the
 * validation module (valrlf2.3.exe): sales amount order is Exempt, Zero-Rated, Taxable,
 * Output Tax; purchase header Input Tax must equal Creditable + Non-Creditable; names/
 * addresses may not contain , " $ & ' \ ` | ~ or non-ASCII; RDO is exactly 3 chars; the
 * tax-month date is the last day of the month; header totals must equal sum of details.
 */

type ReliefTab = 'sales' | 'purchases' | 'imports';

const TABS: { id: ReliefTab; label: string; icon: React.ReactNode; typeCode: string; hint: string }[] = [
  { id: 'sales', label: 'Sales', icon: <Receipt className="w-4 h-4" />, typeCode: 'S', hint: 'Output VAT' },
  { id: 'purchases', label: 'Purchases', icon: <ShoppingCart className="w-4 h-4" />, typeCode: 'P', hint: 'Input VAT' },
  { id: 'imports', label: 'Importation', icon: <Boxes className="w-4 h-4" />, typeCode: 'I', hint: 'Imports' },
];

interface ImportRow {
  id: string;
  entryNo: string;
  assessDate: string;
  registeredName: string;
  country: string;
  dutiableValue: number;
  charges: number;
  vat: number;
  orNumber: string;
  vatPaymentDate: string;
}

const emptyImport = (): ImportRow => ({
  id: Math.random().toString(36).slice(2, 9),
  entryNo: '', assessDate: '', registeredName: '', country: '',
  dutiableValue: 0, charges: 0, vat: 0, orNumber: '', vatPaymentDate: '',
});

interface TransferEntry {
  toMonth: string;
  tin: string;
  name: string;
  address: string;
  exempt: number;
  zeroRated: number;
  services: number;
  capital: number;
  goodsOther: number;
  inputTax: number;
}
type TransfersMap = Record<string, TransferEntry>;

const fmt = (n: number) => (Number(n) || 0).toFixed(2);
const describeSupabaseError = (error: any): string => [
  error?.message ? `Message: ${error.message}` : '',
  error?.code ? `Code: ${error.code}` : '',
  error?.details ? `Details: ${error.details}` : '',
  error?.hint ? `Hint: ${error.hint}` : '',
].filter(Boolean).join(' | ') || 'Unknown Supabase error';
const csvQ = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
const monthKeyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const monthKeyYear = (key: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(key || ''));
  return match ? Number(match[1]) : null;
};
const isSameCalendarYear = (fromMonth: string, toMonth: string) => {
  const fromYear = monthKeyYear(fromMonth);
  const toYear = monthKeyYear(toMonth);
  return fromYear !== null && toYear !== null && fromYear === toYear;
};
// Samples use the LAST day of the tax month, MM/DD/YYYY (e.g. 03/31/2026).
const taxMonthDate = (y: number, m: number) =>
  `${String(m).padStart(2, '0')}/${String(new Date(y, m, 0).getDate()).padStart(2, '0')}/${y}`;
// Detail amounts: zero is written as "0", everything else with 2 decimals.
const fmtD = (n: number) => ((Number(n) || 0) === 0 ? '0' : (Number(n) || 0).toFixed(2));
const up = (s?: string) => String(s || '').toUpperCase();
const tin9 = (s?: string) => String(s || '').replace(/\D/g, '').slice(0, 9).padStart(9, '0');
const VARIOUS_SALES_TIN = '000000001';
const VARIOUS_PURCHASES_TIN = '000000002';

const PH_PROVINCES = ['METRO MANILA','NCR','ABRA','AGUSAN DEL NORTE','AGUSAN DEL SUR','AKLAN','ALBAY','ANTIQUE','APAYAO','AURORA','BASILAN','BATAAN','BATANES','BATANGAS','BENGUET','BILIRAN','BOHOL','BUKIDNON','BULACAN','CAGAYAN','CAMARINES NORTE','CAMARINES SUR','CAMIGUIN','CAPIZ','CATANDUANES','CAVITE','CEBU','COTABATO','DAVAO DE ORO','DAVAO DEL NORTE','DAVAO DEL SUR','DAVAO OCCIDENTAL','DAVAO ORIENTAL','DINAGAT ISLANDS','EASTERN SAMAR','GUIMARAS','IFUGAO','ILOCOS NORTE','ILOCOS SUR','ILOILO','ISABELA','KALINGA','LA UNION','LAGUNA','LANAO DEL NORTE','LANAO DEL SUR','LEYTE','MAGUINDANAO','MARINDUQUE','MASBATE','MISAMIS OCCIDENTAL','MISAMIS ORIENTAL','MOUNTAIN PROVINCE','NEGROS OCCIDENTAL','NEGROS ORIENTAL','NORTHERN SAMAR','NUEVA ECIJA','NUEVA VIZCAYA','OCCIDENTAL MINDORO','ORIENTAL MINDORO','PALAWAN','PAMPANGA','PANGASINAN','QUEZON','QUIRINO','RIZAL','ROMBLON','SAMAR','SARANGANI','SIQUIJOR','SORSOGON','SOUTH COTABATO','SOUTHERN LEYTE','SULTAN KUDARAT','SULU','SURIGAO DEL NORTE','SURIGAO DEL SUR','TARLAC','TAWI-TAWI','ZAMBALES','ZAMBOANGA DEL NORTE','ZAMBOANGA DEL SUR','ZAMBOANGA SIBUGAY'];

/** Split a free-text "City, Province" / "City Province" string into separate city and province values (no commas in output). */
function splitCityProvince(text?: string): { city: string; province: string } {
  const t = up(text).replace(/\b\d{4}\b/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return { city: '', province: '' };
  if (t.includes(',')) {
    const parts = t.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) return { city: parts[parts.length - 2], province: parts[parts.length - 1] };
    return { city: parts[0] || '', province: '' };
  }
  const prov = [...PH_PROVINCES].sort((a, b) => b.length - a.length).find(p => t === p || t.endsWith(' ' + p));
  if (prov && t !== prov) return { city: t.slice(0, t.length - prov.length).trim(), province: prov };
  return { city: t, province: '' };
}
// Relief validator (valname) rejects: control chars, " $ & ' , \ ` | ~ and anything outside plain ASCII.
// Ñ/ñ become N; every other offending character becomes a space. Optionally truncated to the Relief field width.
function clean(s: any, max = 0): string {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    const c = ch.charCodeAt(0);
    if (c === 209 || c === 241) out += 'N';
    else if (c <= 31 || [34, 36, 38, 39, 44, 92, 96, 124].includes(c) || c >= 126) out += ' ';
    else out += ch;
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  return max ? out.slice(0, max).trim() : out;
}
const q = (s: string, max = 0) => `"${clean(s, max)}"`;
/** Relief RDO field is exactly 3 chars: 57 -> 057, 043B -> 43B. */
function rdo3(raw?: string): string {
  const m = /^(\d+)([A-Za-z]?)$/.exec(String(raw || '').trim());
  if (!m) return String(raw || '').trim().slice(0, 3);
  const n = String(Number(m[1]));
  return m[2] ? (n.padStart(2, '0') + m[2].toUpperCase()).slice(0, 3) : n.padStart(3, '0').slice(0, 3);
}

export function Relief() {
  const { currentClient, currentClientId, reliefTab, setReliefTab, showToast } = useAccounting();
  const { canAction: canReliefAction, canDropdownOption: canReliefDropdown } = useGranularPermissions('relief');
  const canPrint = usePermission('view_reports') && canReliefAction('print');
  const canExport = usePermission('export_data') && canReliefAction('export');
  const canEditTransfers = canReliefAction('edit') && canReliefDropdown('relief_action', 'edit_transfers');
  const canResetTransfers = usePermission('delete_transactions') && canReliefDropdown('relief_action', 'reset_transfers');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const importRowsRef = useRef<ImportRow[]>(importRows);
  importRowsRef.current = importRows;
  const [importRowsDirty, setImportRowsDirty] = useState(false);
  const [importRetryToken, setImportRetryToken] = useState(0);
  const importRevisionRef = useRef(0);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  // RELIEF detail rows come from the Income History (sales) and Expense History
  // (purchases) pages — fetched for the selected tax month through the shared
  // ../lib/historySource.ts module so RELIEF and History show identical records.
  const [historyRecords, setHistoryRecords] = useState<{ purchases: any[]; sales: any[] } | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyFetchToken = useRef(0);
  useEffect(() => {
    const token = ++historyFetchToken.current;
    if (!currentClientId) {
      setHistoryRecords(null);
      setHistoryPeriod(null);
      return;
    }
    setHistoryLoading(true);
    fetchHistoryMonthRecords(currentClientId, year, month)
      .then(({ purchases, sales }) => {
        if (token !== historyFetchToken.current) return;
        setHistoryRecords({ purchases, sales });
        setHistoryPeriod(monthKeyOf(year, month));
      })
      .catch((err) => {
        if (token !== historyFetchToken.current) return;
        console.warn('[Relief] history fetch failed, falling back to client cache:', err?.message || err);
        setHistoryRecords(null);
        setHistoryPeriod(null);
      })
      .finally(() => {
        if (token === historyFetchToken.current) setHistoryLoading(false);
      });
  }, [currentClientId, year, month]);
  // These settings are RELIEF-only and are persisted per active business + tax month.
  const [nonCreditable, setNonCreditable] = useState(0);
  const [consolidateNoTinPurchases, setConsolidateNoTinPurchases] = useState(false);
  const [transfers, setTransfers] = useState<TransfersMap>({});
  const [loadedReliefKey, setLoadedReliefKey] = useState<string | null>(null);
  const [reliefCloudStatus, setReliefCloudStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [reliefCloudMessage, setReliefCloudMessage] = useState('');
  const [legacyTransfersForImport, setLegacyTransfersForImport] = useState<TransfersMap | null>(null);
  // RELIEF filing lock: once a month is "Filed" for a tab, its entries are
  // snapshotted and locked. Late-encoded entries for that month roll forward
  // to the next unfiled month. "Amend" unlocks the month; entries already
  // locked to another filed month stay locked there.
  const [filedMonths, setFiledMonths] = useState<Record<string, { filedAt: string; entryIds: string[] }>>({});

  const tab = (['sales', 'purchases', 'imports'].includes(reliefTab) ? reliefTab : 'sales') as ReliefTab;
  const activeTab = TABS.find(t => t.id === tab)!;
  const monthKey = monthKeyOf(year, month);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  // Claim-month transfers are limited to the selected calendar year.
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => monthKeyOf(year, i + 1)),
    [year],
  );

  const owner = currentClient || ({} as any);
  const ownerTin = tin9(owner.tin);
  const rdoCode = rdo3(owner.rdoCode); // e.g. 057, 43B
  // Last header field in the BIR samples is the fiscal-year-end month (12 for calendar-year taxpayers).
  const fyEndMonth = owner.accountingType === 'Fiscal' && owner.fiscalMonthEnd ? owner.fiscalMonthEnd : 12;

  const reliefDataKey = currentClientId ? `${currentClientId}::${monthKey}` : null;
  const activeReliefKeyRef = useRef<string | null>(reliefDataKey);
  activeReliefKeyRef.current = reliefDataKey;
  const reliefDataReady = !!reliefDataKey && loadedReliefKey === reliefDataKey;

  const writeReliefAudit = async (
    clientId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown> = {},
  ) => {
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await supabase.from('relief_records').insert({
      client_id: clientId,
      record_type: 'audit',
      record_id: auditId,
      data: {
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        changed_at: new Date().toISOString(),
      },
    });
    // Audit failure must not silently undo an otherwise successful RELIEF change.
    if (error) console.warn('Could not write RELIEF audit record:', error.message);
  };

  const saveReliefSetting = async (nextNonCreditable: number, nextConsolidate: boolean) => {
    if (filedMonths[`${tab}|${monthKey}`]) {
      showToast('This RELIEF month is filed and locked. Amend it before changing its settings.');
      return;
    }
    if (!currentClientId || !reliefDataReady) {
      showToast('RELIEF data is still loading. Please try again when cloud data is ready.');
      return;
    }
    setReliefCloudStatus('saving');
    const { error } = await supabase.from('relief_records').upsert({
      client_id: currentClientId,
      record_type: 'settings',
      record_id: monthKey,
      data: {
        monthKey,
        nonCreditable: Math.max(0, Number(nextNonCreditable) || 0),
        consolidateNoTinPurchases: !!nextConsolidate,
      },
    }, { onConflict: 'client_id,record_type,record_id' });
    if (error) {
      setReliefCloudStatus('error');
      setReliefCloudMessage(`Could not save RELIEF settings: ${error.message}`);
      showToast('Could not save RELIEF settings to Supabase. Check the migration and permissions.');
      return;
    }
    await writeReliefAudit(currentClientId, 'settings_updated', 'settings', monthKey, {
      nonCreditable: Math.max(0, Number(nextNonCreditable) || 0),
      consolidateNoTinPurchases: !!nextConsolidate,
    });
    setReliefCloudStatus('ready');
    setReliefCloudMessage('RELIEF settings saved to Supabase for this profile and month.');
  };

  const persistImportationSnapshot = async (clientId: string, period: string, rows: ImportRow[]) => {
    const newRows = rows.map(row => ({
      client_id: clientId,
      record_type: 'importation',
      record_id: `${period}|${row.id}`,
      data: { monthKey: period, row },
    }));
    if (newRows.length) {
      const { error } = await supabase.from('relief_records').upsert(newRows, {
        onConflict: 'client_id,record_type,record_id',
      });
      if (error) throw new Error(`Could not save RELIEF importations: ${error.message}`);
    }
    const { data: existing, error: existingError } = await supabase
      .from('relief_records').select('record_id').eq('client_id', clientId)
      .eq('record_type', 'importation').like('record_id', `${period}|%`);
    if (existingError) throw new Error(`Could not reconcile RELIEF importations: ${existingError.message}`);
    const keep = new Set(newRows.map(r => r.record_id));
    const stale = (existing || []).map((r: any) => String(r.record_id)).filter((id: string) => !keep.has(id));
    if (stale.length) {
      const { error: deleteError } = await supabase.from('relief_records').delete()
        .eq('client_id', clientId).eq('record_type', 'importation').in('record_id', stale);
      if (deleteError) throw new Error(`Could not remove deleted RELIEF importations: ${deleteError.message}`);
    }
    await writeReliefAudit(clientId, 'importations_saved', 'importation', period, { count: rows.length, monthKey: period });
  };

  const changePeriod = async (nextYear: number, nextMonth: number) => {
    const nextPeriod = monthKeyOf(nextYear, nextMonth);
    if (nextPeriod === monthKey) return;
    if (importRowsDirty && currentClientId && reliefDataReady) {
      const clientId = currentClientId;
      const period = monthKey;
      setReliefCloudStatus('saving');
      try {
        let version = importRevisionRef.current;
        let snapshot = importRowsRef.current.map(r => ({ ...r }));
        let savedStableSnapshot = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          await persistImportationSnapshot(clientId, period, snapshot);
          if (version === importRevisionRef.current) {
            savedStableSnapshot = true;
            break;
          }
          version = importRevisionRef.current;
          snapshot = importRowsRef.current.map(r => ({ ...r }));
        }
        if (!savedStableSnapshot) throw new Error('Importation entries kept changing while saving. Please retry before changing the period.');
        if (activeReliefKeyRef.current === `${clientId}::${period}`) {
          setImportRowsDirty(false);
          setReliefCloudStatus('ready');
          setReliefCloudMessage(`RELIEF importations saved to Supabase for ${period}.`);
        }
      } catch (err: any) {
        setReliefCloudStatus('error');
        setReliefCloudMessage(err?.message || 'Could not save RELIEF importations.');
        showToast('Could not save importation changes. The period was not changed.');
        return;
      }
    }
    setYear(nextYear);
    setMonth(nextMonth);
  };

  // Every RELIEF-only record is loaded in the context of the currently active CAPOTBOOKS client.
  // Purchase transactions themselves are not updated by this module.
  useEffect(() => {
    let cancelled = false;
    if (!currentClientId || !monthKey) {
      setTransfers({});
      setImportRows([]);
      setImportRowsDirty(false);
      setNonCreditable(0);
      setConsolidateNoTinPurchases(false);
      setLoadedReliefKey(null);
      setReliefCloudStatus('error');
      setReliefCloudMessage('Select an active business profile to load RELIEF data.');
      return () => { cancelled = true; };
    }

    const clientId = currentClientId;
    const period = monthKey;
    const activeKey = `${clientId}::${period}`;
    setLoadedReliefKey(null);
    setReliefCloudStatus('loading');
    setReliefCloudMessage('Loading RELIEF-only data for the active profile…');
    importRevisionRef.current += 1;
    setTransfers({});
    setImportRows([]);
    setImportRowsDirty(false);
    setNonCreditable(0);
    setConsolidateNoTinPurchases(false);
    setLegacyTransfersForImport(null);

    void (async () => {
      const { data, error } = await supabase
        .from('relief_records')
        .select('record_type,record_id,data')
        .eq('client_id', clientId)
        .in('record_type', ['purchase_transfer', 'importation', 'settings', 'filed']);
      if (cancelled) return;
      if (error) {
        setReliefCloudStatus('error');
        setReliefCloudMessage(`RELIEF cloud data could not be loaded: ${error.message}. Apply scripts/relief_supabase_migration.sql first.`);
        return;
      }

      const records = data || [];
      const transferRecords = records.filter((r: any) => r.record_type === 'purchase_transfer');
      const nextTransfers: TransfersMap = Object.fromEntries(
        transferRecords.map((r: any) => [String(r.record_id), (r.data || {}) as TransferEntry]),
      );
      const monthImports = records
        .filter((r: any) => r.record_type === 'importation' && r.data?.monthKey === period && r.data?.row)
        .map((r: any) => r.data.row as ImportRow);
      const setting = records.find((r: any) => r.record_type === 'settings' && String(r.record_id) === period)?.data || {};

      setTransfers(nextTransfers);
      setImportRows(monthImports);
      setImportRowsDirty(false);
      setNonCreditable(Math.max(0, Number(setting.nonCreditable) || 0));
      setConsolidateNoTinPurchases(!!setting.consolidateNoTinPurchases);
      const filedRecords = records.filter((r: any) => r.record_type === 'filed');
      const nextFiled: Record<string, { filedAt: string; entryIds: string[] }> = {};
      for (const r of filedRecords) {
        const k = String(r.record_id);
        nextFiled[k] = { filedAt: r.data?.filedAt || '', entryIds: Array.isArray(r.data?.entryIds) ? r.data.entryIds : [] };
      }
      setFiledMonths(nextFiled);
      setLoadedReliefKey(activeKey);
      setReliefCloudStatus('ready');
      setReliefCloudMessage(`RELIEF data loaded from Supabase for ${owner.registeredName || owner.name || clientId}.`);

      // Older releases used one browser-wide key. Never assign those transfers to a profile silently;
      // offer explicit import only when the selected profile has no cloud transfers.
      if (transferRecords.length === 0) {
        try {
          const legacy = JSON.parse(localStorage.getItem('relief-purchase-transfers') || '{}') as TransfersMap;
          if (legacy && Object.keys(legacy).length > 0) setLegacyTransfersForImport(legacy);
        } catch { /* malformed legacy data is intentionally ignored */ }
      }
    })().catch((err: any) => {
      if (cancelled) return;
      setReliefCloudStatus('error');
      setReliefCloudMessage(`RELIEF cloud data could not be loaded: ${err?.message || 'Unexpected error'}`);
    });

    return () => { cancelled = true; };
  }, [currentClientId, monthKey, loadRetryToken]);

  // Importation entry edits are debounced and stored as RELIEF rows only. No accounting transaction table is touched.
  useEffect(() => {
    if (!importRowsDirty || !reliefDataReady || !currentClientId) return;
    const clientId = currentClientId;
    const period = monthKey;
    const rowsSnapshot = importRows.map(r => ({ ...r }));
    const snapshotVersion = importRevisionRef.current;
    const activeKey = `${clientId}::${period}`;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (activeReliefKeyRef.current === activeKey) setReliefCloudStatus('saving');
        try {
          await persistImportationSnapshot(clientId, period, rowsSnapshot);
          if (activeReliefKeyRef.current === activeKey) {
            setReliefCloudStatus('ready');
            setReliefCloudMessage(`RELIEF importations saved to Supabase for ${period}.`);
            if (importRevisionRef.current === snapshotVersion) setImportRowsDirty(false);
          }
        } catch (err: any) {
          if (activeReliefKeyRef.current === activeKey) {
            setReliefCloudStatus('error');
            setReliefCloudMessage(err?.message || 'Could not save RELIEF importations.');
          }
        }
      })();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [importRows, importRowsDirty, reliefDataReady, currentClientId, monthKey, importRetryToken]);

  const updateImportRows = (rows: ImportRow[]) => {
    if (isMonthFiled) { showToast('This RELIEF month is filed and locked. Amend it before editing importations.'); return; }
    if (!canReliefAction('edit')) { showToast('You do not have permission to edit RELIEF importation rows.'); return; }
    importRevisionRef.current += 1;
    importRowsRef.current = rows;
    setImportRows(rows);
    setImportRowsDirty(true);
  };

  const importLegacyTransfersToActiveProfile = async () => {
    if (!canEditTransfers) { showToast('You do not have permission to edit RELIEF transfers.'); return; }
    if (!currentClientId || !reliefDataReady || !legacyTransfersForImport) {
      showToast('RELIEF cloud data must finish loading before importing legacy transfers.');
      return;
    }
    const entries = Object.entries(legacyTransfersForImport);
    if (!entries.length) return;
    const confirmed = window.confirm(
      `Import ${entries.length} old browser-stored RELIEF purchase-month transfer(s) into the currently active profile (${owner.registeredName || owner.name || currentClientId})? This affects RELIEF only and will not modify purchase transactions. Confirm that these transfers belong to this profile.`,
    );
    if (!confirmed) return;
    setReliefCloudStatus('saving');
    const rows = entries.map(([recordId, value]) => ({
      client_id: currentClientId,
      record_type: 'purchase_transfer',
      record_id: recordId,
      data: value,
    }));
    const { error } = await supabase.from('relief_records').upsert(rows, { onConflict: 'client_id,record_type,record_id' });
    if (error) {
      setReliefCloudStatus('error');
      setReliefCloudMessage(`Could not import legacy transfers: ${error.message}`);
      showToast('Could not import old RELIEF transfers into Supabase.');
      return;
    }
    setTransfers(prev => ({ ...prev, ...legacyTransfersForImport }));
    localStorage.removeItem('relief-purchase-transfers');
    setLegacyTransfersForImport(null);
    await writeReliefAudit(currentClientId, 'legacy_transfers_imported', 'purchase_transfer', 'browser-local', { count: rows.length });
    setReliefCloudStatus('ready');
    setReliefCloudMessage(`Imported ${rows.length} legacy transfer(s) into the active profile.`);
    showToast(`Imported ${rows.length} RELIEF transfer(s) into this profile. Purchases were not changed.`);
  };

  // ---- Sales: aggregate per buyer; amounts -> exempt / zero-rated / taxable / output tax ----
  const buildSalesRows = (year: number, month: number) => {
    // Source: Income History page records (shared fetch). Used only when the
    // requested month matches the loaded snapshot; otherwise fall back to the
    // AccountingContext client cache (needed for multi-month inquiry reports).
    const useSnapshot = historyRecords && historyPeriod === monthKeyOf(year, month);
    const sales = (useSnapshot ? historyRecords!.sales : (currentClient?.sales || [])) as any[];
    const inMonth = sales.filter(s => {
      const d = s.date ? new Date(s.date) : null;
      return d && d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const map = new Map<string, any>();
    for (const s of inMonth) {
      const key = `${(s.buyerTin || '').trim()}|${(s.buyerName || '').trim()}`;
      const vt = String(s.vatType || '').toLowerCase();
      const cur = map.get(key) || {
        tin: (s.buyerTin || '').trim(), regName: s.buyerName || '', lastName: '', firstName: '', middleName: '',
        addr1: s.buyerAddress || '', addr2: '', exempt: 0, zeroRated: 0, taxable: 0, outputTax: 0, count: 0,
      };
      const amt = Number(s.amount || 0);
      // Non-VAT / exempt sales -> exempt; zero-rated -> zero-rated.
      if (vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat')) cur.exempt += amt;
      else if (vt.includes('zero')) cur.zeroRated += amt;
      else cur.taxable += amt;
      cur.outputTax += Number(s.outputTax || 0);
      cur.count += 1;
      map.set(key, cur);
    }
    // Sales to buyers without a TIN are consolidated into the BIR "VARIOUS SALES" row.
    const rows = [...map.values()];
    const named = rows.filter(r => r.tin).sort((a, b) => a.regName.localeCompare(b.regName));
    const noTin = rows.filter(r => !r.tin);
    if (noTin.length) {
      const various = noTin.reduce((a, r) => ({
        ...a, exempt: a.exempt + r.exempt, zeroRated: a.zeroRated + r.zeroRated,
        taxable: a.taxable + r.taxable, outputTax: a.outputTax + r.outputTax, count: a.count + r.count,
      }), { tin: VARIOUS_SALES_TIN, regName: 'VARIOUS SALES', lastName: '', firstName: '', middleName: '',
            addr1: '', addr2: '', exempt: 0, zeroRated: 0, taxable: 0, outputTax: 0, count: 0, various: true });
      named.push(various as any);
    }
    return named;
  };
  const salesRows = useMemo(() => buildSalesRows(year, month), [currentClient, year, month, historyRecords]);

  // ---- Purchases: TIN required; 6 amount buckets; month transfers ----
  const buildPurchases = (year: number, month: number) => {
    const monthKey = monthKeyOf(year, month);
    // Source: Expense History page records (shared fetch). Used only when the
    // requested month matches the loaded snapshot; otherwise fall back to the
    // AccountingContext client cache (needed for multi-month inquiry reports).
    const useSnapshot = historyRecords && historyPeriod === monthKeyOf(year, month);
    const purchases = (useSnapshot ? historyRecords!.purchases : (currentClient?.purchases || [])) as any[];
    const inMonth = purchases.filter(p => {
      const d = p.date ? new Date(p.date) : null;
      return d && d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const withTin = inMonth.filter(p => (p.supplierTin || '').trim() !== '');
    const noTinList = inMonth.filter(p => (p.supplierTin || '').trim() === '');
    const noTinCount = consolidateNoTinPurchases ? 0 : noTinList.length;
    const map = new Map<string, any>();
    for (const p of (consolidateNoTinPurchases ? inMonth : withTin)) {
      const noTin = (p.supplierTin || '').trim() === '';
      const key = noTin ? VARIOUS_PURCHASES_TIN : `${(p.supplierTin || '').trim()}|${(p.supplierName || '').trim()}`;
      const cur = map.get(key) || {
        tin: noTin ? VARIOUS_PURCHASES_TIN : (p.supplierTin || '').trim(), regName: noTin ? 'VARIOUS PURCHASES' : (p.supplierName || ''), lastName: '', firstName: '', middleName: '',
        addr1: noTin ? '' : (p.supplierAddress || ''), addr2: '', various: noTin,
        exempt: 0, zeroRated: 0, services: 0, capital: 0, goodsOther: 0, inputTax: 0, count: 0,
      };
      const amt = Number(p.amount || 0);
      const vt = String(p.vatType || '').toLowerCase();
      const et = String(p.accountTitle || '').toLowerCase();
      // Exempt / Zero-Rated columns are populated from the Expense History
      // record's explicit exemptAmount / zeroRatedAmount fields. When those
      // are not set, fall back to vat-type bucketing (non-vat / exempt ->
      // exempt; zero-rated -> zero-rated). The remainder is taxable.
      const explicitExempt = Number(p.exemptAmount || 0);
      const explicitZero = Number(p.zeroRatedAmount || 0);
      const isExemptType = vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat');
      const isZeroType = vt.includes('zero');
      const exemptAmt = explicitExempt > 0 ? explicitExempt : (isExemptType ? amt : 0);
      const zeroAmt = explicitZero > 0 ? explicitZero : (isZeroType ? amt : 0);
      cur.exempt += exemptAmt;
      cur.zeroRated += zeroAmt;
      // `amount` on a purchase record is the VATable NET amount only — exempt
      // and zero-rated values live in their own fields (exemptAmount /
      // zeroRatedAmount) and are bucketed above. They must NOT be subtracted
      // again from the net-of-VAT taxable amount (services / capital / goods).
      const taxableAmt = Math.max(0, amt);
      if (taxableAmt > 0) {
        if (et.includes('service')) cur.services += taxableAmt;
        else if (et.includes('capital') || et.includes('asset')) cur.capital += taxableAmt;
        else cur.goodsOther += taxableAmt; // goods other than capital goods
      }
      cur.inputTax += Number(p.inputTax || 0);
      cur.count += 1;
      map.set(key, cur);
    }
    const rows: any[] = [];
    for (const [, r] of map) {
      const tKey = `${r.tin}|${monthKey}`;
      const t = transfers[tKey];
      // Ignore old cross-year transfers. They must not keep hiding the original
      // purchase from its valid source month.
      if (t && isSameCalendarYear(monthKey, t.toMonth) && t.toMonth !== monthKey) continue;
      rows.push({ ...r, transferKey: tKey, fromMonth: monthKey, transferredIn: false });
    }
    let transferredInCount = 0;
    for (const [tKey, t] of Object.entries(transfers)) {
      const fromMonth = tKey.split('|').slice(1).join('|');
      if (t.toMonth !== monthKey || fromMonth === monthKey) continue;
      // Only show transfer-ins where the source and claim month are in the same year.
      if (!isSameCalendarYear(fromMonth, t.toMonth)) continue;
      rows.push({
        tin: t.tin, regName: t.name, lastName: '', firstName: '', middleName: '',
        addr1: t.address, addr2: '',
        exempt: t.exempt, zeroRated: t.zeroRated, services: t.services,
        capital: t.capital, goodsOther: t.goodsOther, inputTax: t.inputTax,
        count: 0, transferKey: tKey, fromMonth, transferredIn: true,
      });
      transferredInCount++;
    }
    rows.sort((a, b) => a.regName.localeCompare(b.regName));
    return { purchaseRows: rows, noTinCount, transferredInCount };
  };
  const { purchaseRows, noTinCount, transferredInCount } = useMemo(() => buildPurchases(year, month),
    [currentClient, year, month, monthKey, transfers, consolidateNoTinPurchases, historyRecords]);

  // ---- RELIEF filing lock is scoped to the exact tab + month. A filed month's
  // snapshot is shown for that month only; never filter another month's rows by
  // entry ID because source systems may reuse IDs across different periods. ----
  const filedKey = `${tab}|${monthKey}`;
  const isMonthFiled = !!filedMonths[filedKey];
  const reliefEntryKey = (r: any) =>
    String(r?.id ?? r?.recordId ?? r?.invoiceNo ?? r?.entryNo ?? `${r?.date}|${r?.supplierName || r?.buyerName || r?.registeredName || ''}|${r?.amount || r?.dutiableValue || ''}`);
  const activeRows = useMemo(() => {
    const rows: any[] = tab === 'sales' ? salesRows : tab === 'purchases' ? purchaseRows : importRows;
    if (isMonthFiled) {
      const keep = new Set(filedMonths[filedKey]?.entryIds || []);
      return rows.filter(r => keep.has(reliefEntryKey(r)));
    }
    // Filing one month must not make matching IDs disappear from other months.
    return rows;
  }, [tab, salesRows, purchaseRows, importRows, isMonthFiled, filedMonths, filedKey]);

  const movePurchaseRow = async (row: any, targetMonth: string) => {
    if (isMonthFiled) { showToast('This RELIEF month is filed and locked. Amend it before changing claim months.'); return; }
    if (!canEditTransfers) { showToast('You do not have permission to edit RELIEF transfers.'); return; }
    if (!currentClientId || !reliefDataReady) {
      showToast('RELIEF cloud data is still loading. Please retry the transfer.');
      return;
    }

    const sourceMonth = String(row.fromMonth || monthKey);
    if (!isSameCalendarYear(sourceMonth, targetMonth) || monthKeyYear(targetMonth) !== year) {
      showToast(`Claim Month must be within ${year}, the same calendar year as the purchase.`);
      return;
    }
    const currentlySelectedClaimMonth = row.transferredIn ? monthKey : sourceMonth;
    if (targetMonth === currentlySelectedClaimMonth) return;
    if (filedMonths[`purchases|${targetMonth}`]) {
      showToast(`RELIEF Purchases for ${targetMonth} is filed and locked. Amend that month before transferring to it.`);
      return;
    }

    const tKey = String(row.transferKey);
    setReliefCloudStatus('saving');
    if (targetMonth === sourceMonth) {
      const { error } = await supabase.from('relief_records').delete()
        .eq('client_id', currentClientId).eq('record_type', 'purchase_transfer').eq('record_id', tKey);
      if (error) {
        const reason = describeSupabaseError(error);
        console.error('[Relief] Could not reset purchase-month transfer in Supabase:', error);
        setReliefCloudStatus('error');
        setReliefCloudMessage(`Could not reset purchase-month transfer: ${reason}`);
        showToast(`Could not reset this RELIEF transfer: ${error.message || 'Supabase rejected the request'}${error.code ? ` (code ${error.code})` : ''}`);
        return;
      }
      setTransfers(prev => { const next = { ...prev }; delete next[tKey]; return next; });
      await writeReliefAudit(currentClientId, 'purchase_month_transfer_removed', 'purchase_transfer', tKey, { supplier: row.regName, fromMonth: row.fromMonth });
      setReliefCloudStatus('ready');
      setReliefCloudMessage('Purchase-month transfer reset in RELIEF and saved to Supabase.');
      showToast(`Moved ${row.regName || 'supplier'} back to ${row.fromMonth}.`);
      return;
    }

    const transfer: TransferEntry = {
      toMonth: targetMonth, tin: row.tin, name: row.regName, address: row.addr1,
      exempt: Number(row.exempt || 0), zeroRated: Number(row.zeroRated || 0),
      services: Number(row.services || 0), capital: Number(row.capital || 0),
      goodsOther: Number(row.goodsOther || 0), inputTax: Number(row.inputTax || 0),
    };
    const { error } = await supabase.from('relief_records').upsert({
      client_id: currentClientId, record_type: 'purchase_transfer', record_id: tKey, data: transfer,
    }, { onConflict: 'client_id,record_type,record_id' });
    if (error) {
      const reason = describeSupabaseError(error);
      console.error('[Relief] Could not save purchase-month transfer to Supabase:', error);
      setReliefCloudStatus('error');
      setReliefCloudMessage(`Could not save purchase-month transfer: ${reason}`);
      showToast(`Could not save this RELIEF transfer: ${error.message || 'Supabase rejected the request'}${error.code ? ` (code ${error.code})` : ''}`);
      return;
    }
    setTransfers(prev => ({ ...prev, [tKey]: transfer }));
    await writeReliefAudit(currentClientId, 'purchase_month_transfer_updated', 'purchase_transfer', tKey, {
      supplier: row.regName, fromMonth: row.fromMonth, toMonth: targetMonth, inputTax: transfer.inputTax,
    });
    setReliefCloudStatus('ready');
    setReliefCloudMessage(`Purchase-month transfer saved to Supabase (${row.fromMonth} → ${targetMonth}).`);
    showToast(`Transferred ${row.regName || 'supplier'} (₱${fmt(row.inputTax)} input tax) to ${targetMonth}.`);
  };

  // Totals (must equal sum of details — written into the header)
  const totals = useMemo(() => {
    if (tab === 'sales') {
      return activeRows.reduce((a, r) => ({
        v1: a.v1 + r.exempt, v2: a.v2 + r.zeroRated, v3: a.v3 + r.taxable, v4: a.v4 + r.outputTax,
        v5: 0, v6: 0, count: a.count + r.count,
      }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
    }
    if (tab === 'purchases') {
      return activeRows.reduce((a, r) => ({
        v1: a.v1 + r.exempt, v2: a.v2 + r.zeroRated, v3: a.v3 + r.services, v4: a.v4 + r.capital,
        v5: a.v5 + r.goodsOther, v6: a.v6 + r.inputTax, count: a.count + r.count,
      }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
    }
    return activeRows.reduce((a, r) => ({
      v1: a.v1 + Number(r.dutiableValue || 0), v2: a.v2 + Number(r.charges || 0), v3: 0, v4: 0,
      v5: a.v5 + Number(r.vat || 0), v6: 0, count: a.count + 1,
    }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
  }, [tab, activeRows]);

  // ---- Build BIR RELIEF .DAT — mirrors the BIR Relief-generated samples ----
  const buildDat = (): string => {
    // Exactly as Relief builds it: allt(a)+' '+allt(b)+' '+allt(c) — empty parts leave their space
    // (sample addr2 = " SAN PEDRO LAGUNA 4023" because the district is blank).
    const sp = (...p: any[]) => p.map(x => clean(x)).join(' ');
    const addr1 = up(sp(owner.substreet, owner.street, owner.barangay));
    const addr2 = up(sp(owner.district, owner.city, owner.zipCode));
    const ownerLoc = splitCityProvince(owner.city);
    const tmd = taxMonthDate(year, month);

    // Header text is written verbatim (leading space in addr2 is part of the format), so no trimming here.
    const hq = (v: string) => `"${v}"`;
    const owned = `${q(ownerTin)},${q(up(owner.registeredName || owner.name), 50)},` +
      `${q(up(owner.lastName), 30)},${q(up(owner.firstName), 30)},${q(up(owner.middleName), 30)},` +
      `${q(up(owner.tradeName || owner.registeredName || owner.name), 50)},${hq(addr1)},${hq(addr2)}`;

    // Header amounts (always 2 decimals): S = exempt, zero-rated, taxable, output VAT.
    // P = exempt, zero-rated, services, capital, other goods, total input VAT, creditable, non-creditable.
    const nonCred = Math.min(Math.max(Number(nonCreditable) || 0, 0), totals.v6);
    const cred = totals.v6 - nonCred;
    let ssummary: string;
    if (tab === 'sales') ssummary = [totals.v1, totals.v2, totals.v3, totals.v4].map(fmt).join(',');
    else if (tab === 'purchases') ssummary = [totals.v1, totals.v2, totals.v3, totals.v4, totals.v5, totals.v6, cred, nonCred].map(fmt).join(',');
    else ssummary = [totals.v1, totals.v2, totals.v3, totals.v4, totals.v5].map(fmt).join(',');

    const lines: string[] = [`H,${activeTab.typeCode},${owned},${ssummary},${rdoCode},${tmd},${fyEndMonth}`];

    // Counterparty block: "tin","NAME",,,,"CITY","PROVINCE"  (last/first/middle empty & unquoted)
    const party = (r: any) => {
      const loc = r.various ? ownerLoc : splitCityProvince(r.addr1);
      return `"${tin9(r.tin)}",${q(up(r.regName), 50)},,,,${q(loc.city, 30)},${q(loc.province, 30)}`;
    };
    if (tab === 'sales') {
      for (const r of activeRows) {
        lines.push(`D,S,${party(r)},${[r.exempt, r.zeroRated, r.taxable, r.outputTax].map(fmtD).join(',')},${ownerTin},${tmd}`);
      }
    } else if (tab === 'purchases') {
      for (const r of activeRows) {
        lines.push(`D,P,${party(r)},${[r.exempt, r.zeroRated, r.services, r.capital, r.goodsOther, r.inputTax].map(fmtD).join(',')},${ownerTin},${tmd}`);
      }
    } else {
      // D,I (unchanged): entryNo,assessDate,regName,country,landCost,dutiable,charges,geImport,gtImport,vat,orNumber,vatPayDate,ownerTin,taxMonthDate
      for (const r of activeRows) {
        lines.push(`D,I,${r.entryNo},${r.assessDate || ''},${r.registeredName},${r.country},,` +
          `${fmt(r.dutiableValue)},${fmt(r.charges)},,,${fmt(r.vat)},${r.orNumber},${r.vatPaymentDate || ''},${ownerTin},${tmd}`);
      }
    }
    return lines.join('\r\n') + '\r\n';
  };

  // ---- Inquire / Print (BIR Relief "Transaction Inquiry") ----
  const [inqOpen, setInqOpen] = useState(false);
  const [inqPreviewOpen, setInqPreviewOpen] = useState(false);
  const [inqYear, setInqYear] = useState(now.getFullYear());
  const [inqMonths, setInqMonths] = useState<number[]>([now.getMonth() + 1]);
  const [inqAllTp, setInqAllTp] = useState(true);
  const [inqTin, setInqTin] = useState('');
  const [inqReport, setInqReport] = useState<InquiryReport | null>(null);
  const [inqPeriod, setInqPeriod] = useState('');
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const openInquiry = () => {
    if (!canPrint || !canReliefDropdown('relief_action', 'view_schedule')) return;
    setInqYear(year); setInqMonths([month]); setInqAllTp(true); setInqTin(''); setInqReport(null); setInqOpen(true);
  };
  const toggleInqMonth = (m: number) =>
    setInqMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => a - b));

  const runInquiry = (autoPreview = false) => {
    if (inqMonths.length === 0) { showToast('No month specified to inquire!'); return; }
    if (!inqAllTp && inqTin.replace(/\D/g, '') === '') { showToast('Enter a TIN, or tick “All taxpayers”.'); return; }
    const months = inqMonths.map(m => ({
      year: inqYear, month: m,
      rows: tab === 'sales' ? buildSalesRows(inqYear, m)
        : tab === 'purchases' ? buildPurchases(inqYear, m).purchaseRows
        // Importation entries are kept for the period selected on the page.
        : (inqYear === year && m === month ? importRows : []),
    }));
    const ownerName = (owner.registeredName || '').trim()
      || `${owner.lastName || ''}, ${owner.firstName || ''} ${owner.middleName || ''}`.trim();
    const rep = buildInquiry(tab, months, {
      tin: ownerTin,
      name: ownerName || owner.name || '',
      tradeName: owner.tradeName || '',
      address: [owner.substreet, owner.street, owner.barangay, owner.district, owner.city, owner.zipCode].filter(Boolean).join(' '),
      addressLine1: [owner.substreet, owner.street].filter(Boolean).join(' '),
      addressLine2: [owner.barangay, owner.district, owner.city, owner.zipCode].filter(Boolean).join(' '),
    }, inqAllTp ? '' : inqTin);
    const first = MONTH_NAMES[inqMonths[0] - 1];
    setInqPeriod(inqMonths.length === 1
      ? `${first} ${inqYear}`
      : `${inqMonths.map(m => MONTH_NAMES[m - 1].slice(0, 3)).join(', ')} ${inqYear}`);
    if (rep.rows.length === 0) showToast('No record/s to display');
    setInqReport(rep);
    if (autoPreview) setInqPreviewOpen(true);
  };
  const printInquiry = () => { if (canPrint && inqReport) setInqPreviewOpen(true); };
  const exportInquiryXlsx = () => {
    if (!canExport || !inqReport) return;
    const ws = XLSX.utils.aoa_to_sheet(inquiryAoa(inqReport));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, inqReport.title.slice(0, 31));
    XLSX.writeFile(wb, `${ownerTin}${activeTab.typeCode}_inquiry_${inqYear}.xlsx`);
  };

  const handleExport = () => {
    if (!canExport) return;
    if (totals.count === 0 && tab !== 'imports') {
      showToast(`No ${tab} records found for ${monthKey}.`);
      return;
    }
    const fname = `${ownerTin}${activeTab.typeCode}${String(month).padStart(2, '0')}${year}.DAT`;
    const blob = new Blob([buildDat()], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, fname);
    showToast(`RELIEF file ${fname} exported (${totals.count} entries, BIR Relief sample format).`);
  };

  const handleFileMonth = async () => {
    if (!currentClientId || !reliefDataReady) { showToast('RELIEF data is still loading.'); return; }
    if (isMonthFiled) return;
    const entryIds = activeRows.map(reliefEntryKey);
    setReliefCloudStatus('saving');
    const { error } = await supabase.from('relief_records').upsert({
      client_id: currentClientId, record_type: 'filed', record_id: filedKey,
      data: { filedAt: new Date().toISOString(), entryIds, tab, monthKey },
    }, { onConflict: 'client_id,record_type,record_id' });
    if (error) { setReliefCloudStatus('error'); showToast(`Filed failed: ${error.message}`); return; }
    setFiledMonths(prev => ({ ...prev, [filedKey]: { filedAt: new Date().toISOString(), entryIds } }));
    await writeReliefAudit(currentClientId, 'relief_filed', tab, monthKey, { count: entryIds.length });
    setReliefCloudStatus('ready');
    showToast(`${activeTab.label} RELIEF for ${monthKey} is now FILED and locked. New entries for this month will roll to the next unfiled month.`);
  };

  const handleAmendMonth = async () => {
    if (!currentClientId || !isMonthFiled) return;
    setReliefCloudStatus('saving');
    const { error } = await supabase.from('relief_records').delete()
      .eq('client_id', currentClientId).eq('record_type', 'filed').eq('record_id', filedKey);
    if (error) { setReliefCloudStatus('error'); showToast(`Amend failed: ${error.message}`); return; }
    setFiledMonths(prev => { const next = { ...prev }; delete next[filedKey]; return next; });
    await writeReliefAudit(currentClientId, 'relief_amended', tab, monthKey, {});
    setReliefCloudStatus('ready');
    showToast(`${activeTab.label} RELIEF for ${monthKey} unlocked (amend). Repopulated from live records; entries already locked to other filed months are excluded.`);
  };

  const clearAllTransfers = async () => {
    if (!canResetTransfers) { showToast('You do not have permission to reset RELIEF transfers.'); return; }
    if (!currentClientId || !reliefDataReady) {
      showToast('RELIEF cloud data is still loading. Please retry.');
      return;
    }
    if (!window.confirm('Reset every purchase-month transfer for this active profile in RELIEF? Original purchase transactions will not be changed.')) return;
    setReliefCloudStatus('saving');
    const { error } = await supabase.from('relief_records').delete()
      .eq('client_id', currentClientId).eq('record_type', 'purchase_transfer');
    if (error) {
      setReliefCloudStatus('error');
      setReliefCloudMessage(`Could not reset transfers: ${error.message}`);
      showToast('Could not reset transfers in Supabase.');
      return;
    }
    setTransfers({});
    await writeReliefAudit(currentClientId, 'purchase_month_transfers_cleared', 'purchase_transfer', 'all', { count: Object.keys(transfers).length });
    setReliefCloudStatus('ready');
    setReliefCloudMessage('All purchase-month transfers for this profile were reset in RELIEF only.');
    showToast('All RELIEF month transfers reset. Purchase transactions were not changed.');
  };

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    void changePeriod(d.getFullYear(), d.getMonth() + 1);
  };
  const peso = (n: number) => `₱${formatMoney(n)}`;
  const summaryCards: { label: string; value: string }[] = tab === 'sales' ? [
    { label: 'Buyers', value: String(activeRows.length) },
    { label: 'Total Sales', value: peso(totals.v1 + totals.v2 + totals.v3) },
    { label: 'Taxable Sales', value: peso(totals.v3) },
    { label: 'Output VAT', value: peso(totals.v4) },
  ] : tab === 'purchases' ? [
    { label: 'Suppliers', value: String(activeRows.length) },
    { label: 'Total Purchases', value: peso(totals.v1 + totals.v2 + totals.v3 + totals.v4 + totals.v5) },
    { label: 'Input VAT', value: peso(totals.v6) },
    { label: 'Creditable Input VAT', value: peso(totals.v6 - Math.min(Math.max(Number(nonCreditable) || 0, 0), totals.v6)) },
  ] : [
    { label: 'Entries', value: String(activeRows.length) },
    { label: 'Dutiable Value', value: peso(totals.v1) },
    { label: 'Charges', value: peso(totals.v2) },
    { label: 'VAT Paid', value: peso(totals.v5) },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="BIR RELIEF — SLSP"
        icon={<FileText className="w-6 h-6 text-indigo-600" />}
        badge="Summary List of Sales, Purchases & Importations"
        actions={<div className="flex gap-2">
          {isMonthFiled ? (
            <Button variant="outline" onClick={() => void handleAmendMonth()} className="gap-2 border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"><Unlock className="w-4 h-4" /> Amend</Button>
          ) : (
            <Button variant="outline" onClick={() => void handleFileMonth()} disabled={!reliefDataReady} className="gap-2 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 disabled:opacity-40"><Lock className="w-4 h-4" /> Mark as Filed</Button>
          )}
          {canPrint && canReliefDropdown('relief_action', 'view_schedule') && <Button variant="outline" onClick={openInquiry} className="gap-2"><Search className="w-4 h-4" /> Inquire / Print</Button>}
          {canExport && <Button onClick={handleExport} className="gap-2"><FileDown className="w-4 h-4" /> Export .DAT</Button>}
        </div>}
      />

      {(reliefCloudStatus !== 'ready' || (legacyTransfersForImport && Object.keys(legacyTransfersForImport).length > 0 && Object.keys(transfers).length === 0)) && (
        <div role="status" className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${reliefCloudStatus === 'error' ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300'}`}>
          <span>{reliefCloudMessage || (reliefCloudStatus === 'saving' ? 'Saving…' : 'Loading RELIEF data…')}</span>
          <div className="flex items-center gap-2 shrink-0">
            {reliefCloudStatus === 'error' && <Button variant="outline" onClick={() => { if (importRowsDirty && reliefDataReady) setImportRetryToken(v => v + 1); else setLoadRetryToken(v => v + 1); }} className="py-1">Retry sync</Button>}
            {legacyTransfersForImport && Object.keys(legacyTransfersForImport).length > 0 && Object.keys(transfers).length === 0 && reliefDataReady && (
              <Button variant="outline" onClick={importLegacyTransfersToActiveProfile} disabled={!canEditTransfers} className="py-1">Import old transfers to this profile</Button>
            )}
          </div>
        </div>
      )}

      {/* Step 1 — choose the tax period */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-end gap-2">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <Field label="Month">
              <Select value={String(month)} onChange={e => { void changePeriod(year, Number(e.target.value)); }}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={String(year)} onChange={e => { void changePeriod(Number(e.target.value), month); }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {historyLoading && <span className="text-xs text-slate-400">Refreshing records…</span>}
            {isMonthFiled ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" /> Filed · Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold">
                <Unlock className="w-3.5 h-3.5" /> Open for editing
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — pick the schedule */}
      <div role="tablist" aria-label="RELIEF schedule" className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
        {TABS.map(t => {
          const selected = tab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={selected} onClick={() => setReliefTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                selected ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {t.icon} {t.label}
              <span className="text-[10px] font-normal text-slate-400 hidden md:inline">· {t.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(c => (
          <div key={c.label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{c.label}</div>
            <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums truncate">{c.value}</div>
          </div>
        ))}
      </div>

      {tab === 'sales' && (
        <Card><CardContent className="p-0 overflow-x-auto">
          {activeRows.length === 0 ? (
            <EmptyState title={`No sales in ${periodLabel}`} description="Record sales in Billing / Income to include them here, or pick another month." />
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase sticky top-0">
                <tr><th className="text-left px-4 py-3">Buyer TIN</th><th className="text-left px-4 py-3">Registered Name</th>
                  <th className="text-right px-4 py-3">Exempt</th><th className="text-right px-4 py-3">Zero-Rated</th>
                  <th className="text-right px-4 py-3">Taxable</th><th className="text-right px-4 py-3">Output Tax</th></tr>
              </thead>
              <tbody>
                {activeRows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                    <td className="px-4 py-2.5">{r.regName || '(unnamed)'}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.exempt)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.zeroRated)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.taxable)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.outputTax)}</td>
                  </tr>))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                <tr><td className="px-4 py-3" colSpan={2}>Total ({activeRows.length})</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.v1)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.v2)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.v3)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.v4)}</td></tr>
              </tfoot>
            </table>)}
        </CardContent></Card>
      )}

      {tab === 'purchases' && (
        <>
          {(noTinCount > 0 || transferredInCount > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {noTinCount > 0 && (
                <Badge variant="warning">{noTinCount} purchase{noTinCount === 1 ? '' : 's'} without supplier TIN excluded (BIR SLSP requires a TIN)</Badge>
              )}
              {transferredInCount > 0 && (
                <Badge variant="info">{transferredInCount} supplier row{transferredInCount === 1 ? '' : 's'} transferred into {monthKey}</Badge>
              )}
            </div>
          )}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium">Non-creditable input tax ₱</span>
                <input type="number" min={0} step="0.01" value={nonCreditable || ''} placeholder="0.00" disabled={isMonthFiled}
                  onChange={e => setNonCreditable(Math.max(0, Number(e.target.value) || 0))}
                  onBlur={() => void saveReliefSetting(nonCreditable, consolidateNoTinPurchases)}
                  className="w-32 form-input text-sm py-1.5" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" checked={consolidateNoTinPurchases} disabled={isMonthFiled} onChange={e => { const checked = e.target.checked; setConsolidateNoTinPurchases(checked); void saveReliefSetting(nonCreditable, checked); }} />
                Combine purchases without TIN as VARIOUS PURCHASES
              </label>
              {Object.keys(transfers).length > 0 && (
                <button onClick={clearAllTransfers} disabled={!canResetTransfers} className="ml-auto flex items-center gap-1 text-sm text-slate-500 hover:text-red-500 transition-colors disabled:opacity-40">
                  <Undo2 className="w-4 h-4" /> Reset all transfers
                </button>
              )}
            </CardContent>
          </Card>
          <Card><CardContent className="p-0 overflow-x-auto">
            {activeRows.length === 0 ? (
              <EmptyState title={`No TIN-bearing purchases in ${periodLabel}`} description="Record purchases with a supplier TIN in Purchases / Bills to include them here, or pick another month." />
            ) : (
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase sticky top-0">
                  <tr><th className="text-left px-4 py-3">Supplier TIN</th><th className="text-left px-4 py-3">Registered Name</th>
                    <th className="text-right px-4 py-3">Exempt</th><th className="text-right px-4 py-3">Zero-Rated</th>
                    <th className="text-right px-4 py-3">Services</th><th className="text-right px-4 py-3">Capital Goods</th>
                    <th className="text-right px-4 py-3">Goods (Other)</th><th className="text-right px-4 py-3">Input Tax</th>
                    <th className="text-left px-4 py-3 min-w-[150px]" title="Move this supplier's input tax to another month of the same year">Claim Month</th></tr>
                </thead>
                <tbody>
                  {activeRows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${r.transferredIn ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2">{r.regName || '(unnamed)'}
                        {r.transferredIn && <Badge variant="warning">from {r.fromMonth}</Badge>}</div></td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.exempt)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.zeroRated)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.services)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.capital)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.goodsOther)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.inputTax)}</td>
                      <td className="px-4 py-2.5">
                        <Select value={r.transferredIn ? monthKey : r.fromMonth}
                          onChange={e => void movePurchaseRow(r, e.target.value)}
                          disabled={isMonthFiled || !canEditTransfers || !reliefDataReady || reliefCloudStatus === 'saving'} className="text-xs py-1">
                          {monthOptions.map(mk => <option key={mk} value={mk}>{mk}{mk === r.fromMonth ? ' (original)' : ''}</option>)}
                        </Select>
                      </td>
                    </tr>))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <tr><td className="px-4 py-3" colSpan={2}>Total ({activeRows.length})</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v1)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v2)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v3)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v4)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v5)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.v6)}</td><td /></tr>
                </tfoot>
              </table>)}
          </CardContent></Card>
        </>
      )}

      {tab === 'imports' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Enter each import entry for {periodLabel}. Changes save automatically.</p>
            <Button onClick={() => updateImportRows([...importRows, emptyImport()])} disabled={isMonthFiled || !canReliefAction('edit')} className="gap-2"><Plus className="w-4 h-4" /> Add Entry</Button>
          </div>
          {importRows.length === 0 ? (
            <Card><CardContent className="py-6">
              <EmptyState title="No import entries" description="Click “Add Entry” to record an importation for this month." />
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {importRows.map((r, i) => {
                const set = (patch: Partial<ImportRow>) => updateImportRows(importRows.map((x, xi) => xi === i ? { ...x, ...patch } : x));
                return (
                  <Card key={r.id}><CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Entry #{i + 1}</span>
                      <button onClick={() => updateImportRows(importRows.filter((_, xi) => xi !== i))} disabled={isMonthFiled} aria-label={`Delete entry ${i + 1}`}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4" /> Remove</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="Import Entry No."><Input value={r.entryNo} disabled={isMonthFiled} onChange={e => set({ entryNo: e.target.value })} /></Field>
                      <Field label="Assessment Date"><Input type="date" value={r.assessDate} disabled={isMonthFiled} onChange={e => set({ assessDate: e.target.value })} /></Field>
                      <Field label="Seller / Registered Name"><Input value={r.registeredName} disabled={isMonthFiled} onChange={e => set({ registeredName: e.target.value })} /></Field>
                      <Field label="Country of Origin"><Input value={r.country} disabled={isMonthFiled} onChange={e => set({ country: e.target.value })} /></Field>
                      <Field label="Dutiable Value (₱)"><Input type="number" value={r.dutiableValue || ''} disabled={isMonthFiled} onChange={e => set({ dutiableValue: Number(e.target.value) })} /></Field>
                      <Field label="Charges Before Release (₱)"><Input type="number" value={r.charges || ''} disabled={isMonthFiled} onChange={e => set({ charges: Number(e.target.value) })} /></Field>
                      <Field label="VAT Paid (₱)"><Input type="number" value={r.vat || ''} disabled={isMonthFiled} onChange={e => set({ vat: Number(e.target.value) })} /></Field>
                      <Field label="OR Number"><Input value={r.orNumber} disabled={isMonthFiled} onChange={e => set({ orNumber: e.target.value })} /></Field>
                      <Field label="VAT Payment Date"><Input type="date" value={r.vatPaymentDate} disabled={isMonthFiled} onChange={e => set({ vatPaymentDate: e.target.value })} /></Field>
                    </div>
                  </CardContent></Card>
                );
              })}
            </div>
          )}
        </div>
      )}


      <Modal
        open={inqOpen}
        onClose={() => setInqOpen(false)}
        size="xl"
        title={`Transaction Inquiry — ${activeTab.label}`}
        description={inqReport ? undefined : 'Select the taxable year and month(s) to inquire, like the RELIEF Inquire / Print facility.'}
        footer={inqReport ? (
          <div className="flex flex-wrap gap-2 justify-end w-full">
            <Button variant="outline" onClick={() => setInqReport(null)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button variant="outline" onClick={exportInquiryXlsx} disabled={inqReport.rows.length === 0} className="gap-2"><FileSpreadsheet className="w-4 h-4" /> Export Excel</Button>
            <Button onClick={printInquiry} disabled={inqReport.rows.length === 0} className="gap-2"><Printer className="w-4 h-4" /> Print</Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end w-full">
            <Button variant="outline" onClick={() => setInqOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => runInquiry(true)} className="gap-2"><Printer className="w-4 h-4" /> Print</Button>
            <Button onClick={() => runInquiry(false)} className="gap-2"><Search className="w-4 h-4" /> Inquire</Button>
          </div>
        )}
      >
        {!inqReport ? (
          <div className="space-y-4">
            <Field label="Taxable year">
              <Select value={String(inqYear)} onChange={e => setInqYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Taxable month(s)</span>
                <span className="text-xs space-x-3">
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setInqMonths([1,2,3,4,5,6,7,8,9,10,11,12])}>Select all</button>
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => setInqMonths([])}>Clear</button>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MONTH_NAMES.map((name, i) => (
                  <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={inqMonths.includes(i + 1)} onChange={() => toggleInqMonth(i + 1)} /> {name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={inqAllTp} onChange={e => setInqAllTp(e.target.checked)} /> All taxpayers
              </label>
              {!inqAllTp && (
                <Field label={`Query by TIN (${tab === 'sales' ? 'customer' : 'supplier'})`}>
                  <Input value={inqTin} maxLength={11} placeholder="999-999-999"
                    onChange={e => setInqTin(e.target.value.replace(/[^\d-]/g, ''))} />
                </Field>
              )}
            </div>
            {tab === 'imports' && (
              <p className="text-xs text-slate-400">Importation entries are the ones entered on this page for {monthKey}.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="text-center">
              <div className="text-sm font-bold">{inqReport.title}</div>
              <div className="text-slate-500">RECONCILIATION OF LISTING FOR ENFORCEMENT</div>
            </div>
            <div className="font-semibold space-y-0.5">
              <div>TIN : {inqReport.owner.tin}</div>
              <div>OWNER'S NAME: {inqReport.owner.name}</div>
              {inqReport.type !== 'imports' && <div>OWNER'S TRADE NAME : {inqReport.owner.tradeName}</div>}
              <div>OWNER'S ADDRESS: {inqReport.owner.address}</div>
              <div className="font-normal text-slate-500">Taxable period: {inqPeriod}</div>
            </div>
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] align-bottom">
                  <tr>{inqReport.columns.map((c, i) => (
                    <th key={i} className={`px-3 py-2 ${c.numeric ? 'text-right' : 'text-left'}`}>
                      {c.head.map((h, k) => <div key={k}>{h}</div>)}<div className="font-normal">({i + 1})</div>
                    </th>))}</tr>
                </thead>
                <tbody>
                  {inqReport.rows.length === 0 ? (
                    <tr><td colSpan={inqReport.columns.length} className="px-3 py-6 text-center text-slate-400">No record/s to display</td></tr>
                  ) : inqReport.rows.map((r, ri) => (
                    <tr key={ri} className="border-t border-slate-100 dark:border-slate-800">
                      {r.map((v, ci) => (
                        <td key={ci} className={`px-3 py-1.5 ${inqReport.columns[ci].numeric ? 'text-right font-mono' : ''}`}>
                          {inqReport.columns[ci].numeric ? formatMoney(Number(v)) : String(v)}
                        </td>))}
                    </tr>))}
                </tbody>
                {inqReport.rows.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                    <tr>
                      {inqReport.columns.map((c, i) => (
                        <td key={i} className={`px-3 py-2 ${c.numeric ? 'text-right font-mono' : ''}`}>
                          {i === 0 ? 'Grand Total :' : c.total ? formatMoney(inqReport.totals[i] || 0) : ''}
                        </td>))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="text-center font-semibold text-slate-500">END OF REPORT</div>
          </div>
        )}
      </Modal>

      {inqReport && (
        <ReliefReportPreviewModal
          open={inqPreviewOpen}
          onClose={() => setInqPreviewOpen(false)}
          report={inqReport}
          periodLabel={inqPeriod}
          onExportExcel={exportInquiryXlsx}
        />
      )}

      <p className="text-xs text-slate-400 text-center">
        “Export .DAT” creates the file you upload to the BIR RELIEF validation module for {activeTab.label} · {periodLabel}.
      </p>
    </div>
  );
}
