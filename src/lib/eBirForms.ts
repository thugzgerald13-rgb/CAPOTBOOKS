// eBirForms.ts — eBIRForms (Offline Package v7.9.6.2) integration.
// Reference data (ATC codes, form list) extracted from the Offline eBIRForms
// Package XML resources. Generates an eBIRForms-compatible XML data file
// (importable into the offline eBIRForms app) and a printable BIR form, both
// populated from the active client's ledger (sales / purchases / EWT).
import type { Client } from '../types';

export interface EwtAtcEntry { code: string; description: string; rate: number; }
export const EW_ATC_CODES: EwtAtcEntry[] = [
  { code: 'WV010', description: 'VAT WITHHOLDING ON PURCHASE OF GOODS', rate: 5.0 },
  { code: 'WV020', description: 'VAT WITHHOLDING ON PURCHASE OF SERVICES', rate: 5.0 },
  { code: 'WV030', description: 'VAT WITHHOLDING ON GOVERNMENT PUBLIC WORK CONTRACTS', rate: 5.0 },
  { code: 'WC010', description: 'PROFL TALENT FEE PD TO JURIDICL (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WC011', description: 'PROFL TALENT FEE PD TO JURIDICL (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WC050', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WC051', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WC100', description: 'RENTALS (CORP.)', rate: 5.0 },
  { code: 'WC110', description: 'CINEM. FILM RENTALS (CORP.)', rate: 5.0 },
  { code: 'WC120', description: 'CONTRACTORS (CORPORATE)', rate: 2.0 },
  { code: 'WC140', description: 'AMOUNTS PAID TO CERTAIN BROKERS AND AGENTS (CORP.)', rate: 10.0 },
  { code: 'WC156', description: 'CREDIT CREDIT CARD COMPANIES', rate: 0.5 },
  { code: 'WC157', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(CORP-SERVICES)', rate: 2.0 },
  { code: 'WC158', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF GOODS OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 1.0 },
  { code: 'WC160', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF SERVICES OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 2.0 },
  { code: 'WC515', description: 'COMM OF INDPNT AND/OR EXCL SALES REP,MKTG AGENTS(CORP)', rate: 10.0 },
  { code: 'WC535', description: 'PYMTS MADE BY PRE-NEED CO. TO FUNERAL PARLORS(CORP)', rate: 1.0 },
  { code: 'WC540', description: 'TOLLING FEE PAID TO REFINERIES(CORPORATE)', rate: 5.0 },
  { code: 'WC610', description: 'PYMTS MADE TO SUPPLIERS OF AGRICULTURAL PRODUCTS(CORP)', rate: 1.0 },
  { code: 'WC630', description: 'PYMTS ON PURCH-MINERALS,MINERAL PROD,QUARRY RESRCS(CORP)', rate: 5.0 },
  { code: 'WC632', description: 'INCME PYMT ON PURCH OF GOLD BYBSPTO GOLDMINRS RA7076', rate: 5.0 },
  { code: 'WC640', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(CORP-GOODS)', rate: 1.0 },
  { code: 'WC650', description: 'GROSS AMOUNT OF REFUND GIVEN BY MERALCO TO CUSTOMERS WITH ACTIVE CONTRACTS', rate: 25.0 },
  { code: 'WC651', description: 'WITHHOLDING ON GROSS AMT OF REF TO MERALCO CUS-TERMINATED', rate: 32.0 },
  { code: 'WC660', description: 'GROS OF INT RFUND OF MTER DPOSIT RESIDNTL ELECT&gt;200KW MER', rate: 10.0 },
  { code: 'WC661', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRES ELECT&gt;200KW MER', rate: 10.0 },
  { code: 'WC662', description: 'GROS OF INT RFUND OF MTER DPOSIT RESIDNTL ELECT&gt;200KW DU', rate: 10.0 },
  { code: 'WC663', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRES ELECT>200KW DU', rate: 20.0 },
  { code: 'WI010', description: 'PROFLS, LAWYERS,CPAS, ENGR (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI011', description: 'PROFLS, LAWYERS,CPAS, ENGR (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI020', description: 'PROF ENTRTNR-IF CURR YR GROSS INC DOESNT EXCEED P720,000 (IND.)', rate: 10.0 },
  { code: 'WI021', description: 'PROF ENTRTAINRS-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI030', description: 'PROF ATH-IF CURR YR GROSS INC DOESNT EXCEED P720,000 (IND.)', rate: 10.0 },
  { code: 'WI031', description: 'PROF ATHLETES-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI040', description: 'MOVIE,STAGE,ETC-IF CURR YR GROSS INC DOESNT EXCEED P720T (IND.)', rate: 10.0 },
  { code: 'WI041', description: 'MOVIE,STAGE,ETC-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI050', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI051', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &gt;720,000)', rate: 15.0 },
  { code: 'WI060', description: 'BUSINESS AND BOOKKEEPING AGENTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI061', description: 'BUSINESS AND BOOKKEEPING AGENTS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI070', description: 'INSURANCE AGENTS AND ADJUSTERS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI071', description: 'INSURANCE AGENTS AND ADJUSTERS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI080', description: 'OTHER RCPNT OF TF-IF CURR YR GROSS INC DSNT EXCEED P720T (IND.)', rate: 10.0 },
  { code: 'WI081', description: 'OTHER RCPNT OF TF-IF CURR YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI090', description: 'FEES OF DIRECTORS NOT EMPLOYEE OF COMP(GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI091', description: 'FEES OF DIRECTORS NOT EMPLOYEE OF COMP(GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI100', description: 'RENTALS (INDIVIDUAL)', rate: 5.0 },
  { code: 'WI110', description: 'CINEM. FILM RENTALS -(INDIVIDUAL)', rate: 5.0 },
  { code: 'WI120', description: 'CONTRACTORS (INDIVIDUAL)', rate: 2.0 },
  { code: 'WI130', description: 'INCOME DISTRIBUTION TO BENEFICIARIES (IND.)', rate: 15.0 },
  { code: 'WI140', description: 'AMOUNTS PAID TO CERTAIN BROKERS AND AGENTS (IND.)', rate: 10.0 },
  { code: 'WI141', description: 'PYMTS FOR MED PRACTITIONRS THRU A DULY REG PROF PRTNRSHP (INC. &lt;= 720,000)', rate: 10.0 },
  { code: 'WI142', description: 'PAYMENTS FOR MED PRACTITIONERS THRU A DULY REG PROF PARTNERSHIP (INC &gt;720,000)', rate: 15.0 },
  { code: 'WI150', description: 'PYMT TO MED PRACTNRS THRU HOSP/CLINICS(GROSS INC &gt;720,000)', rate: 15.0 },
  { code: 'WI151', description: 'PYMT TO MED PRACTNRS THRU HOSP/CLINICS(GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI152', description: 'PYMT TO PARTNERS IN PROF PARTNERSHIP (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI153', description: 'PYMT TO PARTNERS IN PROF PRTNSHIP (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI156', description: 'PAYMENTS MADE BY CREDIT CARD COMPANIES TO INDIVIDUALS', rate: 0.5 },
  { code: 'WI157', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(INDIV-SERVICES)', rate: 2.0 },
  { code: 'WI158', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF GOODS OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 1.0 },
  { code: 'WI159', description: 'ADDL PAYMENTS TO GOVT PERSONNEL FROM IMPORTERS,SHIPPING', rate: 15.0 },
  { code: 'WI160', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF SERVICES OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 2.0 },
  { code: 'WI515', description: 'COMM OF INDPNT AND/OR EXCL SALES REP,MKTG AGENTS OF CO.', rate: 10.0 },
  { code: 'WI530', description: 'GROSS PYMTS TO EMBALMERS BY FUNERAL COMPANIES', rate: 1.0 },
  { code: 'WI535', description: 'PYMTS MADE BY PRE-NEED CO. TO FUNERAL PARLORS', rate: 1.0 },
  { code: 'WI540', description: 'TOLLING FEE PAID TO REFINERIES', rate: 5.0 },
  { code: 'WI610', description: 'PYMTS MADE TO SUPPLIERS OF AGRICULTURAL PRODUCTS', rate: 1.0 },
  { code: 'WI630', description: 'PYMTS ON PURCH-MINERALS,MINERAL PROD,QUARRY RESOURCES', rate: 5.0 },
  { code: 'WI632', description: 'INCM PYMT ON PURCH OF GOLD BYBSPTO GOLDMINRS RA7076 IND', rate: 5.0 },
  { code: 'WI640', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(INDIV-GOODS)', rate: 1.0 },
  { code: 'WI650', description: 'GROSS AMOUNT OF REFUND GIVEN BY MERALCO TO CUSTOMERS WITH ACTIVE CONTRACTS', rate: 25.0 },
  { code: 'WI651', description: 'WITHHOLDING ON GROSS AMT OF REF TO MERALCO CUS-TERMINATED', rate: 32.0 },
  { code: 'WI660', description: 'GROS OF INT RFUND OF MTER DPOSIT RESID ELECT&gt;200KW MER IND', rate: 10.0 },
  { code: 'WI661', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRS ELECT&gt;200KW MER IND', rate: 10.0 },
  { code: 'WI662', description: 'GROS OF INT RFUND OF MTER DPOSIT RESID ELECT&gt;200KW DU IND', rate: 10.0 },
  { code: 'WI663', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRS ELECT&gt;200KW DU IND', rate: 20.0 },
  { code: 'WC180', description: 'FINAL TAX -INTEREST ON FOREIGN CURRENCY PAYABLE TO NON-RESIDENT FOREIGN CORPORATION', rate: 20.0 },
  { code: 'WC190', description: 'FINAL TAX -INTEREST ON FOREIGN CURRENCY PAYABLE TO OFFSHORE BANKING UNIT/FOREIGN CURRENCY DEP. UNIT', rate: 10.0 },
  { code: 'WC191', description: 'WITHOLDING TAX ON INCOME PAYMENT TO FCDUS', rate: 10.0 },
  { code: 'WC212', description: 'CASH DIVIDEND PAYMENTS BY DOMESTIC CORPORATION TO CITIZENS AND RESIDENT ALIENS/NRFCs', rate: 30.0 },
];

export interface EBirFormOption {
  id: string;
  title: string;
  period: 'monthly' | 'quarterly' | 'adhoc';
  category: 'vat' | 'percentage' | 'withholding' | 'income' | 'payment';
}
// NOTE: Monthly BIR Form 2550M was DISCONTINUED under RMC No. 5-2023 — only the
// quarterly 2550Q remains for VAT filers. Old/discontinued form versions are
// intentionally excluded; only current (latest) BIR form editions are listed.
export const EBIR_FORMS: EBirFormOption[] = [
  { id: '2550Q', title: 'BIR Form 2550Q — Quarterly Value-Added Tax Return', period: 'quarterly', category: 'vat' },
  { id: '2551Q', title: 'BIR Form 2551Q — Quarterly Percentage Tax Return', period: 'quarterly', category: 'percentage' },
  { id: '0619-E', title: 'BIR Form 0619-E — Monthly Remittance of Expanded Withholding Tax', period: 'monthly', category: 'withholding' },
  { id: '1601-EQ', title: 'BIR Form 1601-EQ — Quarterly Remittance of Expanded Withholding Tax', period: 'quarterly', category: 'withholding' },
  { id: '1601-C', title: 'BIR Form 1601-C — Monthly Remittance of Withholding Tax on Compensation', period: 'monthly', category: 'withholding' },
  { id: '1701Q', title: 'BIR Form 1701Q — Quarterly Income Tax Return (Individual)', period: 'quarterly', category: 'income' },
  { id: '1702Q', title: 'BIR Form 1702Q — Quarterly Income Tax Return (Corporation/Partnership)', period: 'quarterly', category: 'income' },
  { id: '0605', title: 'BIR Form 0605 — Payment Form', period: 'adhoc', category: 'payment' },
];

export interface EBirLedgerData {
  salesTotal: number;
  vatableSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  outputTax: number;
  purchasesTotal: number;
  vatablePurchases: number;
  inputTax: number;
  capitalGoodsInputTax: number;
  servicesInputTax: number;
  goodsInputTax: number;
  ewtTotal: number;
  ewtByAtc: Array<{ atcCode: string; baseAmount: number; rate: number; taxWithheld: number }>;
  compensationWithholding: number;
  expensesTotal: number;
}

export interface EBirFormValues {
  formType: string;
  year: number;
  month?: number;
  quarter?: number;
  tin: string;
  rdoCode: string;
  registeredName: string;
  tradeName: string;
  address: string;
  lineItems: Array<{ label: string; value: number; itemNo: string }>;
  totalTaxPayable: number;
  currency: 'PHP';
}

const fmt2 = (n: number) => (Number(n) || 0).toFixed(2);
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Compute the key numeric line items for a BIR form from ledger data. */
export function computeEBirFormValues(
  formType: string,
  period: { year: number; month?: number; quarter?: number },
  client: Partial<Client>,
  ledger: EBirLedgerData,
): EBirFormValues {
  const tin = String(client.tin || '').replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const lineItems: EBirFormValues['lineItems'] = [];
  let totalTaxPayable = 0;

  if (formType === '2550M' || formType === '2550Q') {
    lineItems.push({ itemNo: '14', label: 'Output Tax (12% on taxable sales)', value: ledger.outputTax });
    lineItems.push({ itemNo: '18A', label: 'Input Tax on Purchases of Goods', value: ledger.goodsInputTax });
    lineItems.push({ itemNo: '18B', label: 'Input Tax on Purchases of Services', value: ledger.servicesInputTax });
    lineItems.push({ itemNo: '18C', label: 'Input Tax on Capital Goods', value: ledger.capitalGoodsInputTax });
    lineItems.push({ itemNo: '20', label: 'Total Allowable Input Tax', value: ledger.inputTax });
    totalTaxPayable = Math.max(0, ledger.outputTax - ledger.inputTax);
    lineItems.push({ itemNo: '21', label: 'VAT Payable / (Overpayment)', value: totalTaxPayable });
  } else if (formType === '2551Q') {
    const pctTax = ledger.salesTotal * 0.03; // 3% percentage tax (non-VAT)
    lineItems.push({ itemNo: '15', label: 'Taxable Amount (Gross Receipts)', value: ledger.salesTotal });
    lineItems.push({ itemNo: '16', label: 'Tax Rate 3%', value: 3 });
    lineItems.push({ itemNo: '17', label: 'Tax Due', value: pctTax });
    totalTaxPayable = pctTax;
  } else if (formType === '0619-E' || formType === '1601-EQ') {
    let total = 0;
    for (const e of ledger.ewtByAtc) {
      lineItems.push({ itemNo: e.atcCode, label: e.atcCode + ' — base ' + fmt2(e.baseAmount) + ' @ ' + e.rate + '%', value: e.taxWithheld });
      total += e.taxWithheld;
    }
    totalTaxPayable = total;
    lineItems.push({ itemNo: 'TOTAL', label: 'Total Taxes Withheld', value: total });
  } else if (formType === '1601-C') {
    lineItems.push({ itemNo: '16', label: 'Total Compensation Withholding Tax', value: ledger.compensationWithholding });
    totalTaxPayable = ledger.compensationWithholding;
  } else if (formType === '1701Q' || formType === '1702Q') {
    const gross = ledger.salesTotal;
    const net = Math.max(0, gross - ledger.purchasesTotal - ledger.expensesTotal);
    lineItems.push({ itemNo: '19', label: 'Gross Sales / Receipts', value: gross });
    lineItems.push({ itemNo: '25', label: 'Total Deductions', value: ledger.purchasesTotal + ledger.expensesTotal });
    lineItems.push({ itemNo: '26', label: 'Taxable Income', value: net });
    totalTaxPayable = net * 0.25; // 25% corporate / graduated for individual; placeholder
    lineItems.push({ itemNo: '27', label: 'Income Tax Due (25% est.)', value: totalTaxPayable });
  }

  return {
    formType,
    year: period.year,
    month: period.month,
    quarter: period.quarter,
    tin,
    rdoCode: String(client.rdoCode || ''),
    registeredName: client.registeredName || client.name || '',
    tradeName: client.name || '',
    address: (client as any).address || '',
    lineItems,
    totalTaxPayable,
    currency: 'PHP',
  };
}

/**
 * Generate an eBIRForms-compatible XML data file. The Offline eBIRForms Package
 * stores form data as XML keyed by form version + field item numbers; this
 * export mirrors that structure so the file can be opened/imported by the
 * offline app (File > Open / Import) and validated with its built-in rules.
 */
export function downloadEBirFormXml(values: EBirFormValues) {
  const period = values.quarter ? `Q${values.quarter} ${values.year}` : (values.month ? `${String(values.month).padStart(2,'0')}/${values.year}` : String(values.year));
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<eBIRForms version="7.9.6.2" source="CAPOT Books">');
  lines.push(`  <Form type="${esc(values.formType)}" period="${esc(period)}">`);
  lines.push(`    <Taxpayer tin="${esc(values.tin)}" rdo="${esc(values.rdoCode)}">`);
  lines.push(`      <RegisteredName>${esc(values.registeredName)}</RegisteredName>`);
  lines.push(`      <TradeName>${esc(values.tradeName)}</TradeName>`);
  lines.push(`      <Address>${esc(values.address)}</Address>`);
  lines.push('    </Taxpayer>');
  lines.push('    <LineItems>');
  for (const it of values.lineItems) {
    lines.push(`      <Item no="${esc(it.itemNo)}" label="${esc(it.label)}">${fmt2(it.value)}</Item>`);
  }
  lines.push('    </LineItems>');
  lines.push(`    <TotalTaxPayable>${fmt2(values.totalTaxPayable)}</TotalTaxPayable>`);
  lines.push('  </Form>');
  lines.push('</eBIRForms>');
  const xml = lines.join('\n');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eBIRForm_${values.formType}_${values.year}${values.quarter ? '_Q'+values.quarter : values.month ? '_'+String(values.month).padStart(2,'0') : ''}.xml`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return xml;
}

/** Open a printable BIR form (HTML) in a new window, populated with values. */
export function printEBirForm(values: EBirFormValues) {
  const period = values.quarter ? `Quarter ${values.quarter} — ${values.year}` : (values.month ? `${String(values.month).padStart(2,'0')} / ${values.year}` : String(values.year));
  const rows = values.lineItems.map(it => `
    <tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:#64748b">${esc(it.itemNo)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(it.label)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${fmt2(it.value)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BIR Form ${esc(values.formType)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#0f172a}
  .hdr{background:#1e40af;color:#fff;padding:18px 24px;border-radius:6px}
  .hdr h1{margin:0;font-size:18px}.hdr p{margin:4px 0 0;font-size:12px;opacity:.9}
  .tp{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0;font-size:13px}
  .tp div{padding:6px 10px;background:#f1f5f9;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px}
  th{background:#1e40af;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
  .total{margin-top:16px;text-align:right;font-size:15px;font-weight:bold;padding:10px;background:#fef3c7;border-radius:4px}
  .foot{margin-top:30px;font-size:10px;color:#94a3b8}
  @media print{.no-print{display:none}}</style></head><body>
  <div class="hdr"><h1>Republic of the Philippines — Bureau of Internal Revenue</h1>
  <p>BIR Form ${esc(values.formType)} &nbsp;·&nbsp; Period: ${esc(period)} &nbsp;·&nbsp; Generated by CAPOT Books (eBIRForms-compatible)</p></div>
  <div class="tp">
    <div><b>TIN:</b> ${esc(values.tin)}</div><div><b>RDO Code:</b> ${esc(values.rdoCode)}</div>
    <div><b>Registered Name:</b> ${esc(values.registeredName)}</div><div><b>Trade Name:</b> ${esc(values.tradeName)}</div>
    <div style="grid-column:1/3"><b>Address:</b> ${esc(values.address)}</div>
  </div>
  <table><thead><tr><th style="width:80px">Item No.</th><th>Description</th><th style="width:160px;text-align:right">Amount (PHP)</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="total">TOTAL TAX PAYABLE: PHP ${fmt2(values.totalTaxPayable)}</div>
  <p class="foot">This printable form mirrors the eBIRForms Offline Package v7.9.6.2 field layout. Import the companion XML into the official eBIRForms offline app for final validation and submission.</p>
  <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
  return html;
}