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
export const EBIR_FORMS: EBirFormOption[] = [
  { id: '2550M', title: 'BIR Form 2550M — Monthly Value-Added Tax Declaration', period: 'monthly', category: 'vat' },
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
    address: client.address || '',
    lineItems,
    totalTaxPayable,
    currency: 'PHP',
  };
}

/** Official VAT rate cells (from taxRate.xml) — used by 2550M/2550Q. */
export const EBIR_VAT_RATE = Number(TAX_RATE_CELLS['frm2550qv2024:hiddenVatRate']?.value || 12) / 100; // 0.12

/** Build the official cell-ID list for a form (subset of TAX_RATE_CELLS for that form). */
export function taxRateCellsForForm(formId: string) {
  const prefix = 'frm' + formId.toLowerCase();
  return Object.entries(TAX_RATE_CELLS).filter(([k]) => k.toLowerCase().startsWith(prefix));
}

/** Official eBIRForms cell-ID prefix (lowercase form id). */
export function ebirCellPrefix(formType: string): string {
  return 'frm' + formType.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const urlEnc = (s: any) => encodeURIComponent(String(s ?? '')).replace(/'/g, '%27');
const numFmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Build the official field list (cellId -> value) for a form, in savefile order. */
export function buildOfficialSaveFields(values: EBirFormValues, ledger: EBirLedgerData): Array<{ cellId: string; value: string }> {
  const p = ebirCellPrefix(values.formType);
  const tin = values.tin || '000000000';
  const tin1 = tin.slice(0, 3), tin2 = tin.slice(3, 6), tin3 = tin.slice(6, 9);
  const branch = '00000'.slice(0, 5) || '00000';
  const f: Array<{ cellId: string; value: string }> = [];
  const add = (id: string, v: any) => f.push({ cellId: `${p}:${id}`, value: String(v ?? '') });

  // --- Period / amendment flags (common) ---
  if (values.quarter) {
    add('OptQuarter1', values.quarter === 1 ? 'true' : 'false');
    add('OptQuarter2', values.quarter === 2 ? 'true' : 'false');
    add('OptQuarter3', values.quarter === 3 ? 'true' : 'false');
    add('OptQuarter4', values.quarter === 4 ? 'true' : 'false');
  } else if (values.month) {
    add('RtnMonth', String(values.month));
    add('txtMonth', String(values.month));
  }
  add('txtYear', String(values.year));
  add('txtSheets', '1');
  add('AmendedRtn_1', 'false');
  add('AmendedRtn_2', 'true');

  // --- Taxpayer block (field names vary slightly by form; emit both variants) ---
  add('txtTIN1', tin1); add('txtTIN2', tin2); add('txtTIN3', tin3);
  add('txtTin1', tin1); add('txtTin2', tin2); add('txtTin3', tin3);
  add('txtBranchCode', branch);
  add('txtRDOCode', values.rdoCode);
  add('txtRdoCode', values.rdoCode);
  add('txtTaxpayerName', urlEnc(values.registeredName));
  add('txtTaxPayerName', urlEnc(values.registeredName));
  add('txtTaxpayerName1', urlEnc(values.registeredName));
  add('txtAddress', urlEnc(values.address));
  add('txtTaxPayerAdd', urlEnc(values.address));
  add('txtZipCode', '');
  add('txtTaxPayerZip', '');
  add('txtTelNum', '');
  add('txtLineBus', urlEnc('GENERAL SERVICES'));
  add('txtDescription', urlEnc('GENERAL SERVICES'));

  // --- Form-specific line items ---
  if (values.formType.startsWith('2550')) {
    add('txt14A', numFmt(ledger.outputTax));
    add('txt18A', numFmt(ledger.goodsInputTax));
    add('txt18B', numFmt(ledger.servicesInputTax));
    add('txt18C', numFmt(ledger.capitalGoodsInputTax));
    add('txt20', numFmt(ledger.inputTax));
    add('txt21', numFmt(values.totalTaxPayable));
  } else if (values.formType === '2551Q') {
    add('txt15', numFmt(ledger.salesTotal));
    add('txt16', '3');
    add('txt17', numFmt(values.totalTaxPayable));
  } else if (values.formType === '0619-E' || values.formType === '1601-EQ') {
    add('txtAtc', ledger.ewtByAtc.map(e => e.atcCode).join(' '));
    add('txtTaxTypeCode', 'WE');
    for (let idx = 0; idx < Math.min(ledger.ewtByAtc.length, 10); idx++) {
      const e = ledger.ewtByAtc[idx];
      add(`txtAtc${idx + 1}`, e.atcCode);
      add(`txtBase${idx + 1}`, numFmt(e.baseAmount));
      add(`txtRate${idx + 1}`, String(e.rate));
      add(`txtWht${idx + 1}`, numFmt(e.taxWithheld));
    }
    add('txtTotalTaxWithheld', numFmt(values.totalTaxPayable));
  } else if (values.formType === '1601-C') {
    add('txt16', numFmt(ledger.compensationWithholding));
  } else if (values.formType === '0605') {
    add('txtATC', 'MC350');
    add('txtTaxTypeCode', 'MA');
    add('txt18A', numFmt(values.totalTaxPayable));
  } else {
    // 1701Q / 1702Q — income tax
    add('txt16C', numFmt(ledger.salesTotal));
    add('txt20C', numFmt(ledger.purchasesTotal + ledger.expensesTotal));
    add('txt26B', numFmt(Math.max(0, ledger.salesTotal - ledger.purchasesTotal - ledger.expensesTotal)));
    add('txt30', numFmt(values.totalTaxPayable));
  }
  return f;
}

/**
 * Generate an official eBIRForms save file (plain XML, savefile/ format).
 * Format (reverse-engineered from 475 real saved forms in v7.9.6.1):
 *   <?xml version='1.0'?>
 *   <div>frm{FORM}:{FIELD}=VALUEfrm{FORM}:{FIELD}=</div>   (one per field, URL-encoded)
 * The file can be dropped into the official app's savefile/ folder and opened
 * via File → Open; the app then validates and (on submit) runs Encrypt.exe +
 * ebfSFTP.exe SFTP upload. Filename convention: {TIN}-{FORM}v{VER}-{PERIOD}#{email}#.xml
 */
export function downloadEBirFormXml(values: EBirFormValues, ledger: EBirLedgerData, currentClient?: any) {
  const fields = buildOfficialSaveFields(values, ledger);
  const lines: string[] = ["<?xml version='1.0'?>"];
  for (const { cellId, value } of fields) {
    lines.push(`            <div>${cellId}=${value}${cellId}=</div>`);
  }
  lines.push("            All Rights Reserved BIR 2012.");
  const xml = lines.join('\n');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const periodStr = values.quarter ? `${values.year}Q${values.quarter}` : (values.month ? `${values.year}${String(values.month).padStart(2, '0')}` : String(values.year));
  const emailTag = (currentClient && (currentClient as any).email) ? String((currentClient as any).email) : 'capotbooks';
  a.download = `${values.tin}-${values.formType}v2018-${periodStr}#${emailTag}#.xml`;
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

// Official eBIRForms tax-rate cell map — extracted from Offline eBIRForms Package
// v7.9.6.2 xml/taxRate.xml. Each key is the official cell ID used by the form's
// tax-rate-helper.js (frm{FORM}:{FIELD}); value is divided by 100 at runtime.
export const TAX_RATE_CELLS: Record<string, { value: string; text: string }> = {
  "frm1602Q:fntSched1TaxRate1": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate2": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate3": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate4": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate5": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate6": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate7": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate8": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate9": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate10": { value: "12", text: "12%" },
  "frm1602Q:fntSched1TaxRate11": { value: "5", text: "5%" },
  "frm1602Q:fntSched1TaxRate12": { value: "20", text: "20%" },
  "frm1602Q:txtSched1TaxRate13": { value: "0.00", text: "0%" },
  "frm1602Q:txtSched1TaxRate14": { value: "0.00", text: "0%" },
  "frm1602Q:txtSched1TaxRate15": { value: "6", text: "6%" },
  "frm1603Q:Sched1:txtDivisor1": { value: "65%", text: "65%" },
  "frm1603Q:Sched1:txtTaxRate1": { value: "35%", text: "35%" },
  "frm1603Q:Sched1:txtDivisor2": { value: "75%", text: "75%" },
  "frm1603Q:Sched1:txtTaxRate2": { value: "25%", text: "25%" },
  "frm1621:txtTaxRate": { value: "6.0%", text: "6.0%" },
  "frm1702EX:txtPg2Pt4I40TaxRate": { value: "0", text: "0" },
  "frm1702RT:Pg2Pt4I40IncomeTaxRate": { value: "30%", text: "0" },
  "frm1702q:Sched1:txtTax10A": { value: "10.00", text: "0.00" },
  "frm1707Av2021:txtI16ApplicableTaxRate": { value: "15", text: "15" },
  "taxClassIndiv": { value: "", text: "15%" },
  "taxClassCorpDomestic": { value: "", text: "15%" },
  "taxClassCorpForeign": { value: "", text: "15%" },
  "appDonorsTaxRate": { value: "0.06", text: "                          6%" },
  "lessExemptGift": { value: "250000", text: "                   250,000.00" },
  "frm1801v2018:txtTaxRate": { value: "0.06", text: "" },
  "frm2200Av2020:txtSched1_1A_2020_ATR": { value: "0.20", text: "20%" },
  "frm2200Av2020:txtSched1_1A_2020B_ATR": { value: "0.21", text: "21%" },
  "frm2200Av2020:txtSched1_1A_2021_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2021_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2021_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2021_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1B_2020_ATR": { value: "24.34", text: "24.34" },
  "frm2200Av2020:txtSched1_1B_2020B_ATR": { value: "42.00", text: "42.00" },
  "frm2200Av2020:txtSched1_1B_2021_ATR": { value: "47.00", text: "47.00" },
  "frm2200Av2020:txtSched1_1B_2022_ATR": { value: "52.00", text: "52.00" },
  "frm2200Av2020:txtSched1_1B_2023_ATR": { value: "59.00", text: "59.00" },
  "frm2200Av2020:txtSched1_1B_2024_ATR": { value: "66.00", text: "66.00" },
  "frm2200Av2020:txtSched1_2A_2020_ATR": { value: "328.98", text: "328.98" },
  "frm2200Av2020:txtSched1_2A_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2A_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2A_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2A_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2A_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2A_2020A_ATR": { value: "921.15", text: "921.15" },
  "frm2200Av2020:txtSched1_2A_2020B2_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2A_2021B_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2A_2022B_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2A_2023B_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2A_2024B_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2B_2020_ATR": { value: "39.48", text: "39.48" },
  "frm2200Av2020:txtSched1_2B_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2B_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2B_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2B_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2B_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2C_2020_ATR": { value: "78.96", text: "78.96" },
  "frm2200Av2020:txtSched1_2C_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2C_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2C_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2C_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2C_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2D_2020_ATR": { value: "0.0", text: "Taxed as distilled spirits" },
  "frm2200Av2020:txtSched1_2D_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2D_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2D_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2D_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2D_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_3A_2020_ATR": { value: "26.43", text: "26.43" },
  "frm2200Av2020:txtSched1_3A_2020B_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3A_2021_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3A_2022_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3A_2023_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3A_2024_ATR": { value: "43.00", text: "43.00" },
  "frm2200Av2020:txtSched1_3A_2020A_ATR": { value: "26.43", text: "26.43" },
  "frm2200Av2020:txtSched1_3B_2020B2_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3A_2021B_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3A_2022B_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3A_2023B_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3A_2024B_ATR": { value: "43.00", text: "43.00" },
  "frm2200Av2020:txtSched1_3B_2020_ATR": { value: "36.85", text: "36.85" },
  "frm2200Av2020:txtSched1_3B_2020B_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3B_2021_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3B_2022_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3B_2023_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3B_2024_ATR": { value: "43.00", text: "43.00" },
  "exciseTaxColumnH": { value: "0.05", text: "5%" },
  "vatColumnI": { value: "0.12", text: "12%" },
  "frm2550ds:vatRate": { value: "12.00%", text: "" },
  "frm2550qv2024:hiddenVatRate": { value: "12.0", text: "" },
};
