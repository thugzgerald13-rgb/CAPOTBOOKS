import type { Client, Purchase } from '../types';
import { ALPHALIST_ATC_BY_MODULE, type AlphalistAtcEntry } from './alphalistAtc';
import { MONTHS, parseDateToISO } from './utils';

export interface MonthlyAlphalistSourcePurchase {
  id: string;
  sourceMonth: string; // YYYY-MM, based on the purchase date / fallback period
}

export interface MonthlyAlphalistPayeeRow {
  tin: string;
  name: string;
  atcCode: string;
  natureOfPayment: string;
  incomePayment: number;
  taxRate: number;
  taxWithheld: number;
  /** Internal source IDs are used for month transfers and filing snapshots; they are not printed. */
  purchaseSources: MonthlyAlphalistSourcePurchase[];
}

export interface MonthlyAlphalistTransfer {
  fromMonth: string;
  toMonth: string;
}

export interface MonthlyAlphalistFiledMonth {
  filedAt: string;
  purchaseIds: string[];
}

export interface MonthlyAlphalistWorkflowState {
  transfers: Record<string, MonthlyAlphalistTransfer>;
  filedMonths: Record<string, MonthlyAlphalistFiledMonth>;
}

const ATC_ENTRIES: AlphalistAtcEntry[] = Object.values(ALPHALIST_ATC_BY_MODULE).flat();

