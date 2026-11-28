// Payroll-to-General-Ledger double-entry journal voucher builder.
// Bridges the Philippine Payroll sub-ledger (SSS, PhilHealth, Pag-IBIG, EC,
// Withholding Tax on Compensation) into CAPOTBOOKS General Ledger postings.

import { assertPeriodUnlocked, logAudit } from '../../lib/accessControl';

export interface PayrollGlSummaryInput {
  periodLabel: string;
  postingDate: string; // YYYY-MM-DD
  grossPay: number;
  employerSss: number;
  employerEc: number;
  employerPhilHealth: number;
  employerPagIbig: number;
  employeeSss: number;
  employeePhilHealth: number;
  employeePagIbig: number;
  withholdingTax: number;
  otherDeductions?: number;
  netPay: number;
  clientId?: string;
  actorEmail?: string;
}

export interface PayrollJournalLine {
  accountName: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface PayrollJournalVoucher {
  referenceNo: string;
  date: string;
  memo: string;
  lines: PayrollJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Builds a strictly balanced double-entry Journal Voucher for a Philippine payroll run:
 *   Dr Salaries & Wages Expense                        (Gross Pay)
 *   Dr Employer Statutory Contributions Expense        (ER SSS + EC + PhilHealth + Pag-IBIG)
 *       Cr Withholding Tax Payable — Compensation      (BIR 1601-C)
 *       Cr SSS & EC Contributions Payable              (EE SSS + ER SSS + EC)
 *       Cr PhilHealth Contributions Payable            (EE + ER PhilHealth)
 *       Cr Pag-IBIG (HDMF) Contributions Payable       (EE + ER Pag-IBIG)
 *       Cr Other Payroll Deductions Payable            (Loans / Advances, if any)
 *       Cr Salaries & Wages Payable / Cash in Bank     (Net Pay)
 */
export function buildPayrollJournalVoucher(input: PayrollGlSummaryInput): PayrollJournalVoucher {
  assertPeriodUnlocked(input.postingDate, input.clientId);

  const gross = r2(input.grossPay);
  const erSss = r2(input.employerSss);
  const erEc = r2(input.employerEc);
  const erPhic = r2(input.employerPhilHealth);
  const erHdmf = r2(input.employerPagIbig);
  const eeSss = r2(input.employeeSss);
  const eePhic = r2(input.employeePhilHealth);
  const eeHdmf = r2(input.employeePagIbig);
  const wht = r2(input.withholdingTax);
  const otherDed = r2(input.otherDeductions || 0);

  const employerContributions = r2(erSss + erEc + erPhic + erHdmf);
  const sssEcPayable = r2(eeSss + erSss + erEc);
  const phicPayable = r2(eePhic + erPhic);
  const hdmfPayable = r2(eeHdmf + erHdmf);

  // Reconcile net pay against gross minus employee deductions to eliminate 1-centavo drift
  const computedNetPay = r2(gross - eeSss - eePhic - eeHdmf - wht - otherDed);
  const netPay = Math.abs(computedNetPay - r2(input.netPay)) <= 0.05 ? computedNetPay : r2(input.netPay);

  const lines: PayrollJournalLine[] = [];
  if (gross > 0) {
    lines.push({ accountName: 'Salaries and Wages Expense', debit: gross, credit: 0, memo: input.periodLabel });
  }
  if (employerContributions > 0) {
    lines.push({
      accountName: 'SSS, PhilHealth & Pag-IBIG Expense (Employer Share)',
      debit: employerContributions,
      credit: 0,
      memo: `ER SSS/EC/PHIC/HDMF — ${input.periodLabel}`,
    });
  }
  if (wht > 0) {
    lines.push({ accountName: 'Withholding Tax Payable — Compensation (1601-C)', debit: 0, credit: wht });
  }
  if (sssEcPayable > 0) {
    lines.push({ accountName: 'SSS and EC Contributions Payable', debit: 0, credit: sssEcPayable });
  }
  if (phicPayable > 0) {
    lines.push({ accountName: 'PhilHealth Contributions Payable', debit: 0, credit: phicPayable });
  }
  if (hdmfPayable > 0) {
    lines.push({ accountName: 'Pag-IBIG (HDMF) Contributions Payable', debit: 0, credit: hdmfPayable });
  }
  if (otherDed > 0) {
    lines.push({ accountName: 'Other Payroll Deductions Payable', debit: 0, credit: otherDed });
  }
  if (netPay > 0) {
    lines.push({ accountName: 'Salaries and Wages Payable', debit: 0, credit: netPay });
  }

  const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const refNo = `JV-PAY-${String(input.postingDate).replace(/-/g, '')}`;
  const jv: PayrollJournalVoucher = {
    referenceNo: refNo,
    date: input.postingDate,
    memo: `Payroll Accrual — ${input.periodLabel}`,
    lines,
    totalDebit,
    totalCredit,
    balanced,
  };

  if (balanced && lines.length > 0) {
    logAudit({
      userEmail: input.actorEmail || 'system',
      action: 'payroll_jv_built',
      entity: 'journal_vouchers',
      entityId: refNo,
      clientId: input.clientId,
      afterData: { totalDebit, totalCredit, periodLabel: input.periodLabel },
      details: `Built balanced Payroll JV ${refNo} for ${input.periodLabel}`,
    });
  }

  return jv;
}
