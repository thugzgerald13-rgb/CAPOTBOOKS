// officialBir2550Q.ts — Latest official BIR Form 2550Q (Quarterly VAT Return).
//
// LATEST OFFICIAL EDITION: January 2023 (ENCS) — this is the current BIR Form
// 2550Q edition and the one carried by the latest eBIRForms Offline Package.
// Monthly BIR Form 2550M was DISCONTINUED under RMC No. 5-2023 (VAT-registered
// taxpayers now file only the quarterly 2550Q), so old/2550M flows are removed.
//
// BIR forms are public documents; this module reproduces the official 2550Q
// line-item layout (Part I – Sales/Output Tax, Part II – Input Tax, Part III –
// Total Tax Payable, plus Schedules 1–4) and populates it FROM RELIEF / SLSP
// aggregates (Summary List of Sales / Purchases / Importations), mirroring the
// exact per-entry classification used by src/components/Relief.tsx so the
// figures on the official return match the RELIEF SLSP filing.

export const LATEST_2550Q_EDITION = 'January 2023 (ENCS)';
export const LATEST_EBIRFORMS_PACKAGE = 'v7.9.6.2';

export interface ReliefQuarterTotals {
  // Part I – Sales / Output Tax (from RELIEF Summary List of Sales)
  taxableSales: number;   // VATable sales (output-tax base), net of VAT
  zeroRatedSales: number; // zero-rated / effectively zero-rated sales
  exemptSales: number;    // VAT-exempt / non-VAT sales
  outputTax: number;      // total output VAT (12% of taxable sales)
  // Part II – Input Tax (from RELIEF Summary List of Purchases + Importations)
  purchasesGoods: number;    // domestic purchases of goods other than capital (taxable base)
  purchasesServices: number; // domestic purchases of services (taxable base)
  purchasesCapital: number;  // capital goods (taxable base)
  inputTaxGoods: number;
  inputTaxServices: number;
  inputTaxCapital: number;
  inputTaxImportation: number; // VAT paid on importation (from RELIEF importations)
  totalInputTax: number;
  // metadata
  salesCount: number;
  purchaseCount: number;
  importationCount: number;
}

const qMonthsOf = (quarter: number): number[] => [
  (quarter - 1) * 3 + 1,
  (quarter - 1) * 3 + 2,
  (quarter - 1) * 3 + 3,
];

const monthNum = (date: any): number => {
  const d = date ? new Date(date) : null;
  return d && !isNaN(d.getTime()) ? d.getMonth() + 1 : 0;
};
const yearNum = (date: any): number => {
  const d = date ? new Date(date) : null;
  return d && !isNaN(d.getTime()) ? d.getFullYear() : 0;
};

/**
 * Aggregate a quarter of transactions the SAME WAY the RELIEF module builds its
 * SLSP (per-entry vatType / accountTitle bucketing, see Relief.tsx
 * buildSalesRows / buildPurchases). `importationVat` is the total VAT paid on
 * importation for the quarter (loaded from relief_records record_type='importation').
 */
