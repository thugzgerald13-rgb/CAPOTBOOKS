/**
 * BIR RELIEF — Transaction Inquiry / Print.
 *
 * Mirrors the Inquire/Print facility of BIR Relief v2.3 (birrlf2.exe: frminquiry →
 * forms\inqsales / inqpurchases / inqimport, plus its "Export to Excel" report). Same
 * report titles, owner block, numbered column headings (1)…(n), ordering
 * (tax month, registered name, full name, TIN), "Grand Total :" and "END OF REPORT".
 */

export type InquiryType = 'sales' | 'purchases' | 'imports';

export interface InquiryColumn {
  /** Up to three header lines, as in the Relief report. */
  head: string[];
  numeric?: boolean;
  /** Included in the Grand Total row. */
  total?: boolean;
}

export interface InquiryOwner {
  tin: string;
  name: string;
  tradeName: string;
  address: string;
}

export interface InquiryReport {
  type: InquiryType;
  title: string;
  owner: InquiryOwner;
  columns: InquiryColumn[];
  rows: (string | number)[][];
  totals: (number | null)[];
}

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = money;

/** Last day of the month, MM/DD/YYYY — how Relief stores the taxable month. */
export function taxMonthLabel(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}/${String(new Date(year, month, 0).getDate()).padStart(2, '0')}/${year}`;
}

const dash = (tin: string) => {
  const d = String(tin || '').replace(/\D/g, '').padStart(9, '0').slice(0, 9);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}`;
};
const sameTin = (a: string, b: string) =>
  String(a || '').replace(/\D/g, '').padStart(9, 'X') === String(b || '').replace(/\D/g, '').padStart(9, 'X');

const fullName = (r: any) =>
  `${(r.lastName || '').trim()}${(r.lastName || '').trim() ? ', ' : ''}${(r.firstName || '').trim()} ${(r.middleName || '').trim()}`.trim();

const SALES_COLS: InquiryColumn[] = [
  { head: ['TAXABLE', 'MONTH'] },
  { head: ['TAXPAYER', 'IDENTIFICATION', 'NUMBER'] },
  { head: ['REGISTERED NAME'] },
  { head: ['NAME OF CUSTOMER', '(Last Name, First Name, Middle Name)'] },
  { head: ["CUSTOMER'S ADDRESS"] },
  { head: ['AMOUNT OF', 'GROSS SALES'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'EXEMPT SALES'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'ZERO RATED SALES'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'TAXABLE SALES'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'OUTPUT TAX'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'GROSS TAXABLE SALES'], numeric: true, total: true },
];

const PURCHASE_COLS: InquiryColumn[] = [
  { head: ['TAXABLE', 'MONTH'] },
  { head: ['TAXPAYER', 'IDENTIFICATION', 'NUMBER'] },
  { head: ['REGISTERED NAME'] },
  { head: ['NAME OF SUPPLIER', '(Last Name, First Name, Middle Name)'] },
  { head: ["SUPPLIER'S ADDRESS"] },
  { head: ['AMOUNT OF', 'GROSS PURCHASE'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'EXEMPT PURCHASE'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'ZERO-RATED PURCHASE'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'TAXABLE PURCHASE'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'PURCHASE OF SERVICES'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'PURCHASE OF CAPITAL GOODS'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'PURCHASE OF GOODS OTHER THAN CAPITAL GOODS'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'INPUT TAX'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'GROSS TAXABLE PURCHASE'], numeric: true, total: true },
];

const IMPORT_COLS: InquiryColumn[] = [
  { head: ['TAXABLE', 'MONTH'] },
  { head: ['IMPORT', 'ENTRY', 'NUMBER'] },
  { head: ['ASSESSMENT/', 'RELEASE DATE'] },
  { head: ['REGISTERED NAME'] },
  { head: ['IMPORTATION DATE'] },
  { head: ['COUNTRY OF', 'ORIGIN'] },
  { head: ['AMOUNT OF', 'TOTAL LANDED COST'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'DUTIABLE VALUE'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'CHARGES BEFORE', 'RELEASE FROM CUSTOM'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'TAXABLE IMPORTS'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'EXEMPT IMPORTS'], numeric: true, total: true },
  { head: ['AMOUNT OF', 'VAT'], numeric: true, total: true },
  { head: ['OR NUMBER'] },
  { head: ['DATE OF', 'VAT PAYMENT'] },
];

