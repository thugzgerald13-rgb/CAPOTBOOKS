import React, { useState, useMemo, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { PageHeader, Button, Card, CardContent, Select, Field, Input, EmptyState, Badge } from './ui';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { FileText, Receipt, ShoppingCart, Boxes, FileDown, Plus, Trash2, Undo2 } from 'lucide-react';

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

const TABS: { id: ReliefTab; label: string; icon: React.ReactNode; typeCode: string }[] = [
  { id: 'sales', label: 'Sales', icon: <Receipt className="w-4 h-4" />, typeCode: 'S' },
  { id: 'purchases', label: 'Purchases', icon: <ShoppingCart className="w-4 h-4" />, typeCode: 'P' },
  { id: 'imports', label: 'Importation', icon: <Boxes className="w-4 h-4" />, typeCode: 'I' },
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
const csvQ = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
const monthKeyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
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
  const { currentClient, reliefTab, setReliefTab, showToast } = useAccounting();
  usePermission('view_reports');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  // Purchases without a supplier TIN are excluded by default; tick to consolidate them into the BIR "VARIOUS PURCHASES" row (000000002).
  // Relief asks for the non-creditable portion of input tax when generating the Purchases file (creditable = total - non-creditable).
  const [nonCreditable, setNonCreditable] = useState(0);
  const [consolidateNoTinPurchases, setConsolidateNoTinPurchases] = useState(false);

  const [transfers, setTransfers] = useState<TransfersMap>(() => {
    try { return JSON.parse(localStorage.getItem('relief-purchase-transfers') || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('relief-purchase-transfers', JSON.stringify(transfers)); } catch { /* ignore */ }
  }, [transfers]);

  const tab = (['sales', 'purchases', 'imports'].includes(reliefTab) ? reliefTab : 'sales') as ReliefTab;
  const activeTab = TABS.find(t => t.id === tab)!;
  const monthKey = monthKeyOf(year, month);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++)
      for (let m = 1; m <= 12; m++) opts.push(monthKeyOf(y, m));
    return opts;
  }, [now]);

  const owner = currentClient || ({} as any);
  const ownerTin = tin9(owner.tin);
  const rdoCode = rdo3(owner.rdoCode); // e.g. 057, 43B
  // Last header field in the BIR samples is the fiscal-year-end month (12 for calendar-year taxpayers).
  const fyEndMonth = owner.accountingType === 'Fiscal' && owner.fiscalMonthEnd ? owner.fiscalMonthEnd : 12;

  // ---- Sales: aggregate per buyer; amounts -> exempt / zero-rated / taxable / output tax ----
  const salesRows = useMemo(() => {
    const sales = (currentClient?.sales || []) as any[];
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
      if (vt.includes('exempt')) cur.exempt += amt;
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
  }, [currentClient, year, month]);

  // ---- Purchases: TIN required; 6 amount buckets; month transfers ----
  const { purchaseRows, noTinCount, transferredInCount } = useMemo(() => {
    const purchases = (currentClient?.purchases || []) as any[];
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
      const et = String(p.expenseType || p.accountTitle || '').toLowerCase();
      if (vt.includes('exempt')) cur.exempt += amt;
      else if (vt.includes('zero')) cur.zeroRated += amt;
      else if (et.includes('service')) cur.services += amt;
      else if (et.includes('capital') || et.includes('asset')) cur.capital += amt;
      else cur.goodsOther += amt; // goods other than capital goods
      cur.inputTax += Number(p.inputTax || 0);
      cur.count += 1;
      map.set(key, cur);
    }
    const rows: any[] = [];
    for (const [, r] of map) {
      const tKey = `${r.tin}|${monthKey}`;
      const t = transfers[tKey];
      if (t && t.toMonth !== monthKey) continue;
      rows.push({ ...r, transferKey: tKey, fromMonth: monthKey, transferredIn: false });
    }
    let transferredInCount = 0;
    for (const [tKey, t] of Object.entries(transfers)) {
      if (t.toMonth !== monthKey) continue;
      const fromMonth = tKey.split('|').slice(1).join('|');
      if (fromMonth === monthKey) continue;
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
  }, [currentClient, year, month, monthKey, transfers, consolidateNoTinPurchases]);

  const movePurchaseRow = (row: any, targetMonth: string) => {
    const tKey = row.transferKey;
    setTransfers(prev => {
      const next = { ...prev };
      if (targetMonth === row.fromMonth) delete next[tKey];
      else next[tKey] = {
        toMonth: targetMonth, tin: row.tin, name: row.regName, address: row.addr1,
        exempt: Number(row.exempt || 0), zeroRated: Number(row.zeroRated || 0),
        services: Number(row.services || 0), capital: Number(row.capital || 0),
        goodsOther: Number(row.goodsOther || 0), inputTax: Number(row.inputTax || 0),
      };
      return next;
    });
    showToast(targetMonth === row.fromMonth
      ? `Moved ${row.regName || 'supplier'} back to ${row.fromMonth}.`
      : `Transferred ${row.regName || 'supplier'} (₱${fmt(row.inputTax)} input tax) to ${targetMonth}.`);
  };

  // Totals (must equal sum of details — written into the header)
  const totals = useMemo(() => {
    if (tab === 'sales') {
      return salesRows.reduce((a, r) => ({
        v1: a.v1 + r.exempt, v2: a.v2 + r.zeroRated, v3: a.v3 + r.taxable, v4: a.v4 + r.outputTax,
        v5: 0, v6: 0, count: a.count + r.count,
      }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
    }
    if (tab === 'purchases') {
      return purchaseRows.reduce((a, r) => ({
        v1: a.v1 + r.exempt, v2: a.v2 + r.zeroRated, v3: a.v3 + r.services, v4: a.v4 + r.capital,
        v5: a.v5 + r.goodsOther, v6: a.v6 + r.inputTax, count: a.count + r.count,
      }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
    }
    return importRows.reduce((a, r) => ({
      v1: a.v1 + Number(r.dutiableValue || 0), v2: a.v2 + Number(r.charges || 0), v3: 0, v4: 0,
      v5: a.v5 + Number(r.vat || 0), v6: 0, count: a.count + 1,
    }), { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, count: 0 });
  }, [tab, salesRows, purchaseRows, importRows]);

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
      for (const r of salesRows) {
        lines.push(`D,S,${party(r)},${[r.exempt, r.zeroRated, r.taxable, r.outputTax].map(fmtD).join(',')},${ownerTin},${tmd}`);
      }
    } else if (tab === 'purchases') {
      for (const r of purchaseRows) {
        lines.push(`D,P,${party(r)},${[r.exempt, r.zeroRated, r.services, r.capital, r.goodsOther, r.inputTax].map(fmtD).join(',')},${ownerTin},${tmd}`);
      }
    } else {
      // D,I (unchanged): entryNo,assessDate,regName,country,landCost,dutiable,charges,geImport,gtImport,vat,orNumber,vatPayDate,ownerTin,taxMonthDate
      for (const r of importRows) {
        lines.push(`D,I,${r.entryNo},${r.assessDate || ''},${r.registeredName},${r.country},,` +
          `${fmt(r.dutiableValue)},${fmt(r.charges)},,,${fmt(r.vat)},${r.orNumber},${r.vatPaymentDate || ''},${ownerTin},${tmd}`);
      }
    }
    return lines.join('\r\n') + '\r\n';
  };

  const handleExport = () => {
    if (totals.count === 0 && tab !== 'imports') {
      showToast(`No ${tab} records found for ${monthKey}.`);
      return;
    }
    const fname = `${ownerTin}${activeTab.typeCode}${String(month).padStart(2, '0')}${year}.DAT`;
    const blob = new Blob([buildDat()], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, fname);
    showToast(`RELIEF file ${fname} exported (${totals.count} entries, BIR Relief sample format).`);
  };

  const clearAllTransfers = () => { setTransfers({}); showToast('All month transfers reset.'); };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="BIR RELIEF — SLSP"
        icon={<FileText className="w-6 h-6 text-indigo-600" />}
        badge="Summary List of Sales, Purchases & Importations"
        actions={<Button onClick={handleExport} className="gap-2"><FileDown className="w-4 h-4" /> Export .DAT</Button>}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <Field label="Year">
            <Select value={String(year)} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Month">
            <Select value={String(month)} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{new Date(year, m - 1, 1).toLocaleString('en-PH', { month: 'long' })}</option>
              ))}
            </Select>
          </Field>
          <div className="ml-auto text-sm text-slate-500">
            Period: <span className="font-semibold text-slate-700 dark:text-slate-200">{monthKey}</span>
            {' · '}{totals.count} counterparty{totals.count === 1 ? '' : 'ies'}
            {' · Output/Input Tax ₱'}<span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(tab === 'sales' ? totals.v4 : totals.v6)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setReliefTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <Card><CardContent className="p-0 overflow-x-auto">
          {salesRows.length === 0 ? (
            <EmptyState title="No sales this month" description="Record sales in Billing / Income to include them here." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-4 py-3">Buyer TIN</th><th className="text-left px-4 py-3">Registered Name</th>
                  <th className="text-right px-4 py-3">Exempt</th><th className="text-right px-4 py-3">Zero-Rated</th>
                  <th className="text-right px-4 py-3">Taxable</th><th className="text-right px-4 py-3">Output Tax</th></tr>
              </thead>
              <tbody>
                {salesRows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                    <td className="px-4 py-2.5">{r.regName || '(unnamed)'}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.exempt)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.zeroRated)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.taxable)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(r.outputTax)}</td>
                  </tr>))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                <tr><td className="px-4 py-3" colSpan={2}>Total ({salesRows.length})</td>
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
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {noTinCount > 0 && (
              <Badge variant="warning">{noTinCount} purchase{noTinCount === 1 ? '' : 's'} without supplier TIN excluded (BIR SLSP requires a TIN)</Badge>
            )}
            {transferredInCount > 0 && (
              <Badge variant="info">{transferredInCount} supplier row{transferredInCount === 1 ? '' : 's'} transferred into {monthKey}</Badge>
            )}
            <label className="flex items-center gap-1.5 text-slate-500">
              Non-creditable input tax ₱
              <input type="number" min={0} step="0.01" value={nonCreditable || ''} placeholder="0.00"
                onChange={e => setNonCreditable(Number(e.target.value) || 0)}
                className="w-28 form-input text-xs py-1" />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
              <input type="checkbox" checked={consolidateNoTinPurchases} onChange={e => setConsolidateNoTinPurchases(e.target.checked)} />
              Consolidate purchases without TIN as VARIOUS PURCHASES (000000002)
            </label>
            <span className="text-slate-400">Use “Claim Month” to move a supplier's input tax to another month. Export matches the BIR Relief sample format.</span>
            {Object.keys(transfers).length > 0 && (
              <button onClick={clearAllTransfers} className="ml-auto flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors">
                <Undo2 className="w-3.5 h-3.5" /> Reset all transfers
              </button>
            )}
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            {purchaseRows.length === 0 ? (
              <EmptyState title="No TIN-bearing purchases this month" description="Record purchases with a supplier TIN in Purchases / Bills to include them here." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase">
                  <tr><th className="text-left px-4 py-3">Supplier TIN</th><th className="text-left px-4 py-3">Registered Name</th>
                    <th className="text-right px-4 py-3">Exempt</th><th className="text-right px-4 py-3">Zero-Rated</th>
                    <th className="text-right px-4 py-3">Services</th><th className="text-right px-4 py-3">Capital Goods</th>
                    <th className="text-right px-4 py-3">Goods (Other)</th><th className="text-right px-4 py-3">Input Tax</th>
                    <th className="text-left px-4 py-3 min-w-[150px]">Claim Month</th></tr>
                </thead>
                <tbody>
                  {purchaseRows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${r.transferredIn ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2">{r.regName || '(unnamed)'}
                        {r.transferredIn && <Badge variant="warning">from {r.fromMonth}</Badge>}</div></td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.exempt)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.zeroRated)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.services)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.capital)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.goodsOther)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(r.inputTax)}</td>
                      <td className="px-4 py-2.5">
                        <Select value={r.transferredIn ? monthKey : r.fromMonth}
                          onChange={e => movePurchaseRow(r, e.target.value)} className="text-xs py-1">
                          {monthOptions.map(mk => <option key={mk} value={mk}>{mk}{mk === r.fromMonth ? ' (original)' : ''}</option>)}
                        </Select>
                      </td>
                    </tr>))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <tr><td className="px-4 py-3" colSpan={2}>Total ({purchaseRows.length})</td>
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
        <Card><CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Enter import entries for {monthKey}; exported as <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">D,I,</code> records (14 fields, valrlf 2.3 order).</p>
            <Button variant="outline" onClick={() => setImportRows([...importRows, emptyImport()])} className="gap-2"><Plus className="w-4 h-4" /> Add Entry</Button>
          </div>
          {importRows.length === 0 ? (
            <EmptyState title="No import entries" description="Click “Add Entry” to record an importation for this month." />
          ) : (
            <div className="space-y-2">
              {importRows.map((r, i) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="col-span-1"><Input placeholder="Entry No." value={r.entryNo} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, entryNo: e.target.value } : x))} /></div>
                  <div className="col-span-2"><Input type="date" value={r.assessDate} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, assessDate: e.target.value } : x))} /></div>
                  <div className="col-span-2"><Input placeholder="Registered name" value={r.registeredName} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, registeredName: e.target.value } : x))} /></div>
                  <div className="col-span-1"><Input placeholder="Country" value={r.country} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, country: e.target.value } : x))} /></div>
                  <div className="col-span-1"><Input type="number" placeholder="Dutiable" value={r.dutiableValue || ''} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, dutiableValue: Number(e.target.value) } : x))} /></div>
                  <div className="col-span-1"><Input type="number" placeholder="Charges" value={r.charges || ''} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, charges: Number(e.target.value) } : x))} /></div>
                  <div className="col-span-1"><Input type="number" placeholder="VAT" value={r.vat || ''} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, vat: Number(e.target.value) } : x))} /></div>
                  <div className="col-span-1"><Input placeholder="OR No." value={r.orNumber} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, orNumber: e.target.value } : x))} /></div>
                  <div className="col-span-1"><Input type="date" value={r.vatPaymentDate} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, vatPaymentDate: e.target.value } : x))} /></div>
                  <button onClick={() => setImportRows(importRows.filter((_, xi) => xi !== i))} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      <p className="text-xs text-slate-400 text-center">
        Exported .DAT mirrors BIR Relief-generated samples: quoted header with totals + RDO + tax-month end date + fiscal year-end month, then <code>D,S,</code> / <code>D,P,</code> detail lines (zero amounts as <code>0</code>).
      </p>
    </div>
  );
}
