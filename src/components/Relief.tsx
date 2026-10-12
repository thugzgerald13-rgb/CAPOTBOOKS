import React, { useState, useMemo } from 'react';
import { saveAs } from 'file-saver';
import { PageHeader, Button, Card, CardContent, Select, Field, Input, EmptyState } from './ui';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { FileText, Receipt, ShoppingCart, Boxes, FileDown, Plus, Trash2 } from 'lucide-react';

/**
 * BIR RELIEF (Reconciliation of Listings for Enforcement) — Summary List of
 * Sales, Purchases and Importations (SLSP). Mirrors the data-entry/export
 * flow of the legacy BIR Relief v2.3 desktop app: aggregate per-counterparty
 * for a chosen month, then export a BIR-format .DAT (CSV) file with an `H,`
 * header record and `D,S,` / `D,P,` / `D,I,` detail records.
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
}

const emptyImport = (): ImportRow => ({
  id: Math.random().toString(36).slice(2, 9),
  entryNo: '', assessDate: '', registeredName: '', country: '',
  dutiableValue: 0, charges: 0, vat: 0, orNumber: '',
});

const fmt = (n: number) => (n || 0).toFixed(2);
const csv = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;

export function Relief() {
  const { currentClient, reliefTab, setReliefTab, showToast } = useAccounting();
  usePermission('view_reports');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  const tab = (['sales', 'purchases', 'imports'].includes(reliefTab) ? reliefTab : 'sales') as ReliefTab;
  const activeTab = TABS.find(t => t.id === tab)!;

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // ---- Sales aggregation (per buyer TIN/name) for the chosen month ----
  const salesRows = useMemo(() => {
    const sales = (currentClient?.sales || []) as any[];
    const inMonth = sales.filter(s => {
      const d = s.date ? new Date(s.date) : null;
      return d && d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const map = new Map<string, any>();
    for (const s of inMonth) {
      const key = `${(s.buyerTin || '')}|${(s.buyerName || '').trim()}`;
      const vt = String(s.vatType || '').toLowerCase();
      const isExempt = vt.includes('exempt');
      const isZero = vt.includes('zero');
      const cur = map.get(key) || {
        tin: s.buyerTin || '', name: s.buyerName || '', address: s.buyerAddress || '',
        taxable: 0, exempt: 0, zeroRated: 0, outputTax: 0, count: 0,
      };
      const amt = Number(s.amount || 0);
      if (isExempt) cur.exempt += amt;
      else if (isZero) cur.zeroRated += amt;
      else cur.taxable += amt;
      cur.outputTax += Number(s.outputTax || 0);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [currentClient, year, month]);

  // ---- Purchases aggregation (per supplier TIN/name) ----
  const purchaseRows = useMemo(() => {
    const purchases = (currentClient?.purchases || []) as any[];
    const inMonth = purchases.filter(p => {
      const d = p.date ? new Date(p.date) : null;
      return d && d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const map = new Map<string, any>();
    for (const p of inMonth) {
      const key = `${(p.supplierTin || '')}|${(p.supplierName || '').trim()}`;
      const cur = map.get(key) || {
        tin: p.supplierTin || '', name: p.supplierName || '', address: p.supplierAddress || '',
        goods: 0, services: 0, capital: 0, others: 0, inputTax: 0, count: 0,
      };
      const amt = Number(p.amount || 0);
      const et = String(p.expenseType || p.accountTitle || '').toLowerCase();
      if (et.includes('capital') || et.includes('asset')) cur.capital += amt;
      else if (et.includes('service')) cur.services += amt;
      else if (et.includes('good') || et.includes('merchandis') || et.includes('inventory')) cur.goods += amt;
      else cur.others += amt;
      cur.inputTax += Number(p.inputTax || 0);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [currentClient, year, month]);

  const totals = useMemo(() => {
    if (tab === 'sales') {
      return salesRows.reduce((a, r) => ({
        taxable: a.taxable + r.taxable, exempt: a.exempt + r.exempt,
        zeroRated: a.zeroRated + r.zeroRated, tax: a.tax + r.outputTax, count: a.count + r.count,
      }), { taxable: 0, exempt: 0, zeroRated: 0, tax: 0, count: 0 });
    }
    if (tab === 'purchases') {
      return purchaseRows.reduce((a, r) => ({
        taxable: a.taxable + r.goods + r.others, exempt: a.exempt + r.services,
        zeroRated: a.zeroRated + r.capital, tax: a.tax + r.inputTax, count: a.count + r.count,
      }), { taxable: 0, exempt: 0, zeroRated: 0, tax: 0, count: 0 });
    }
    return importRows.reduce((a, r) => ({
      taxable: a.taxable + Number(r.dutiableValue || 0), exempt: a.exempt + Number(r.charges || 0),
      zeroRated: 0, tax: a.tax + Number(r.vat || 0), count: a.count + 1,
    }), { taxable: 0, exempt: 0, zeroRated: 0, tax: 0, count: 0 });
  }, [tab, salesRows, purchaseRows, importRows]);

  // ---- Build BIR RELIEF .DAT (CSV) — H header + D detail records ----
  const buildDat = (): string => {
    const c = currentClient || ({} as any);
    const tin = (c.tin || '000000000').replace(/-/g, '');
    const mm = String(month).padStart(2, '0');
    const addr1 = [c.substreet, c.street, c.barangay].filter(Boolean).join(' ');
    const addr2 = [c.district, c.city, c.zipCode].filter(Boolean).join(' ');
    const header = `H,${activeTab.typeCode},${csv(tin)},${csv(c.registeredName || c.name || '')},` +
      `${csv(c.lastName || '')},${csv(c.firstName || '')},${csv(c.middleName || '')},` +
      `${csv(c.tradeName || '')},${csv(addr1)},${csv(addr2)},`;
    const lines: string[] = [header];
    if (tab === 'sales') {
      for (const r of salesRows) {
        lines.push(`D,S,${csv(r.tin)},${csv(r.name)},${csv(r.address)},` +
          `${fmt(r.taxable)},${fmt(r.exempt)},${fmt(r.zeroRated)},${fmt(r.outputTax)}`);
      }
    } else if (tab === 'purchases') {
      for (const r of purchaseRows) {
        lines.push(`D,P,${csv(r.tin)},${csv(r.name)},${csv(r.address)},` +
          `${fmt(r.goods)},${fmt(r.services)},${fmt(r.capital)},${fmt(r.others)},${fmt(r.inputTax)}`);
      }
    } else {
      for (const r of importRows) {
        lines.push(`D,I,${csv(r.entryNo)},${r.assessDate || ''},${csv(r.registeredName)},` +
          `${csv(r.country)},${fmt(r.dutiableValue)},${fmt(r.charges)},${fmt(r.vat)},${csv(r.orNumber)}`);
      }
    }
    return lines.join('\r\n') + '\r\n';
  };

  const handleExport = () => {
    if (totals.count === 0 && tab !== 'imports') {
      showToast(`No ${tab} records found for ${monthKey}.`);
      return;
    }
    const c = currentClient || ({} as any);
    const tin = (c.tin || '000000000').replace(/-/g, '');
    const fname = `${tin}${activeTab.typeCode}${String(month).padStart(2, '0')}${year}.DAT`;
    const blob = new Blob([buildDat()], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, fname);
    showToast(`RELIEF file ${fname} exported (${totals.count} entries).`);
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="BIR RELIEF — SLSP"
        icon={<FileText className="w-6 h-6 text-indigo-600" />}
        badge="Summary List of Sales, Purchases & Importations"
        actions={
          <Button onClick={handleExport} className="gap-2">
            <FileDown className="w-4 h-4" /> Export .DAT
          </Button>
        }
      />

      {/* Period selector */}
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
            {' · Total ₱'}<span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(totals.taxable + totals.exempt + totals.zeroRated)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setReliefTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Sales table */}
      {tab === 'sales' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {salesRows.length === 0 ? (
              <EmptyState title="No sales this month" description="Record sales in Billing / Income to include them here." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Buyer TIN</th>
                    <th className="text-left px-4 py-3">Registered Name</th>
                    <th className="text-right px-4 py-3">Taxable</th>
                    <th className="text-right px-4 py-3">Exempt</th>
                    <th className="text-right px-4 py-3">Zero-Rated</th>
                    <th className="text-right px-4 py-3">Output Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                      <td className="px-4 py-2.5">{r.name || '(unnamed)'}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.taxable)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.exempt)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.zeroRated)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(r.outputTax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>Total ({salesRows.length})</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.taxable)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.exempt)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.zeroRated)}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.tax)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Purchases table */}
      {tab === 'purchases' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {purchaseRows.length === 0 ? (
              <EmptyState title="No purchases this month" description="Record purchases in Purchases / Bills to include them here." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Supplier TIN</th>
                    <th className="text-left px-4 py-3">Registered Name</th>
                    <th className="text-right px-4 py-3">Goods</th>
                    <th className="text-right px-4 py-3">Services</th>
                    <th className="text-right px-4 py-3">Capital</th>
                    <th className="text-right px-4 py-3">Others</th>
                    <th className="text-right px-4 py-3">Input Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.tin || '—'}</td>
                      <td className="px-4 py-2.5">{r.name || '(unnamed)'}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.goods)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.services)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.capital)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.others)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(r.inputTax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>Total ({purchaseRows.length})</td>
                    <td className="px-4 py-3 text-right">{fmt(purchaseRows.reduce((a, r) => a + r.goods, 0))}</td>
                    <td className="px-4 py-3 text-right">{fmt(purchaseRows.reduce((a, r) => a + r.services, 0))}</td>
                    <td className="px-4 py-3 text-right">{fmt(purchaseRows.reduce((a, r) => a + r.capital, 0))}</td>
                    <td className="px-4 py-3 text-right">{fmt(purchaseRows.reduce((a, r) => a + r.others, 0))}</td>
                    <td className="px-4 py-3 text-right">{fmt(totals.tax)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Importation — editable entry list (no dedicated import ledger in app yet) */}
      {tab === 'imports' && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Enter import entries for {monthKey}; they are included in the exported .DAT as <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">D,I,</code> records.</p>
              <Button variant="outline" onClick={() => setImportRows([...importRows, emptyImport()])} className="gap-2">
                <Plus className="w-4 h-4" /> Add Entry
              </Button>
            </div>
            {importRows.length === 0 ? (
              <EmptyState title="No import entries" description="Click “Add Entry” to record an importation for this month." />
            ) : (
              <div className="space-y-2">
                {importRows.map((r, i) => (
                  <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="col-span-2"><Input placeholder="Entry No." value={r.entryNo} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, entryNo: e.target.value } : x))} /></div>
                    <div className="col-span-2"><Input type="date" value={r.assessDate} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, assessDate: e.target.value } : x))} /></div>
                    <div className="col-span-3"><Input placeholder="Registered name" value={r.registeredName} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, registeredName: e.target.value } : x))} /></div>
                    <div className="col-span-2"><Input placeholder="Country" value={r.country} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, country: e.target.value } : x))} /></div>
                    <div className="col-span-1"><Input type="number" placeholder="Dutiable" value={r.dutiableValue || ''} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, dutiableValue: Number(e.target.value) } : x))} /></div>
                    <div className="col-span-1"><Input type="number" placeholder="VAT" value={r.vat || ''} onChange={e => setImportRows(importRows.map((x, xi) => xi === i ? { ...x, vat: Number(e.target.value) } : x))} /></div>
                    <button onClick={() => setImportRows(importRows.filter((_, xi) => xi !== i))} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-400 text-center">
        Exported file follows the BIR RELIEF v2.3 format: <code>H,&lt;type&gt;,"…header…",</code> followed by <code>D,S,</code> / <code>D,P,</code> / <code>D,I,</code> detail lines.
      </p>
    </div>
  );
}