function cleanAtcCode(value: unknown): string {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function findAtc(value: unknown): AlphalistAtcEntry | undefined {
  const code = cleanAtcCode(value);
  return ATC_ENTRIES.find(entry => cleanAtcCode(entry.code) === code);
}

function money2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthKeyFromValue(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const isoDate = parseDateToISO(raw);
  if (isoDate) return isoDate.slice(0, 7);

  let match = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;

  match = raw.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) {
    return `${match[2]}-${String(Number(match[1])).padStart(2, '0')}`;
  }

  const namedMonth = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (namedMonth) {
    const monthIndex = MONTHS.findIndex(m => m.toLowerCase() === namedMonth[1].toLowerCase());
    if (monthIndex >= 0) return `${namedMonth[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
  }
  return null;
}

function belongsToMonth(dateValue: unknown, fallbackPeriod: unknown, month: number, year: number): boolean {
  const target = `${year}-${String(month).padStart(2, '0')}`;
  return (monthKeyFromValue(dateValue) || monthKeyFromValue(fallbackPeriod)) === target;
}

function deriveNature(codeValue: unknown, atc?: AlphalistAtcEntry): string {
  const code = cleanAtcCode(codeValue);
  if (['WC158', 'WI158', 'WC610', 'WI610', 'WC640', 'WI640', 'WI770', 'WC770'].includes(code)) return 'Supplier of Goods';
  if (['WC100', 'WI100', 'WC110', 'WI110'].includes(code)) return 'Rental';
  if (['WC120', 'WI120'].includes(code)) return 'Outside Services';
  const description = String(atc?.description || '').toLowerCase();
  if (description.includes('rental') || description.includes('lease')) return 'Rental';
  if (description.includes('supplier of goods') || description.includes('purchase of goods') || description.includes('supplier of agricultural products')) return 'Supplier of Goods';
  if (description.includes('professional') || description.includes('talent fee') || description.includes('consultant')) return 'Professional Fees';
  if (description.includes('service') || description.includes('contractor') || description.includes('commission')) return 'Outside Services';
  return atc?.description || 'Other Income Payment';
}

function rateFor(atcCode: unknown, enteredRate: unknown, income: number, withheld: number): number {
  const supplied = Number(enteredRate);
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  const scheduled = findAtc(atcCode)?.rate;
  if (scheduled != null && scheduled > 0) return scheduled;
  if (income > 0 && withheld > 0) return withheld / income;
  return 0;
}

function asPayeeRow(input: {
  tin?: unknown;
  name?: unknown;
  atcCode?: unknown;
  natureOfPayment?: unknown;
  incomePayment?: unknown;
  taxRate?: unknown;
  taxWithheld?: unknown;
}): Omit<MonthlyAlphalistPayeeRow, 'purchaseSources'> | null {
  const incomePayment = Number(input.incomePayment || 0);
  const suppliedWithheld = Number(input.taxWithheld || 0);
  const atcCode = cleanAtcCode(input.atcCode);
  const atc = findAtc(atcCode);
  if (!(incomePayment > 0) || (!atcCode && !(suppliedWithheld > 0))) return null;
  const taxRate = rateFor(atcCode, input.taxRate, incomePayment, suppliedWithheld);
  const taxWithheld = suppliedWithheld > 0 ? money2(suppliedWithheld) : money2(incomePayment * taxRate);
  return {
    tin: String(input.tin || '').trim(),
    name: String(input.name || '').trim() || 'UNNAMED PAYEE',
    atcCode,
    natureOfPayment: String(input.natureOfPayment || '').trim() || deriveNature(atcCode, atc),
    incomePayment: money2(incomePayment),
    taxRate,
    taxWithheld,
  };
}

function nextUnfiledMonthAfter(monthKey: string, filedMonths: Record<string, MonthlyAlphalistFiledMonth>): string | null {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  for (let nextMonth = month + 1; nextMonth <= 12; nextMonth++) {
    const candidate = `${year}-${String(nextMonth).padStart(2, '0')}`;
    if (!filedMonths[candidate]) return candidate;
  }
  return null;
}

function validForwardTransfer(
  purchaseId: string,
  sourceMonth: string,
  transfers: Record<string, MonthlyAlphalistTransfer>,
): MonthlyAlphalistTransfer | null {
  const transfer = transfers[purchaseId];
  if (!transfer || transfer.fromMonth !== sourceMonth) return null;
  const source = sourceMonth.match(/^(\d{4})-(\d{2})$/);
  const target = String(transfer.toMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!source || !target || source[1] !== target[1] || Number(target[2]) <= Number(source[2]) || Number(target[2]) > 12) return null;
  return transfer;
}

function effectivePurchaseMonth(
  purchaseId: string,
  sourceMonth: string,
  workflow: MonthlyAlphalistWorkflowState,
): string | null {
  const { transfers, filedMonths } = workflow;
  const transfer = validForwardTransfer(purchaseId, sourceMonth, transfers);

  // An explicit transfer remains authoritative. If its destination was filed
  // before this purchase was included in that filing snapshot, continue after
  // that destination; never put the purchase back into a locked month.
  if (transfer) {
    const destinationFiled = filedMonths[transfer.toMonth];
    if (!destinationFiled || destinationFiled.purchaseIds.includes(purchaseId)) return transfer.toMonth;
    return nextUnfiledMonthAfter(transfer.toMonth, filedMonths);
  }

  const sourceFiled = filedMonths[sourceMonth];
  if (!sourceFiled) return sourceMonth;
  if (sourceFiled.purchaseIds.includes(purchaseId)) return sourceMonth;

  // A purchase encoded after its source month was filed rolls to the first
  // later unfiled month, without crossing the calendar-year boundary.
  return nextUnfiledMonthAfter(sourceMonth, filedMonths);
}

/**
 * Build the monthly report exclusively from Expense History purchases with
 * withholding. Transfers and filing snapshots affect only the reporting month;
 * source accounting purchase records are never mutated.
 */
export function buildMonthlyAlphalistRows(
  client: Pick<Client, 'purchases'> | null | undefined,
  month: number,
  year: number,
  workflow: Partial<MonthlyAlphalistWorkflowState> = {},
): MonthlyAlphalistPayeeRow[] {
  if (!client) return [];
  const transferMap = workflow.transfers || {};
  const filedMonthMap = workflow.filedMonths || {};
  const normalizedWorkflow: MonthlyAlphalistWorkflowState = { transfers: transferMap, filedMonths: filedMonthMap };
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`;
  const sourceRows: MonthlyAlphalistPayeeRow[] = [];

  for (const purchase of (client.purchases || []) as Purchase[]) {
    const sourceMonth = monthKeyFromValue(purchase.date) || monthKeyFromValue(purchase.datMonthYear);
    if (!sourceMonth) continue;
    const purchaseId = String(purchase.id ?? '').trim();
    if (!purchaseId) continue;
    if (effectivePurchaseMonth(purchaseId, sourceMonth, normalizedWorkflow) !== targetMonth) continue;

    const hasWithholding = purchase.withholdingOption === 'with'
      || Number(purchase.whtAmount || 0) > 0
      || (Boolean(purchase.atcCode) && Number(purchase.whtRate || 0) > 0);
    if (!hasWithholding) continue;
    const row = asPayeeRow({
      tin: purchase.supplierTin,
      name: purchase.supplierName,
      atcCode: purchase.atcCode,
      natureOfPayment: '',
      // Expense History stores VATable purchases net of VAT in `amount`;
      // exempt and zero-rated bases are stored separately. The alphalist
      // income-payment base is the full purchase base before VAT.
      incomePayment: Number(purchase.amount || 0) + Number(purchase.exemptAmount || 0) + Number(purchase.zeroRatedAmount || 0),
      taxRate: purchase.whtRate,
      taxWithheld: purchase.whtAmount,
    });
    if (row) sourceRows.push({ ...row, purchaseSources: [{ id: purchaseId, sourceMonth }] });
  }

  const grouped = new Map<string, MonthlyAlphalistPayeeRow>();
  for (const row of sourceRows) {
    const key = [row.tin.replace(/\D/g, ''), row.name.toLowerCase(), row.atcCode, row.natureOfPayment.toLowerCase(), row.taxRate.toFixed(6)].join('|');
    const current = grouped.get(key);
    if (current) {
      current.incomePayment = money2(current.incomePayment + row.incomePayment);
      current.taxWithheld = money2(current.taxWithheld + row.taxWithheld);
      if (!current.purchaseSources.some(source => source.id === row.purchaseSources[0]?.id)) {
        current.purchaseSources.push(...row.purchaseSources);
      }
    } else {
      grouped.set(key, { ...row, purchaseSources: [...row.purchaseSources] });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name) || a.atcCode.localeCompare(b.atcCode));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtAmount(value: number): string {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildMonthlyAlphalistPrintHtml(
  client: Client | null | undefined,
  month: number,
  year: number,
  rows: MonthlyAlphalistPayeeRow[],
): string {
  const companyName = client?.tradeName?.trim() || client?.registeredName?.trim() || client?.name || '';
  const address = client?.address?.trim() || [client?.substreet, client?.street, client?.barangay, client?.district, client?.city, client?.zipCode].filter(Boolean).join(', ');
  const ownerName = client?.proprietor?.trim() || [client?.firstName, client?.middleName, client?.lastName].filter(Boolean).join(' ') || client?.name || '';
  const tin = client?.tin || '';
  const totalIncome = rows.reduce((sum, row) => sum + row.incomePayment, 0);
  const totalWithheld = rows.reduce((sum, row) => sum + row.taxWithheld, 0);
  const rowsHtml = rows.map((row, index) => `<tr>
    <td class="num">${index + 1}</td>
    <td>${escapeHtml(row.tin || '—')}</td>
    <td>${escapeHtml(row.name)}</td>
    <td>${escapeHtml(row.atcCode || '—')}</td>
    <td>${escapeHtml(row.natureOfPayment)}</td>
    <td class="money">${fmtAmount(row.incomePayment)}</td>
    <td class="rate">${(row.taxRate * 100).toLocaleString('en-PH', { maximumFractionDigits: 4 })}%</td>
    <td class="money">${fmtAmount(row.taxWithheld)}</td>
  </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Monthly Alphalist of Payees</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { color:#111; background:#fff; font-family: Arial, Helvetica, sans-serif; font-size:9pt; margin:0; }
    header { text-align:center; margin-bottom:12px; }
    header .company { font-size:14pt; font-weight:700; margin:0 0 3px; text-transform:uppercase; }
    header p { margin:2px 0; font-size:9pt; }
    header h1 { font-size:13pt; margin:13px 0 5px; letter-spacing:.4px; }
    header .period { font-size:10pt; margin:0; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th, td { border:1px solid #555; padding:5px 6px; vertical-align:middle; overflow-wrap:anywhere; }
    th { font-weight:700; text-align:center; font-size:8pt; line-height:1.15; }
    td { font-size:8.5pt; }
    .num { text-align:center; width:4%; }
    th:first-child, td:first-child { width:4%; }
    th:nth-child(2) { width:13%; } th:nth-child(3) { width:20%; } th:nth-child(4) { width:8%; }
    th:nth-child(5) { width:17%; } th:nth-child(6) { width:15%; } th:nth-child(7) { width:8%; } th:nth-child(8) { width:15%; }
    .money, .rate { text-align:right; white-space:nowrap; }
    tfoot td { font-weight:700; border-top:2px solid #222; }
    .sign { margin-top:42px; min-width:280px; width:40%; text-align:center; }
    .sign .name { font-weight:700; text-transform:uppercase; border-bottom:1px solid #222; padding-bottom:3px; }
    .sign .role { margin-top:4px; }
    .empty { text-align:center; color:#444; padding:20px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
    <header>
      <p class="company">${escapeHtml(companyName)}</p>
      ${tin ? `<p>${escapeHtml(tin)}</p>` : ''}
      ${address ? `<p>${escapeHtml(address)}</p>` : ''}
      <h1>MONTHLY ALPHALIST OF PAYEES</h1>
      <p class="period">For the month of ${escapeHtml(MONTHS[month - 1])} ${year}</p>
    </header>
    <table><thead><tr>
      <th>#</th><th>TAXPAYER IDENTIFICATION NUMBER</th><th>NAME OF PAYEES</th><th>ATC CODE</th><th>NATURE OF PAYMENT</th><th>AMOUNT OF INCOME PAYMENT</th><th>TAX RATE</th><th>AMOUNT OF TAX WITHHELD</th>
    </tr></thead><tbody>${rowsHtml || '<tr><td class="empty" colspan="8">No withholding transactions for this month.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:right">T O T A L</td><td class="money">${fmtAmount(totalIncome)}</td><td></td><td class="money">${fmtAmount(totalWithheld)}</td></tr></tfoot></table>
    <div class="sign"><div class="name">${escapeHtml(ownerName)}</div><div class="role">Owner</div></div>
  </body></html>`;
}