export const INQUIRY_TITLES: Record<InquiryType, string> = {
  sales: 'SALES TRANSACTION',
  purchases: 'PURCHASE TRANSACTION',
  imports: 'IMPORTS TRANSACTION',
};

export interface MonthData {
  year: number;
  month: number;
  /** Rows as built by the Relief page for that month (sales / purchase rows, or import entries). */
  rows: any[];
}

const isoToUs = (iso?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
};

/**
 * Builds the inquiry report. `tinFilter` empty = all taxpayers; otherwise only rows whose
 * counterparty TIN matches (compared left-padded to 9 digits, as Relief does).
 */
export function buildInquiry(
  type: InquiryType, months: MonthData[], owner: InquiryOwner, tinFilter = '',
): InquiryReport {
  const columns = type === 'sales' ? SALES_COLS : type === 'purchases' ? PURCHASE_COLS : IMPORT_COLS;
  const tinOn = tinFilter.replace(/\D/g, '') !== '';
  type R = { key: [string, string, string, string]; cells: (string | number)[] };
  const out: R[] = [];

  for (const md of [...months].sort((a, b) => a.year - b.year || a.month - b.month)) {
    const tm = taxMonthLabel(md.year, md.month);
    for (const r of md.rows) {
      if (type !== 'imports' && tinOn && !sameTin(r.tin, tinFilter)) continue;
      if (type === 'sales') {
        const gross = r.exempt + r.zeroRated + r.taxable;
        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, r.regName || '', fullName(r), r.tin || ''],
          cells: [tm, dash(r.tin), r.regName || '', fullName(r), `${r.addr1 || ''} ${r.addr2 || ''}`.trim(),
            gross, r.exempt, r.zeroRated, r.taxable, r.outputTax, r.taxable + r.outputTax],
        });
      } else if (type === 'purchases') {
        const taxable = r.services + r.capital + r.goodsOther;
        const gross = r.exempt + r.zeroRated + taxable;
        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, r.regName || '', fullName(r), r.tin || ''],
          cells: [tm, dash(r.tin), r.regName || '', fullName(r), `${r.addr1 || ''} ${r.addr2 || ''}`.trim(),
            gross, r.exempt, r.zeroRated, taxable, r.services, r.capital, r.goodsOther, r.inputTax, taxable + r.inputTax],
        });
      } else {
        const landed = Number(r.dutiableValue || 0) + Number(r.charges || 0);
        const vat = Number(r.vat || 0);
        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, r.entryNo || '', r.assessDate || '', ''],
          // Importations carry no exempt flag in this page: entries with VAT are taxable imports, entries without are exempt.
          cells: [tm, r.entryNo || '', isoToUs(r.assessDate), r.registeredName || '', '', r.country || '',
            landed, Number(r.dutiableValue || 0), Number(r.charges || 0), vat > 0 ? landed : 0, vat > 0 ? 0 : landed, vat,
            r.orNumber || '', isoToUs(r.vatPaymentDate)],
        });
      }
    }
  }
  // Relief: order by tax month, registered name, full name, TIN (imports: month, entry no, assessment date).
  out.sort((a, b) => {
    for (let i = 0; i < 4; i++) {
      const c = String(a.key[i]).localeCompare(String(b.key[i]));
      if (c) return c;
    }
    return 0;
  });

  const rows = out.map(o => o.cells);
  const totals = columns.map((c, i) =>
    c.total ? rows.reduce((s, r) => s + (Number(r[i]) || 0), 0) : null);
  return { type, title: INQUIRY_TITLES[type], owner, columns, rows, totals };
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Printable HTML document (landscape) laid out like the Relief report. */
export function inquiryPrintHtml(rep: InquiryReport, periodLabel: string): string {
  const head = rep.columns.map(c => `<th>${c.head.map(esc).join('<br/>')}</th>`).join('');
  const nums = rep.columns.map((_, i) => `<th class="n">(${i + 1})</th>`).join('');
  const body = rep.rows.map(r =>
    `<tr>${r.map((v, i) => rep.columns[i].numeric ? `<td class="r">${money(Number(v))}</td>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const foot = `<tr class="t"><td colspan="${rep.columns.findIndex(c => c.total)}">Grand Total :</td>${
    rep.columns.map((c, i) => c.total ? `<td class="r">${money(rep.totals[i] || 0)}</td>` : '<td></td>').filter((_, i) => i >= rep.columns.findIndex(c => c.total)).join('')}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.title)}</title><style>
@page { size: A4 landscape; margin: 10mm; }
body { font: 9px Arial, Helvetica, sans-serif; color: #000; margin: 0; }
h1 { font-size: 13px; margin: 0; text-align: center; } h2 { font-size: 10px; margin: 2px 0 8px; text-align: center; font-weight: normal; }
.o div { margin: 1px 0; font-weight: bold; } .p { margin: 6px 0; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #555; padding: 2px 3px; vertical-align: top; }
th { background: #eee; font-size: 8px; } th.n { font-weight: normal; } td.r { text-align: right; white-space: nowrap; }
tr.t td { font-weight: bold; background: #f3f3f3; } .end { margin-top: 10px; text-align: center; font-weight: bold; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(rep.title)}</h1><h2>RECONCILIATION OF LISTING FOR ENFORCEMENT</h2>
<div class="o"><div>TIN : ${esc(rep.owner.tin)}</div><div>OWNER'S NAME: ${esc(rep.owner.name)}</div>
${rep.type !== 'imports' ? `<div>OWNER'S TRADE NAME : ${esc(rep.owner.tradeName)}</div>` : ''}<div>OWNER'S ADDRESS: ${esc(rep.owner.address)}</div></div>
<div class="p">Taxable period: ${esc(periodLabel)}</div>
<table><thead><tr>${head}</tr><tr>${nums}</tr></thead><tbody>${body}${foot}</tbody></table>
<div class="end">END OF REPORT</div></body></html>`;
}

/** Sheet layout identical to Relief's Excel export (header rows 1–9, column headings 11–14, data from row 15). */
export function inquiryAoa(rep: InquiryReport): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  const blank = () => new Array(rep.columns.length).fill('');
  const set = (r: number, c: number, v: string | number) => { while (aoa.length < r) aoa.push(blank()); aoa[r - 1][c - 1] = v; };
  set(1, 1, rep.title);
  set(2, 1, 'RECONCILIATION OF LISTING FOR ENFORCEMENT');
  set(6, 1, `TIN : ${rep.owner.tin}`);
  set(7, 1, `OWNER'S NAME: ${rep.owner.name}`);
  if (rep.type !== 'imports') set(8, 1, `OWNER'S TRADE NAME : ${rep.owner.tradeName}`);
  set(9, 1, `OWNER'S ADDRESS: ${rep.owner.address}`);
  rep.columns.forEach((c, i) => {
    c.head.forEach((h, k) => set(11 + k, i + 1, h));
    set(14, i + 1, `(${i + 1})`);
  });
  rep.rows.forEach((r, i) => r.forEach((v, c) => set(15 + i, c + 1, v)));
  const gt = 15 + rep.rows.length + 1;
  set(gt, 1, 'Grand Total :');
  rep.totals.forEach((t, i) => { if (t !== null) set(gt, i + 1, t); });
  set(gt + 2, 1, 'END OF REPORT');
  return aoa;
}

/** Prints an HTML document through a hidden iframe (no pop-up window needed). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open(); doc.write(html); doc.close();
  const go = () => {
    try { frame.contentWindow!.focus(); frame.contentWindow!.print(); } finally {
      setTimeout(() => frame.parentNode && frame.parentNode.removeChild(frame), 1500);
    }
  };
  if (doc.readyState === 'complete') setTimeout(go, 50); else frame.onload = () => setTimeout(go, 50);
}
