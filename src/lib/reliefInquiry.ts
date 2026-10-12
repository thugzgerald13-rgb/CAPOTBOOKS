/**
 * BIR RELIEF — Transaction Inquiry / Print.
 *
 * Reverse-engineered from BIR Relief v2.3 (birrlf2.exe: frminquiry, rppurch.frx,
 * rpsales.frx, rpimprt.frx) and aligned with the official FoxPro report format.
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
  addressLine1?: string;
  addressLine2?: string;
}

export interface PurchaseRecord {
  tin: string;
  registeredName: string;
  address: string;
  totalPurchase: number;
  zeroRated: number;
  exempt: number;
  grossTaxable: number;
  services: number;
  goodsOther: number;
  capital: number;
  taxableNet: number;
  inputTax: number;
}

export interface SalesRecord {
  tin: string;
  registeredName: string;
  address: string;
  totalSales: number;
  zeroRated: number;
  exempt: number;
  grossTaxable: number;
  taxableNet: number;
  outputTax: number;
}

export interface ImportRecord {
  entryNo: string;
  assessDate: string;
  registeredName: string;
  country: string;
  importDate: string;
  totalLandedCost: number;
  dutiableValue: number;
  charges: number;
  taxableGoods: number;
  exempt: number;
  vat: number;
  orNumber: string;
  vatPaymentDate: string;
}

export interface InquiryMonthGroup {
  year: number;
  month: number;
  monthLabel: string; // e.g. "March, 2026"
  taxDate: string;    // e.g. "03/31/2026"
  records: (PurchaseRecord | SalesRecord | ImportRecord)[];
  monthTotals: Record<string, number>;
}

export interface InquiryReport {
  type: InquiryType;
  title: string;
  reportFileName: string; // 'rppurch.frx' | 'rpsales.frx' | 'rpimprt.frx'
  reportDate: string;     // e.g. '12 October 2026'
  owner: InquiryOwner;
  columns: InquiryColumn[];
  rows: (string | number)[][];
  totals: (number | null)[];
  monthGroups: InquiryMonthGroup[];
  reportTotals: Record<string, number>;
}

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = money;

/** Formats a date into the FoxPro report date: DD Month YYYY (e.g. 12 October 2026). */
export function formatReportDate(d = new Date()): string {
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Last day of the month, MM/DD/YYYY — how Relief stores the taxable month. */
export function taxMonthLabel(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}/${String(new Date(year, month, 0).getDate()).padStart(2, '0')}/${year}`;
}

/** Formats month into FoxPro format: "Month, Year" (e.g. "March, 2026"). */
export function formatTaxableMonth(year: number, month: number): string {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `${monthName}, ${year}`;
}

export const dashTin = (tin: string) => {
  const raw = String(tin || '').replace(/\D/g, '');
  if (!raw) return '';
  const d = raw.padStart(9, '0');
  if (d.length <= 9) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}`;
  }
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9, 12)}`;
};

const sameTin = (a: string, b: string) =>
  String(a || '').replace(/\D/g, '').padStart(9, 'X') === String(b || '').replace(/\D/g, '').padStart(9, 'X');

const fullName = (r: any) =>
  `${(r.lastName || '').trim()}${(r.lastName || '').trim() ? ', ' : ''}${(r.firstName || '').trim()} ${(r.middleName || '').trim()}`.trim();

/** Splits address into two balanced lines for the right-hand owner address box in the report header. */
export function splitOwnerAddress(addr: string): [string, string] {
  const cleanAddr = (addr || '').replace(/\s+/g, ' ').trim();
  if (!cleanAddr) return ['', ''];
  if (cleanAddr.length <= 36) return [cleanAddr, ''];
  // Find a suitable break point around 30-36 characters
  let splitIdx = cleanAddr.lastIndexOf(' ', 36);
  if (splitIdx < 12) splitIdx = 36;
  return [cleanAddr.slice(0, splitIdx).trim(), cleanAddr.slice(splitIdx).trim()];
}

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
  sales: 'Summary List of Sales',
  purchases: 'Summary List of Purchases',
  imports: 'Summary List of Importation',
};

export const REPORT_FILENAMES: Record<InquiryType, string> = {
  sales: 'rpsales.frx',
  purchases: 'rppurch.frx',
  imports: 'rpimprt.frx',
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
 * Builds the inquiry report with both structured month groups (matching BIR Relief rppurch/rpsales/rpimprt)
 * and backward-compatible flat rows for Excel export.
 */
export function buildInquiry(
  type: InquiryType, months: MonthData[], owner: InquiryOwner, tinFilter = '',
): InquiryReport {
  const columns = type === 'sales' ? SALES_COLS : type === 'purchases' ? PURCHASE_COLS : IMPORT_COLS;
  const tinOn = tinFilter.replace(/\D/g, '') !== '';
  type R = { key: [string, string, string, string]; cells: (string | number)[] };
  const out: R[] = [];

  const [addr1, addr2] = owner.addressLine1 && owner.addressLine2
    ? [owner.addressLine1, owner.addressLine2]
    : splitOwnerAddress(owner.address);

  const enhancedOwner: InquiryOwner = {
    ...owner,
    addressLine1: addr1,
    addressLine2: addr2,
  };

  const monthGroups: InquiryMonthGroup[] = [];
  const reportTotals: Record<string, number> = {};

  const sortedMonths = [...months].sort((a, b) => a.year - b.year || a.month - b.month);

  for (const md of sortedMonths) {
    const tm = taxMonthLabel(md.year, md.month);
    const monthLabel = formatTaxableMonth(md.year, md.month);
    const groupRecords: (PurchaseRecord | SalesRecord | ImportRecord)[] = [];
    const monthTotals: Record<string, number> = {};

    const addMonthTotal = (key: string, val: number) => {
      monthTotals[key] = (monthTotals[key] || 0) + val;
      reportTotals[key] = (reportTotals[key] || 0) + val;
    };

    for (const r of md.rows) {
      if (type !== 'imports' && tinOn && !sameTin(r.tin, tinFilter)) continue;

      if (type === 'sales') {
        const exempt = Number(r.exempt || 0);
        const zeroRated = Number(r.zeroRated || 0);
        const taxableNet = Number(r.taxable || 0);
        const outputTax = Number(r.outputTax || 0);
        const grossTaxable = taxableNet + outputTax;
        const totalSales = exempt + zeroRated + taxableNet;
        const regName = (r.regName || '').trim() || fullName(r);
        const address = `${r.addr1 || ''} ${r.addr2 || ''}`.trim();

        const sRec: SalesRecord = {
          tin: dashTin(r.tin),
          registeredName: regName,
          address,
          totalSales,
          zeroRated,
          exempt,
          grossTaxable,
          taxableNet,
          outputTax,
        };
        groupRecords.push(sRec);

        addMonthTotal('totalSales', totalSales);
        addMonthTotal('zeroRated', zeroRated);
        addMonthTotal('exempt', exempt);
        addMonthTotal('grossTaxable', grossTaxable);
        addMonthTotal('taxableNet', taxableNet);
        addMonthTotal('outputTax', outputTax);

        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, regName, fullName(r), r.tin || ''],
          cells: [tm, dashTin(r.tin), regName, fullName(r), address,
            totalSales, exempt, zeroRated, taxableNet, outputTax, grossTaxable],
        });
      } else if (type === 'purchases') {
        const services = Number(r.services || 0);
        const capital = Number(r.capital || 0);
        const goodsOther = Number(r.goodsOther || 0);
        const taxableNet = services + capital + goodsOther;
        const exempt = Number(r.exempt || 0);
        const zeroRated = Number(r.zeroRated || 0);
        const totalPurchase = exempt + zeroRated + taxableNet;
        const inputTax = Number(r.inputTax || 0);
        const grossTaxable = taxableNet + inputTax;
        const regName = (r.regName || '').trim() || fullName(r);
        const address = `${r.addr1 || ''} ${r.addr2 || ''}`.trim();

        const pRec: PurchaseRecord = {
          tin: dashTin(r.tin),
          registeredName: regName,
          address,
          totalPurchase,
          zeroRated,
          exempt,
          grossTaxable,
          services,
          goodsOther,
          capital,
          taxableNet,
          inputTax,
        };
        groupRecords.push(pRec);

        addMonthTotal('totalPurchase', totalPurchase);
        addMonthTotal('zeroRated', zeroRated);
        addMonthTotal('exempt', exempt);
        addMonthTotal('grossTaxable', grossTaxable);
        addMonthTotal('services', services);
        addMonthTotal('goodsOther', goodsOther);
        addMonthTotal('capital', capital);
        addMonthTotal('taxableNet', taxableNet);
        addMonthTotal('inputTax', inputTax);

        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, regName, fullName(r), r.tin || ''],
          cells: [tm, dashTin(r.tin), regName, fullName(r), address,
            totalPurchase, exempt, zeroRated, taxableNet, services, capital, goodsOther, inputTax, grossTaxable],
        });
      } else {
        const landed = Number(r.dutiableValue || 0) + Number(r.charges || 0);
        const dutiable = Number(r.dutiableValue || 0);
        const charges = Number(r.charges || 0);
        const vat = Number(r.vat || 0);
        const taxableGoods = vat > 0 ? landed : 0;
        const exempt = vat > 0 ? 0 : landed;
        const regName = r.registeredName || '';
        const entryNo = r.entryNo || '';
        const assessDate = isoToUs(r.assessDate);
        const importDate = isoToUs(r.importationDate || r.assessDate);
        const country = r.country || '';
        const orNumber = r.orNumber || '';
        const vatPaymentDate = isoToUs(r.vatPaymentDate);

        const iRec: ImportRecord = {
          entryNo,
          assessDate,
          registeredName: regName,
          country,
          importDate,
          totalLandedCost: landed,
          dutiableValue: dutiable,
          charges,
          taxableGoods,
          exempt,
          vat,
          orNumber,
          vatPaymentDate,
        };
        groupRecords.push(iRec);

        addMonthTotal('totalLandedCost', landed);
        addMonthTotal('dutiableValue', dutiable);
        addMonthTotal('charges', charges);
        addMonthTotal('taxableGoods', taxableGoods);
        addMonthTotal('exempt', exempt);
        addMonthTotal('vat', vat);

        out.push({
          key: [`${md.year}${String(md.month).padStart(2, '0')}`, entryNo, r.assessDate || '', ''],
          cells: [tm, entryNo, assessDate, regName, '', country,
            landed, dutiable, charges, taxableGoods, exempt, vat, orNumber, vatPaymentDate],
        });
      }
    }

    monthGroups.push({
      year: md.year,
      month: md.month,
      monthLabel,
      taxDate: tm,
      records: groupRecords,
      monthTotals,
    });
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

  return {
    type,
    title: INQUIRY_TITLES[type],
    reportFileName: REPORT_FILENAMES[type],
    reportDate: formatReportDate(),
    owner: enhancedOwner,
    columns,
    rows,
    totals,
    monthGroups,
    reportTotals,
  };
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/**
 * Printable HTML document formatted exactly like the BIR Relief FoxPro report
 * (rppurch.frx / rpsales.frx / rpimprt.frx) as shown in the Bureau of Internal Revenue Relief System.
 */
export function inquiryPrintHtml(rep: InquiryReport, _periodLabel: string): string {
  const isPurchases = rep.type === 'purchases';
  const isSales = rep.type === 'sales';
  const isImports = rep.type === 'imports';

  const [addr1, addr2] = rep.owner.addressLine1 && rep.owner.addressLine2
    ? [rep.owner.addressLine1, rep.owner.addressLine2]
    : splitOwnerAddress(rep.owner.address);

  let bodyHtml = '';

  for (const mg of rep.monthGroups) {
    let rowsHtml = '';

    if (mg.records.length === 0) {
      rowsHtml = `<tr><td colspan="8" style="padding: 14px 4px; text-align: center; font-style: italic; color: #444;">No record/s to display</td></tr>`;
    } else if (isPurchases) {
      for (const rec of mg.records as PurchaseRecord[]) {
        rowsHtml += `
          <tr class="detail-row detail-line-1">
            <td class="tin-cell">${esc(rec.tin)}</td>
            <td class="name-cell" colspan="7">${esc(rec.registeredName)}</td>
          </tr>
          <tr class="detail-row detail-line-2">
            <td class="tin-cell"></td>
            <td class="addr-cell" colspan="7">${esc(rec.address)}</td>
          </tr>
          <tr class="detail-row detail-line-3">
            <td class="tin-cell"></td>
            <td class="num-cell">${money(rec.totalPurchase)}</td>
            <td class="num-cell">${money(rec.zeroRated)}</td>
            <td class="num-cell">${money(rec.exempt)}</td>
            <td class="num-cell">${money(rec.grossTaxable)}</td>
            <td class="num-cell">${money(rec.services)}</td>
            <td class="num-cell">${money(rec.taxableNet)}</td>
            <td class="num-cell">${money(rec.inputTax)}</td>
          </tr>
          <tr class="detail-row detail-line-4">
            <td class="tin-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell">${money(rec.goodsOther)}</td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
          </tr>
          <tr class="detail-row detail-line-5">
            <td class="tin-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
            <td class="num-cell">${money(rec.capital)}</td>
            <td class="num-cell"></td>
            <td class="num-cell"></td>
          </tr>
        `;
      }
    } else if (isSales) {
      for (const rec of mg.records as SalesRecord[]) {
        rowsHtml += `
          <tr class="detail-row detail-line-1">
            <td class="tin-cell">${esc(rec.tin)}</td>
            <td class="name-cell" colspan="6">${esc(rec.registeredName)}</td>
          </tr>
          <tr class="detail-row detail-line-2">
            <td class="tin-cell"></td>
            <td class="addr-cell" colspan="6">${esc(rec.address)}</td>
          </tr>
          <tr class="detail-row detail-line-3">
            <td class="tin-cell"></td>
            <td class="num-cell">${money(rec.totalSales)}</td>
            <td class="num-cell">${money(rec.zeroRated)}</td>
            <td class="num-cell">${money(rec.exempt)}</td>
            <td class="num-cell">${money(rec.grossTaxable)}</td>
            <td class="num-cell">${money(rec.taxableNet)}</td>
            <td class="num-cell">${money(rec.outputTax)}</td>
          </tr>
        `;
      }
    } else if (isImports) {
      for (const rec of mg.records as ImportRecord[]) {
        rowsHtml += `
          <tr class="detail-row detail-line-1">
            <td class="tin-cell">${esc(rec.entryNo)}</td>
            <td class="txt-cell">${esc(rec.assessDate)}</td>
            <td class="name-cell" colspan="3">${esc(rec.registeredName)}</td>
            <td class="txt-cell">${esc(rec.country)}</td>
            <td class="txt-cell" colspan="2">${esc(rec.importDate)}</td>
          </tr>
          <tr class="detail-row detail-line-3">
            <td class="tin-cell"></td>
            <td class="num-cell">${money(rec.totalLandedCost)}</td>
            <td class="num-cell">${money(rec.dutiableValue)}</td>
            <td class="num-cell">${money(rec.charges)}</td>
            <td class="num-cell">${money(rec.taxableGoods)}</td>
            <td class="num-cell">${money(rec.exempt)}</td>
            <td class="num-cell">${money(rec.vat)}</td>
            <td class="txt-cell">${esc(rec.orNumber)}</td>
          </tr>
        `;
      }
    }

    // Totals for this month
    let monthTotalHtml = '';
    if (isPurchases) {
      monthTotalHtml = `
        <tr class="totals-row month-totals">
          <td class="totals-label" colspan="1">Taxable Month Totals</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.totalPurchase || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.zeroRated || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.exempt || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.grossTaxable || 0)}</td>
          <td class="num-cell totals-num"></td>
          <td class="num-cell totals-num">${money(mg.monthTotals.taxableNet || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.inputTax || 0)}</td>
        </tr>
      `;
    } else if (isSales) {
      monthTotalHtml = `
        <tr class="totals-row month-totals">
          <td class="totals-label" colspan="1">Taxable Month Totals</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.totalSales || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.zeroRated || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.exempt || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.grossTaxable || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.taxableNet || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.outputTax || 0)}</td>
        </tr>
      `;
    } else {
      monthTotalHtml = `
        <tr class="totals-row month-totals">
          <td class="totals-label" colspan="1">Taxable Month Totals</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.totalLandedCost || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.dutiableValue || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.charges || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.taxableGoods || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.exempt || 0)}</td>
          <td class="num-cell totals-num">${money(mg.monthTotals.vat || 0)}</td>
          <td class="num-cell totals-num"></td>
        </tr>
      `;
    }

    bodyHtml += `
      <div class="month-section">
        <div class="tax-month-bar">
          <span class="tax-month-title">Taxable Month</span>
          <span class="tax-month-name">${esc(mg.monthLabel)}</span>
        </div>
        <div class="hr-solid"></div>
        <table class="relief-table">
          <thead>
            ${isPurchases ? `
              <tr class="head-row-1">
                <th class="th-left th-tin">T.I.N.</th>
                <th class="th-left th-name" colspan="7">Registered Name</th>
              </tr>
              <tr class="head-row-2">
                <th class="th-tin"></th>
                <th class="th-num">Total Purchase</th>
                <th class="th-num">Zero Rated</th>
                <th class="th-num">Exempt</th>
                <th class="th-num">Gross Taxable</th>
                <th class="th-num th-stacked">Services/Other<br/>Than Goods/<br/>Capital Goods</th>
                <th class="th-num">Taxable Net</th>
                <th class="th-num">Input Tax</th>
              </tr>
            ` : isSales ? `
              <tr class="head-row-1">
                <th class="th-left th-tin">T.I.N.</th>
                <th class="th-left th-name" colspan="6">Registered Name</th>
              </tr>
              <tr class="head-row-2">
                <th class="th-tin"></th>
                <th class="th-num">Total Sales</th>
                <th class="th-num">Zero Rated</th>
                <th class="th-num">Exempt</th>
                <th class="th-num">Gross Taxable</th>
                <th class="th-num">Taxable Net</th>
                <th class="th-num">Output Tax</th>
              </tr>
            ` : `
              <tr class="head-row-1">
                <th class="th-left th-tin">Entry Number</th>
                <th class="th-left">Assessment Date</th>
                <th class="th-left th-name" colspan="3">Registered Name</th>
                <th class="th-left">Country of Origin</th>
                <th class="th-left" colspan="2">Importation Date</th>
              </tr>
              <tr class="head-row-2">
                <th class="th-tin"></th>
                <th class="th-num">Total Landed Cost</th>
                <th class="th-num">Dutiable Value</th>
                <th class="th-num">Charges</th>
                <th class="th-num">Taxable Goods</th>
                <th class="th-num">Exempt</th>
                <th class="th-num">VAT</th>
                <th class="th-left">OR Number</th>
              </tr>
            `}
          </thead>
          <tbody>
            <tr class="hr-table-row"><td colspan="${isPurchases ? 8 : isSales ? 7 : 8}"><div class="hr-solid"></div></td></tr>
            ${rowsHtml}
            <tr class="hr-table-row"><td colspan="${isPurchases ? 8 : isSales ? 7 : 8}"><div class="hr-solid"></div></td></tr>
            ${monthTotalHtml}
          </tbody>
        </table>
        <div class="hr-double"></div>
      </div>
    `;
  }

  // Report Grand Totals
  let grandTotalHtml = '';
  if (isPurchases) {
    grandTotalHtml = `
      <table class="relief-table report-totals-table">
        <tbody>
          <tr class="totals-row report-totals">
            <td class="totals-label th-tin" style="width: 140px;">Report Totals</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.totalPurchase || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.zeroRated || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.exempt || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.grossTaxable || 0)}</td>
            <td class="num-cell totals-num"></td>
            <td class="num-cell totals-num">${money(rep.reportTotals.taxableNet || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.inputTax || 0)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (isSales) {
    grandTotalHtml = `
      <table class="relief-table report-totals-table">
        <tbody>
          <tr class="totals-row report-totals">
            <td class="totals-label th-tin" style="width: 140px;">Report Totals</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.totalSales || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.zeroRated || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.exempt || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.grossTaxable || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.taxableNet || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.outputTax || 0)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    grandTotalHtml = `
      <table class="relief-table report-totals-table">
        <tbody>
          <tr class="totals-row report-totals">
            <td class="totals-label th-tin" style="width: 140px;">Report Totals</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.totalLandedCost || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.dutiableValue || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.charges || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.taxableGoods || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.exempt || 0)}</td>
            <td class="num-cell totals-num">${money(rep.reportTotals.vat || 0)}</td>
            <td class="num-cell totals-num"></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(rep.reportFileName)} - ${esc(rep.title)}</title>
  <style>
    @page {
      size: landscape;
      margin: 8mm 12mm 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
      line-height: 1.35;
    }
    .report-sheet {
      width: 100%;
      max-width: 1060px;
      margin: 0 auto;
      padding: 10px 0;
    }
    .rpt-header {
      font-size: 11px;
      line-height: 1.35;
      margin-bottom: 6px;
    }
    .rpt-header .system-line {
      font-weight: normal;
    }
    .rpt-header .title-line {
      font-weight: normal;
    }
    .rpt-header .date-line {
      margin-top: 1px;
    }
    .hr-solid {
      border: 0;
      border-top: 1px solid #000;
      margin: 4px 0;
      width: 100%;
    }
    .hr-double {
      border: 0;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      height: 3px;
      margin: 4px 0;
      width: 100%;
    }
    .owner-section {
      display: table;
      width: 100%;
      font-size: 11px;
      line-height: 1.38;
      margin: 2px 0;
    }
    .owner-col-left {
      display: table-cell;
      width: 58%;
      vertical-align: top;
    }
    .owner-col-right {
      display: table-cell;
      width: 42%;
      vertical-align: top;
    }
    .owner-row {
      display: flex;
    }
    .owner-lbl {
      width: 130px;
      white-space: nowrap;
    }
    .owner-val {
      flex: 1;
    }
    .owner-val.tin-val {
      font-weight: bold;
    }
    .addr-lbl {
      width: 105px;
      white-space: nowrap;
    }
    .addr-val {
      flex: 1;
    }
    .tax-month-bar {
      font-size: 11px;
      margin: 2px 0;
    }
    .tax-month-title {
      display: inline-block;
      width: 130px;
    }
    .tax-month-name {
      font-style: italic;
    }
    table.relief-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }
    table.relief-table th, table.relief-table td {
      padding: 0 4px;
      vertical-align: top;
    }
    .th-tin, .tin-cell {
      width: 130px;
      text-align: left;
      font-family: Arial, Helvetica, sans-serif;
    }
    .tin-cell {
      font-family: 'Courier New', Courier, monospace;
      white-space: nowrap;
    }
    .name-cell, .addr-cell {
      font-family: 'Courier New', Courier, monospace;
      text-align: left;
    }
    .th-left {
      text-align: left;
      font-weight: bold;
      font-family: Arial, Helvetica, sans-serif;
    }
    .th-num {
      text-align: right;
      font-weight: bold;
      font-family: Arial, Helvetica, sans-serif;
      vertical-align: bottom;
      font-size: 10.5px;
    }
    .th-stacked {
      line-height: 1.15;
    }
    .num-cell {
      font-family: 'Courier New', Courier, monospace;
      text-align: right;
      white-space: nowrap;
      font-size: 11px;
    }
    .txt-cell {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      text-align: left;
    }
    .detail-row td {
      line-height: 1.25;
    }
    .hr-table-row td {
      padding: 0;
    }
    .totals-label {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: bold;
      font-size: 11px;
      white-space: nowrap;
      text-align: left;
    }
    .totals-num {
      font-weight: bold;
    }
    .month-totals td {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .report-totals td {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .report-totals-table {
      margin-top: 0;
    }
    @media print {
      body { margin: 0; }
      .month-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-sheet">
    <div class="rpt-header">
      <div class="system-line">Bureau of Internal Revenue</div>
      <div class="system-line">Reconciliation of Listings for Enforcement System</div>
      <div class="title-line">${esc(rep.title)}</div>
      <div class="date-line">Report Date : ${esc(rep.reportDate)}</div>
    </div>
    <div class="hr-solid"></div>
    <div class="owner-section">
      <div class="owner-col-left">
        <div class="owner-row"><span class="owner-lbl">T.I.N. of Owner :</span><span class="owner-val tin-val">${esc(dashTin(rep.owner.tin))}</span></div>
        <div class="owner-row"><span class="owner-lbl">Registered Name :</span><span class="owner-val">${esc(rep.owner.name)}</span></div>
        ${rep.type !== 'imports' ? `<div class="owner-row"><span class="owner-lbl">Trade Name :</span><span class="owner-val">${esc(rep.owner.tradeName || rep.owner.name)}</span></div>` : ''}
      </div>
      <div class="owner-col-right">
        <div class="owner-row"><span class="addr-lbl">Owners Address:</span><span class="addr-val">${esc(addr1)}</span></div>
        <div class="owner-row"><span class="addr-lbl"></span><span class="addr-val">${esc(addr2)}</span></div>
      </div>
    </div>
    <div class="hr-solid"></div>
    ${bodyHtml}
    ${grandTotalHtml}
    <div class="hr-double"></div>
  </div>
</body>
</html>`;
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