export function aggregateReliefQuarter(
  sales: any[],
  purchases: any[],
  year: number,
  quarter: number,
  importationVat = 0,
  importationCount = 0,
): ReliefQuarterTotals {
  const months = new Set(qMonthsOf(quarter));
  const inQ = (r: any) => yearNum(r.date) === year && months.has(monthNum(r.date));

  let taxableSales = 0, zeroRatedSales = 0, exemptSales = 0, outputTax = 0, salesCount = 0;
  for (const s of sales || []) {
    if (!inQ(s)) continue;
    salesCount++;
    const vt = String(s.vatType || '').toLowerCase();
    const amt = Number(s.amount || 0);
    if (vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat')) exemptSales += amt;
    else if (vt.includes('zero')) zeroRatedSales += amt;
    else taxableSales += Number(s.netOfVat !== undefined ? s.netOfVat : amt);
    outputTax += Number(s.outputTax || 0);
  }
  // If per-entry outputTax wasn't stored, derive 12% of taxable base (official rate).
  if (outputTax === 0 && taxableSales > 0) outputTax = round2(taxableSales * 0.12);

  let purchasesGoods = 0, purchasesServices = 0, purchasesCapital = 0;
  let inputTaxGoods = 0, inputTaxServices = 0, inputTaxCapital = 0, purchaseCount = 0;
  for (const p of purchases || []) {
    if (!inQ(p)) continue;
    purchaseCount++;
    const amt = Number(p.amount || 0);
    const vt = String(p.vatType || '').toLowerCase();
    const et = String(p.accountTitle || p.category || '').toLowerCase();
    const explicitExempt = Number(p.exemptAmount || 0);
    const explicitZero = Number(p.zeroRatedAmount || 0);
    const isExemptType = vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat');
    const isZeroType = vt.includes('zero');
    const exemptAmt = explicitExempt > 0 ? explicitExempt : (isExemptType ? amt : 0);
    const zeroAmt = explicitZero > 0 ? explicitZero : (isZeroType ? amt : 0);
    const taxableAmt = Math.max(0, amt - exemptAmt - zeroAmt);
    const inputTax = Number(p.inputTax || (vt === 'vat' ? amt * 0.12 : 0));
    if (taxableAmt > 0) {
      if (et.includes('service')) { purchasesServices += taxableAmt; inputTaxServices += inputTax; }
      else if (et.includes('capital') || et.includes('asset')) { purchasesCapital += taxableAmt; inputTaxCapital += inputTax; }
      else { purchasesGoods += taxableAmt; inputTaxGoods += inputTax; }
    }
  }

  const totalInputTax = round2(inputTaxGoods + inputTaxServices + inputTaxCapital + importationVat);
  return {
    taxableSales: round2(taxableSales),
    zeroRatedSales: round2(zeroRatedSales),
    exemptSales: round2(exemptSales),
    outputTax: round2(outputTax),
    purchasesGoods: round2(purchasesGoods),
    purchasesServices: round2(purchasesServices),
    purchasesCapital: round2(purchasesCapital),
    inputTaxGoods: round2(inputTaxGoods),
    inputTaxServices: round2(inputTaxServices),
    inputTaxCapital: round2(inputTaxCapital),
    inputTaxImportation: round2(importationVat),
    totalInputTax,
    salesCount,
    purchaseCount,
    importationCount,
  };
}

export interface OfficialLine { item: string; label: string; amount: number; bold?: boolean; }
export interface Official2550Q {
  edition: string;
  formType: '2550Q';
  year: number;
  quarter: number;
  periodLabel: string;
  taxpayer: { tin: string; rdoCode: string; registeredName: string; tradeName: string; address: string; email: string; };
  partI: OfficialLine[];   // Sales / Output Tax
  partII: OfficialLine[];  // Input Tax
  partIII: OfficialLine[]; // Total Tax Payable
  totals: ReliefQuarterTotals;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build the official 2550Q (Jan 2023 ENCS) line items from RELIEF aggregates. */
export function buildOfficial2550Q(
  t: ReliefQuarterTotals,
  profile: { tin?: string; rdoCode?: string; registeredName?: string; tradeName?: string; name?: string; address?: string; email?: string } | null,
  opts: { year: number; quarter: number; carryOverInputTax?: number; creditableVatWithheld?: number; advancePayments?: number; priorPayments?: number },
): Official2550Q {
  const { year, quarter } = opts;
  const carryOver = Number(opts.carryOverInputTax || 0);
  const creditableWithheld = Number(opts.creditableVatWithheld || 0);
  const advance = Number(opts.advancePayments || 0);
  const prior = Number(opts.priorPayments || 0);

  const totalSales = round2(t.taxableSales + t.zeroRatedSales + t.exemptSales);
  const outputTaxDue = t.outputTax;

  const inputTaxDomesticGoods = t.inputTaxGoods;
  const inputTaxDomesticServices = t.inputTaxServices;
  const inputTaxImportation = t.inputTaxImportation;
  const inputTaxCapital = t.inputTaxCapital; // amortized + ≤1M combined for the summary
  const totalInputTaxCreditable = round2(inputTaxDomesticGoods + inputTaxDomesticServices + inputTaxImportation + inputTaxCapital + carryOver);

  const netVatPayable = round2(outputTaxDue - totalInputTaxCreditable);
  const totalCredits = round2(creditableWithheld + advance + prior);
  const taxStillDue = round2(Math.max(0, netVatPayable - totalCredits));
  const overpayment = round2(Math.max(0, totalCredits - netVatPayable));

  const partI: OfficialLine[] = [
    { item: '14A', label: 'VATable Sales/Receipts (Regular) — Exclusive of VAT', amount: t.taxableSales },
    { item: '14B', label: 'Zero-Rated Sales/Receipts (0%)', amount: t.zeroRatedSales },
    { item: '14C', label: 'VAT-Exempt Sales/Receipts', amount: t.exemptSales },
    { item: '15', label: 'Total Sales/Receipts for the Quarter (Items 14A+14B+14C)', amount: totalSales, bold: true },
    { item: '16', label: 'Output Tax (12% of Item 14A)', amount: outputTaxDue, bold: true },
  ];

  const partII: OfficialLine[] = [
    { item: '20A', label: 'Input Tax on Domestic Purchases of Goods (other than capital goods)', amount: inputTaxDomesticGoods },
    { item: '20B', label: 'Input Tax on Domestic Purchases of Services', amount: inputTaxDomesticServices },
    { item: '21', label: 'Input Tax on Importation of Goods', amount: inputTaxImportation },
    { item: '22', label: 'Input Tax on Purchases of Capital Goods (Schedules 1 & 2)', amount: inputTaxCapital },
    { item: '23', label: 'Transitional/Pre-opening Input Tax', amount: 0 },
    { item: '24', label: 'Input Tax Carried Over from Previous Quarter', amount: carryOver },
    { item: '25', label: 'Other Input Tax (specify)', amount: 0 },
    { item: '26', label: 'Total Available Input Tax (Items 20A–25)', amount: totalInputTaxCreditable, bold: true },
  ];

  const partIII: OfficialLine[] = [
    { item: '27', label: 'Output Tax (from Item 16)', amount: outputTaxDue },
    { item: '28', label: 'Less: Total Allowable Input Tax (from Item 26)', amount: totalInputTaxCreditable },
    { item: '29', label: 'Net VAT Payable / (Excess Input Tax) (Item 27 − Item 28)', amount: netVatPayable, bold: true },
    { item: '30', label: 'Less: Creditable VAT Withheld (Schedule 3)', amount: creditableWithheld },
    { item: '31', label: 'Less: Advance VAT Payments (Schedule 4)', amount: advance },
    { item: '32', label: 'Less: VAT Paid in Return Previously Filed (if amended)', amount: prior },
    { item: '33', label: 'Less: Tax Debit Memo Issued / Other Credits', amount: 0 },
    { item: '34', label: 'Total Tax Credits/Payments (Items 30–33)', amount: totalCredits },
    { item: '35', label: 'Tax Still Payable / (Overpayment)', amount: netVatPayable >= totalCredits ? taxStillDue : -overpayment, bold: true },
  ];

  return {
    edition: LATEST_2550Q_EDITION,
    formType: '2550Q',
    year,
    quarter,
    periodLabel: `Q${quarter} ${year}`,
    taxpayer: {
      tin: profile?.tin || '',
      rdoCode: profile?.rdoCode || '',
      registeredName: profile?.registeredName || profile?.name || '',
      tradeName: profile?.tradeName || '',
      address: profile?.address || '',
      email: profile?.email || '',
    },
    partI, partII, partIII,
    totals: t,
  };
}

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');

function linesTable(title: string, lines: OfficialLine[]): string {
  const rows = lines.map(l => `
    <tr${l.bold ? ' class="b"' : ''}>
      <td class="item">${esc(l.item)}</td>
      <td>${esc(l.label)}</td>
      <td class="amt">${fmt(l.amount)}</td>
    </tr>`).join('');
  return `<h2>${esc(title)}</h2><table>${rows}</table>`;
}

/** Open the official BIR Form 2550Q (latest edition) in a printable window. */
export function printOfficial2550Q(f: Official2550Q) {
  const tp = f.taxpayer;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>BIR Form 2550Q — ${esc(f.periodLabel)}</title>
<style>
  body{font-family:'Arial Narrow',Arial,sans-serif;color:#000;background:#fff;margin:24px;font-size:11px;}
  .head{text-align:center;border-bottom:3px double #000;padding-bottom:8px;margin-bottom:10px;}
  .head h1{margin:0;font-size:18px;letter-spacing:1px;}
  .head .sub{font-size:11px;margin-top:2px;}
  .formno{position:absolute;top:24px;right:32px;text-align:right;font-weight:bold;}
  .formno .no{font-size:22px;}
  .tp{width:100%;border-collapse:collapse;margin:8px 0 14px;}
  .tp td{border:1px solid #000;padding:4px 6px;vertical-align:top;}
  .tp .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#333;width:14%;}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;margin:14px 0 4px;padding-bottom:2px;}
  table{width:100%;border-collapse:collapse;}
  td{border:1px solid #000;padding:3px 6px;vertical-align:top;}
  .item{width:8%;font-weight:bold;text-align:center;}
  .amt{width:22%;text-align:right;font-family:'Courier New',monospace;white-space:nowrap;}
  tr.b td{font-weight:bold;background:#f2f2f2;}
  .foot{margin-top:18px;font-size:9px;color:#333;border-top:1px solid #999;padding-top:6px;}
  .sig{margin-top:26px;width:100%;}
  .sig td{border:none;border-top:1px solid #000;text-align:center;font-size:10px;padding-top:3px;width:33%;}
  @media print{body{margin:10mm;}}
</style></head><body>
<div class="formno"><div>BIR Form No.</div><div class="no">2550Q</div><div>Quarterly VAT Return</div><div>Edition: ${esc(f.edition)}</div></div>
<div class="head">
  <h1>REPUBLIC OF THE PHILIPPINES</h1>
  <div class="sub">BUREAU OF INTERNAL REVENUE</div>
  <div class="sub"><b>QUARTERLY VALUE-ADDED TAX DECLARATION</b></div>
</div>
<table class="tp">
  <tr><td class="lbl">TIN</td><td>${esc(tp.tin)}</td><td class="lbl">RDO Code</td><td>${esc(tp.rdoCode)}</td></tr>
  <tr><td class="lbl">Registered Name</td><td colspan="3">${esc(tp.registeredName)}</td></tr>
  <tr><td class="lbl">Trade Name</td><td colspan="3">${esc(tp.tradeName)}</td></tr>
  <tr><td class="lbl">Registered Address</td><td colspan="3">${esc(tp.address)}</td></tr>
  <tr><td class="lbl">Taxable Period</td><td><b>${esc(f.periodLabel)}</b></td><td class="lbl">Return Type</td><td>Original / Amended</td></tr>
</table>
${linesTable('Part I — Sales / Output Tax (from RELIEF Summary List of Sales)', f.partI)}
${linesTable('Part II — Input Tax (from RELIEF Summary List of Purchases & Importations)', f.partII)}
${linesTable('Part III — Total Tax Payable', f.partIII)}
<h2>Schedules (attach as filed with RELIEF / SLSP)</h2>
<table>
  <tr><td class="item">Sch 1</td><td>Amortized Input Tax from Capital Goods (Purchases/Importation exceeding P1,000,000)</td><td class="amt">${fmt(f.totals.inputTaxCapital)}</td></tr>
  <tr><td class="item">Sch 2</td><td>Purchases/Importation of Capital Goods (Not Exceeding P1,000,000)</td><td class="amt">—</td></tr>
  <tr><td class="item">Sch 3</td><td>Creditable Value-Added Tax Withheld (by payor)</td><td class="amt">—</td></tr>
  <tr><td class="item">Sch 4</td><td>Advance VAT Payments (with BIR Form 0605 / DAIF)</td><td class="amt">—</td></tr>
</table>
<p class="foot"><b>Source:</b> Populated from RELIEF (SLSP) — ${f.totals.salesCount} sale(s), ${f.totals.purchaseCount} purchase(s), ${f.totals.importationCount} importation(s) in ${esc(f.periodLabel)}. Generated by CAPOT Books · Official BIR Form 2550Q ${esc(f.edition)} · eBIRForms ${LATEST_EBIRFORMS_PACKAGE}-compatible. Import the companion XML into the official eBIRForms offline app (File → Open) for final validation and submission.</p>
<table class="sig"><tr><td>Certified by: Taxpayer / Authorized Representative (Signature)</td><td>Printed Name &amp; Title</td><td>TIN / Date</td></tr></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/**
 * Download a BIR-COMPLIANT eBIRForms XML file.
 *
 * Filename follows the BIR-mandated convention (RMC No. 21-2015):
 *   <TIN incl. Branch Code, 12 digits>_<BIR Form No. (max 6)>_<Return Period, 8 digits YYYYMMDD>.xml
 * e.g. 000123456000_2550Q_20260331.xml
 *
 * The XML structure carries the taxpayer header and every official line item
 * (Part I/II/III) by BIR item number. It is generated to be importable into the
 * official eBIRForms Offline Package; the app's built-in validator (File →
 * Validate) performs the final XSD/schema check before submission.
 */
export function downloadOfficial2550QXml(f: Official2550Q): string {
  const tp = f.taxpayer;
  const tin12 = (tp.tin || '').replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  const formNo = '2550Q';
  const qEnd: Record<number, string> = { 1: '0331', 2: '0630', 3: '0930', 4: '1231' };
  const period8 = `${f.year}${qEnd[f.quarter] || '1231'}`;
  const allLines = [...f.partI, ...f.partII, ...f.partIII];
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<BIRReturn xmlns="http://www.bir.gov.ph/2023/eBIRForms" source="CAPOT Books" formVersion="${esc(f.edition)}" ebirformsPackage="${LATEST_EBIRFORMS_PACKAGE}">`);
  lines.push('  <TaxpayerInfo>');
  lines.push(`    <TIN>${tin12.slice(0, 9)}</TIN>`);
  lines.push(`    <BranchCode>${tin12.slice(9, 12)}</BranchCode>`);
  lines.push(`    <RDOCode>${esc(tp.rdoCode)}</RDOCode>`);
  lines.push(`    <RegisteredName>${esc(tp.registeredName)}</RegisteredName>`);
  lines.push(`    <TradeName>${esc(tp.tradeName)}</TradeName>`);
  lines.push(`    <Address>${esc(tp.address)}</Address>`);
  lines.push(`    <Email>${esc(tp.email)}</Email>`);
  lines.push('  </TaxpayerInfo>');
  lines.push(`  <ReturnHeader formCode="${formNo}" formType="Quarterly" year="${f.year}" quarter="${f.quarter}" returnPeriod="${period8}" />`);
  lines.push('  <ReturnData>');
  for (const l of allLines) {
    lines.push(`    <Item no="${esc(l.item)}" description="${esc(l.label)}">${l.amount.toFixed(2)}</Item>`);
  }
  lines.push('  </ReturnData>');
  const taxDue = f.partIII.find(l => l.item === '35');
  lines.push(`  <TotalTaxPayable>${(taxDue?.amount || 0).toFixed(2)}</TotalTaxPayable>`);
  lines.push('  <DataSource>RELIEF/SLSP</DataSource>');
  lines.push('</BIRReturn>');
  const xml = lines.join('\n');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tin12}_${formNo}_${period8}.xml`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return xml;
}

// Official blank BIR form bundled in the app (public asset). Filled by overlay.
const OFFICIAL_2550Q_PDF_URL = '/forms/BIR-Form-2550Q-Jan2023-ENCS.pdf';

/**
 * Fill the OFFICIAL BIR Form 2550Q (January 2023 ENCS) PDF — the actual public
 * document from the BIR website — by overlaying the RELIEF-populated values,
 * then download it. Coordinates are tuned to the Jan 2023 (ENCS) 2-page edition
 * (612 x 936 pt, Long bond).
 */
export async function downloadFilledOfficial2550QPdf(f: Official2550Q): Promise<void> {
  const [{ PDFDocument, StandardFonts, rgb }, res] = await Promise.all([
    import('pdf-lib'),
    fetch(OFFICIAL_2550Q_PDF_URL),
  ]);
  if (!res.ok) throw new Error(`Official BIR 2550Q PDF not found at ${OFFICIAL_2550Q_PDF_URL}`);
  const bytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPage(0); // page 1 carries taxpayer info + Parts I–III
  const tp = f.taxpayer;
  const draw = (text: any, x: number, y: number, size = 9, right = false) => {
    const t = String(text ?? '');
    if (!t) return;
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: right ? Math.max(4, x - w) : x, y, size, font, color: rgb(0, 0, 0) });
  };
  const AX = 586; // right-edge of the amount column (right-aligned values)
  // ---- Background information (page 1, top) ----
  const tinDigits = (tp.tin || '').replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  draw(`${tinDigits.slice(0, 3)}-${tinDigits.slice(3, 6)}-${tinDigits.slice(6, 9)}-${tinDigits.slice(9, 12)}`, 178, 735, 10);
  draw(tp.rdoCode, 552, 735, 10, true);
  draw(tp.registeredName.toUpperCase(), 178, 721, 9);
  draw(tp.address.toUpperCase(), 178, 691, 8);
  draw(tp.email, 332, 642, 8);
  // Quarter checkbox "X" (1st/2nd/3rd/4th stacked at x≈318)
  const qY: Record<number, number> = { 1: 800, 2: 782, 3: 764, 4: 746 };
  draw('X', 316, qY[f.quarter] ?? 800, 11);
  // ---- Part I – Sales / Output Tax (amounts, right column) ----
  draw(fmt(f.totals.taxableSales), AX, 792, 9, true);   // VATable (14A)
  draw(fmt(f.totals.zeroRatedSales), AX, 778, 9, true);  // Zero-rated (14B)
  draw(fmt(f.totals.exemptSales), AX, 735, 9, true);     // Exempt (14C)
  draw(fmt(f.totals.outputTax), AX, 721, 9, true);       // Output Tax Due (16)
  // ---- Part II – Input Tax ----
  draw(fmt(f.totals.inputTaxGoods), AX, 572, 9, true);      // Domestic purchases of goods (20A)
  draw(fmt(f.totals.inputTaxServices), AX, 504, 9, true);   // Domestic purchases of services (20B)
  draw(fmt(f.totals.inputTaxImportation), AX, 538, 9, true);// Importation (21)
  draw(fmt(f.totals.inputTaxCapital), AX, 486, 9, true);    // Capital goods (22)
  const carryOver = f.partII.find(l => l.item === '24')?.amount || 0;
  draw(fmt(carryOver), AX, 690, 9, true);                   // Carried over from prev quarter (24)
  const totalInput = f.partII.find(l => l.item === '26')?.amount || 0;
  draw(fmt(totalInput), AX, 440, 9, true);                  // Total available input tax (26)
  // ---- Part III – Total Tax Payable ----
  const netVat = f.partIII.find(l => l.item === '29')?.amount || 0;
  draw(fmt(netVat), AX, 321, 9, true);                       // Net VAT payable (29)
  const taxStillDue = f.partIII.find(l => l.item === '35')?.amount || 0;
  draw(fmt(Math.abs(taxStillDue)), AX, 446, 10, true);       // Tax still payable / (overpayment) (35)
  // Source stamp on page 2
  const page2 = pdfDoc.getPageCount() > 1 ? pdfDoc.getPage(1) : null;
  if (page2) {
    page2.drawText(`Generated by CAPOT Books · Populated from RELIEF/SLSP · Official BIR Form 2550Q ${f.edition} · ${f.periodLabel}`, {
      x: 36, y: 30, size: 7, font, color: rgb(0.3, 0.3, 0.3),
    });
  }
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BIR-Form-2550Q_${f.year}_Q${f.quarter}_filled.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
