// BIR form PDF export + validation (Run 013 / T013). Generates a printable
// summary PDF for the active BIR form (2550Q / 1701Q / 2551Q / 1601-C / 0619-E / 1601-EQ)
// from compiled ledger data, and validates required fields before submission.
import { jsPDF } from 'jspdf';

export interface BirCompiledData {
  salesTotal: number;
  purchasesTotal: number;
  vatPurchasesTotal: number;
  purchasesInputTax: number;
  expensesTotal: number;
  monthlyEwtTotal: number;
  ewtMonth1: number;
  ewtMonth2: number;
  ewtMonth3: number;
  quarterlyAtcList: Array<{ atcCode: string; description: string; baseAmount: number; rate: number; taxWithheld: number }>;
  quarterlyTotalTaxesWithheld: number;
}

const money = (n: number) => `₱${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Validate the active form. Returns list of human-readable error strings (empty = valid). */
export function validateBirForm(
  formType: string,
  data: BirCompiledData,
  profile?: { tin?: string; rdoCode?: string; name?: string; registeredName?: string },
): string[] {
  const errors: string[] = [];
  const tin = String(profile?.tin || '').replace(/[^0-9]/g, '');
  if (tin.length !== 9 && tin.length !== 12) errors.push('TIN is missing or invalid (must be 9 or 12 digits).');
  if (!profile?.rdoCode) errors.push('RDO code is not set in Business Profile.');
  if (!profile?.name && !profile?.registeredName) errors.push('Business/registered name is missing.');
  if (formType === '2550Q' && data.salesTotal < 0) errors.push('2550Q: sales total cannot be negative.');
  if (['1601-C', '0619-E', '1601-EQ'].includes(formType) && (data.quarterlyTotalTaxesWithheld < 0 || data.monthlyEwtTotal < 0)) {
    errors.push(`${formType}: withholding taxes cannot be negative.`);
  }
  return errors;
}

const FORM_TITLES: Record<string, string> = {
  '2550Q': 'BIR Form 2550Q — Quarterly Value-Added Tax',
  '1701Q': 'BIR Form 1701Q — Quarterly Income Tax (Individual)',
  '2551Q': 'BIR Form 2551Q — Quarterly Percentage Tax',
  '1601-C': 'BIR Form 1601-C — Monthly Withholding on Compensation',
  '0619-E': 'BIR Form 0619-E — Monthly Remittance of Expanded Withholding Tax',
  '1601-EQ': 'BIR Form 1601-EQ — Quarterly Remittance of Expanded Withholding Tax',
};

/** Generate + download a summary PDF of the active BIR form. */
export function downloadBirFormPdf(
  formType: string,
  data: BirCompiledData,
  opts: { year: number; quarter?: number; month?: number; profile?: { name?: string; registeredName?: string; tin?: string; rdoCode?: string; address?: string } },
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 60;

  doc.setFillColor(30, 64, 175); // BIR blue
  doc.rect(0, 0, pageW, 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Republic of the Philippines · Bureau of Internal Revenue', margin, 34);
  doc.setFontSize(12); doc.setFont('helvetica', 'normal');
  doc.text(FORM_TITLES[formType] || `BIR Form ${formType}`, margin, 54);
  const period = opts.quarter ? `Q${opts.quarter} ${opts.year}` : `${opts.month}/${opts.year}`;
  doc.text(`Period: ${period}`, pageW - margin, 54, { align: 'right' });

  y = 110;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('TAXPAYER INFORMATION', margin, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Name: ${opts.profile?.name || opts.profile?.registeredName || '(not set)'}`, margin, y); y += 14;
  doc.text(`TIN: ${opts.profile?.tin || '(not set)'}     RDO: ${opts.profile?.rdoCode || '(not set)'}`, margin, y); y += 14;
  if (opts.profile?.address) { doc.text(`Address: ${opts.profile.address}`, margin, y, { maxWidth: pageW - margin * 2 }); y += 14; }
  y += 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('COMPUTED VALUES (from ledger)', margin, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const rows: Array<[string, number]> = [
    ['Total Sales / Receipts', data.salesTotal],
    ['Total Purchases', data.purchasesTotal],
    ['VATable Purchases', data.vatPurchasesTotal],
    ['Input Tax (purchases)', data.purchasesInputTax],
    ['Total Expenses', data.expensesTotal],
  ];
  if (['1601-C', '0619-E', '1601-EQ'].includes(formType)) {
    rows.push(['Monthly EWT remitted', data.monthlyEwtTotal]);
    rows.push(['Total taxes withheld (quarter)', data.quarterlyTotalTaxesWithheld]);
  }
  for (const [label, val] of rows) {
    doc.text(label, margin, y);
    doc.text(money(val), pageW - margin, y, { align: 'right' });
    y += 16;
  }
  if (formType === '2550Q') {
    const outputTax = data.salesTotal * 0.12;
    const vatPayable = Math.max(0, outputTax - data.purchasesInputTax);
    y += 6;
    doc.setDrawColor(203, 213, 225); doc.line(margin, y, pageW - margin, y); y += 14;
    doc.setFont('helvetica', 'bold');
    doc.text('Output VAT (12%)', margin, y); doc.text(money(outputTax), pageW - margin, y, { align: 'right' }); y += 16;
    doc.text('VAT Payable / (Overpayment)', margin, y); doc.text(money(vatPayable), pageW - margin, y, { align: 'right' }); y += 16;
  }

  if (data.quarterlyAtcList.length > 0) {
    y += 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('ATC SCHEDULE (EWT)', margin, y); y += 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const atc of data.quarterlyAtcList.slice(0, 12)) {
      doc.text(`${atc.atcCode}  ${atc.description}`, margin, y);
      doc.text(money(atc.taxWithheld), pageW - margin, y, { align: 'right' });
      y += 14;
      if (y > 720) { doc.addPage(); y = 60; }
    }
  }

  y = Math.max(y + 30, 740);
  doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text('Generated by CAPOT Books — for reference; verify against eFPS before filing.', margin, y);
  doc.save(`bir-${formType.toLowerCase()}-${opts.year}${opts.quarter ? '-q' + opts.quarter : '-m' + (opts.month || 0)}.pdf`);
}
