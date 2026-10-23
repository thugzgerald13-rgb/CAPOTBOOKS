import { TaxDeadline, TaxpayerSizeTier } from '../types';

/** BIR deadlines that fall on a weekend roll to the next working day. */
export function adjustDeadlineForWeekend(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 6) {
    date.setDate(date.getDate() + 2); // Saturday -> Monday
  } else if (dayOfWeek === 0) {
    date.setDate(date.getDate() + 1); // Sunday -> Monday
  } else {
    return dateStr;
  }
  const rYear = date.getFullYear();
  const rMonth = String(date.getMonth() + 1).padStart(2, '0');
  const rDay = String(date.getDate()).padStart(2, '0');
  return `${rYear}-${rMonth}-${rDay}`;
}

export interface ComplianceStatusInfo {
  label: string;
  color: string;
  urgency: 'high' | 'medium' | 'low' | 'completed';
}

/**
 * Richer, on-time/late aware compliance labeling for a tax deadline.
 * Pending/Processing: shows urgency countdown (overdue / due today / due in N days).
 * Filed/Paid: shows whether filing and payment happened on time or late.
 */
export function getComplianceStatusInfo(deadline: TaxDeadline, today: Date = new Date()): ComplianceStatusInfo {
  const todayMid = new Date(today);
  todayMid.setHours(0, 0, 0, 0);

  const dueDate = new Date(deadline.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((dueDate.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24));

  if (deadline.status === 'Pending' || deadline.status === 'Processing') {
    const base = deadline.status === 'Processing' ? 'In Progress — ' : '';
    if (diffDays < 0) {
      return { label: `${base}OVERDUE`, color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900', urgency: 'high' };
    }
    if (diffDays === 0) {
      return { label: `${base}Due Today`, color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900', urgency: 'high' };
    }
    if (diffDays <= 7) {
      return { label: `${base}Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`, color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900', urgency: 'medium' };
    }
    return { label: `${base}Due in ${diffDays} days`, color: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700', urgency: 'low' };
  }

  // Filed or Paid — evaluate on-time/late for both filing and payment
  const isFiledOnTime = (deadline.dateFiled || todayMid.toISOString().split('T')[0]) <= deadline.dueDate;
  const isNoPayable = deadline.taxStatus === 'W/O Payable';

  if (isNoPayable) {
    return isFiledOnTime
      ? { label: 'FILED ON TIME', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900', urgency: 'completed' }
      : { label: 'FILED LATE', color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900', urgency: 'completed' };
  }

  if (deadline.status === 'Filed' && !deadline.datePaid) {
    return isFiledOnTime
      ? { label: 'FILED ON TIME (UNPAID)', color: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/30 dark:border-blue-900', urgency: 'medium' }
      : { label: 'FILED LATE (UNPAID)', color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900', urgency: 'high' };
  }

  const isPaidOnTime = deadline.datePaid ? deadline.datePaid <= deadline.dueDate : false;

  if (isFiledOnTime && isPaidOnTime) {
    return { label: 'FILED & PAID ON TIME', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900', urgency: 'completed' };
  }
  if (isFiledOnTime && !isPaidOnTime) {
    return { label: 'ON TIME, PAID LATE', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900', urgency: 'completed' };
  }
  if (!isFiledOnTime && isPaidOnTime) {
    return { label: 'FILED LATE, PAID ON TIME', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900', urgency: 'completed' };
  }
  return { label: 'FILED & PAID LATE', color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900', urgency: 'completed' };
}

/** Reference directory of common Philippine compliance filings (BIR + statutory agencies). */
export interface FormReference {
  code: string;
  description: string;
  frequency: string;
  deadlineRule: string;
}

export const complianceFormsDirectory: FormReference[] = [
  { code: '1601-C', description: 'Monthly Remittance Return of Income Taxes Withheld on Compensation', frequency: 'Monthly', deadlineRule: '10th day of the following month' },
  { code: '0619-E', description: 'Monthly Remittance Form for Creditable Income Taxes Withheld (Expanded)', frequency: 'Jan, Feb, Apr, May, Jul, Aug, Oct, Nov', deadlineRule: '10th day of the following month' },
  { code: '0619-F', description: 'Monthly Remittance Form for Final Income Taxes Withheld', frequency: 'Jan, Feb, Apr, May, Jul, Aug, Oct, Nov', deadlineRule: '10th day of the following month' },
  { code: '1601-EQ', description: 'Quarterly Remittance Return of Creditable Income Taxes Withheld', frequency: 'Quarterly', deadlineRule: 'Last day of the month following the close of the quarter' },
  { code: '2550Q', description: 'Quarterly Value-Added Tax Return', frequency: 'Quarterly', deadlineRule: '25th day of the month following the close of the quarter' },
  { code: '2551Q', description: 'Quarterly Percentage Tax Return', frequency: 'Quarterly', deadlineRule: '25th day of the month following the close of the quarter' },
  { code: '1701Q', description: 'Quarterly Income Tax Return (Individuals)', frequency: 'Quarterly', deadlineRule: '15th day of the month following the close of the quarter' },
  { code: '1702Q', description: 'Quarterly Income Tax Return (Corporations)', frequency: 'Quarterly', deadlineRule: '60 days following the close of the quarter' },
  { code: '1701', description: 'Annual Income Tax Return (Individuals)', frequency: 'Annually', deadlineRule: 'April 15 of the following year' },
  { code: '1702-RT', description: 'Annual Income Tax Return (Corporations)', frequency: 'Annually', deadlineRule: '15th day of the 4th month following the close of the taxable year' },
  { code: '1604-C', description: 'Annual Information Return of Income Taxes Withheld on Compensation', frequency: 'Annually', deadlineRule: 'January 31 of the following year' },
  { code: '1604-E', description: 'Annual Information Return of Creditable Income Taxes Withheld (Expanded)', frequency: 'Annually', deadlineRule: 'March 1 of the following year' },
  { code: '1604-F', description: 'Annual Information Return of Income Payments Subjected to Final Withholding Taxes', frequency: 'Annually', deadlineRule: 'January 31 of the following year' },
  { code: 'SSS', description: 'SSS Monthly Contributions & Loan Remittances', frequency: 'Monthly', deadlineRule: 'Last day of the month following the applicable month' },
  { code: 'Pag-IBIG/HDMF', description: 'Pag-IBIG/HDMF Monthly Remittance (Contributions & Loans)', frequency: 'Monthly', deadlineRule: '15th day of the following month' },
  { code: 'PhilHealth', description: 'PhilHealth Monthly Premium Remittance', frequency: 'Monthly', deadlineRule: '15th day of the following month' },
  { code: 'Inventory List', description: 'Annual BIR Inventory List and Schedules', frequency: 'Annually', deadlineRule: 'January 30 of the following year' },
  { code: 'Business Permit', description: "Annual LGU Business & Mayor's Permit Renewal", frequency: 'Annually', deadlineRule: 'January 20 of each year' },
];

// ---- T012: BIR penalty estimator + compliance risk score ----

export interface PenaltyEstimate { surcharge: number; interest: number; compromise: number; total: number; daysLate: number; }

/**
 * Estimate BIR penalties for an unpaid tax amount past due.
 * Supports EOPT Act (RA 11976) reduced penalties for Micro & Small taxpayers (10% surcharge, 6%/yr interest, ₱500 max compromise)
 * as well as standard BIR rates for Medium/Large taxpayers or when sizeTier is omitted.
 */
export function estimateBirPenalty(
  unpaidTax: number,
  dueDateISO: string,
  todayISO: string = new Date().toISOString().split('T')[0],
  sizeTier?: TaxpayerSizeTier
): PenaltyEstimate {
  const baseTax = Math.max(0, Number(unpaidTax) || 0);
  const daysLate = Math.max(
    0,
    Math.floor(
      (new Date(todayISO + 'T00:00:00Z').getTime() -
        new Date(dueDateISO.slice(0, 10) + 'T00:00:00Z').getTime()) /
        86400000
    )
  );
  if (daysLate <= 0 || baseTax <= 0) {
    return { surcharge: 0, interest: 0, compromise: 0, total: 0, daysLate: 0 };
  }
  const isMicroOrSmall = sizeTier === 'micro' || sizeTier === 'small';
  const surchargeRate = isMicroOrSmall ? 0.10 : 0.25;
  const interestRate = isMicroOrSmall ? 0.06 : sizeTier ? 0.12 : 0.20;
  const surcharge = baseTax * surchargeRate;
  const interest = baseTax * interestRate * (daysLate / 365);
  const compromise = isMicroOrSmall
    ? 500
    : Math.min(20000, Math.max(500, baseTax * 0.02));
  return { surcharge, interest, compromise, total: surcharge + interest + compromise, daysLate };
}

export interface RiskScore { score: number; level: 'Low' | 'Medium' | 'High'; overdue: number; pending: number; }

/** 0–100 compliance risk score from deadline statuses. Higher = lower risk. */
export function computeComplianceRiskScore(deadlines: Array<{ status?: string }>): RiskScore {
  const overdue = deadlines.filter(d => d.status === 'Overdue').length;
  const pending = deadlines.filter(d => d.status === 'Pending' || d.status === 'Processing').length;
  const filed = deadlines.filter(d => d.status === 'Filed' || d.status === 'Paid').length;
  const total = deadlines.length || 1;
  const raw = Math.round(100 * (filed / total) - 3 * overdue);
  const score = Math.max(0, Math.min(100, raw));
  const level: RiskScore['level'] = score >= 80 ? 'Low' : score >= 50 ? 'Medium' : 'High';
  return { score, level, overdue, pending };
}
