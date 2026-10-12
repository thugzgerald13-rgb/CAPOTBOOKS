/**
 * Stage 6: Payroll Calculation Engine & Variable Inputs
 * Implements Sheet 16 (Payroll Input) and Sheet 17 (Payroll Calculation)
 */

import { EmployeeRecord, FICTIONAL_EMPLOYEES } from './employeeDatabase';
import { PayrollPeriodRecord, PAYROLL_PERIODS_2025 } from './payrollPeriodsData';
import { computeSssContribution, computePhilHealthContribution, computePagIbigContribution, computeBirWithholdingTax } from './statutoryRules';

export interface PayrollInputRecord {
  inputId: string;
  payrollId: string;
  employeeId: string;
  employeeName: string;
  taxableAllowances: number;
  nonTaxableAllowances: number; // De minimis (e.g. Rice Subsidy ₱2,000 / Laundry)
  commissions: number;
  incentivesBonus: number;
  retroactivePay: number;
  otherTaxableEarnings: number;
  otherNonTaxableEarnings: number;
  manualDeductionAmount: number;
  manualDeductionReason: string;
  preparedBy: string;
}

export interface PayrollCalculationRecord {
  calcId: string; // Composite: Payroll_ID & Employee_ID
  payrollId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  payType: 'Monthly' | 'Daily' | 'Hourly';
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  isMwe: boolean;

  // Attendance & Timekeeping Summary for Period
  daysWorked: number;
  basicPay: number;
  absenceDeduction: number;
  lateDeduction: number;
  undertimeDeduction: number;
  regularPay: number;

  // Premiums & Overtime
  overtimeHours: number;
  overtimePay: number;
  nightDiffHours: number;
  nightDiffPay: number;
  restDayHours: number;
  restDayPay: number;
  holidayPay: number;
  paidLeaveHours: number;
  paidLeavePay: number;

  // Variable Inputs
  taxableEarningsInput: number;
  nonTaxableEarningsInput: number;

  // Gross Earnings
  grossPay: number;

  // Statutory Employee Deductions
  sssEe: number;
  philHealthEe: number;
  pagIbigEe: number;
  totalStatutoryEe: number;

  // Withholding Tax
  taxableCompensation: number;
  withholdingTax: number;

  // Non-statutory Deductions
  loanDeductions: number;
  cashAdvanceDeductions: number;
  otherDeductions: number;
  totalDeductions: number;

  // Net Take-Home Pay
  netPay: number;

  // Employer Contributions
  sssEr: number;
  sssEc: number;
  philHealthEr: number;
  pagIbigEr: number;
  totalEmployerCost: number;

  // Audit status
  crossFootingBalanced: boolean;
  warnings?: string[];
}

export const FICTIONAL_PAYROLL_INPUTS_OCT_P1: PayrollInputRecord[] = [
  {
    inputId: 'INP-2025-10-001',
    payrollId: 'PR-2025-10-P1',
    employeeId: 'EMP-2025-0001',
    employeeName: 'Dela Cruz, Juan P.',
    taxableAllowances: 5000.00, // Executive Representation
    nonTaxableAllowances: 1000.00, // Rice Subsidy (Semi-Monthly share of ₱2,000 cap)
    commissions: 0,
    incentivesBonus: 0,
    retroactivePay: 0,
    otherTaxableEarnings: 0,
    otherNonTaxableEarnings: 0,
    manualDeductionAmount: 0,
    manualDeductionReason: '',
    preparedBy: 'payroll.specialist@cassiopeia-andromeda.ph'
  },
  {
    inputId: 'INP-2025-10-002',
    payrollId: 'PR-2025-10-P1',
    employeeId: 'EMP-2025-0004',
    employeeName: 'Bautista, Elena S.',
    taxableAllowances: 2500.00, // Tech / Project Lead Allowance
    nonTaxableAllowances: 1000.00,
    commissions: 0,
    incentivesBonus: 5000.00, // Architecture Sprint Milestone Bonus
    retroactivePay: 0,
    otherTaxableEarnings: 0,
    otherNonTaxableEarnings: 0,
    manualDeductionAmount: 0,
    manualDeductionReason: '',
    preparedBy: 'payroll.specialist@cassiopeia-andromeda.ph'
  },
  {
    inputId: 'INP-2025-10-003',
    payrollId: 'PR-2025-10-P1',
    employeeId: 'EMP-2025-0009',
    employeeName: 'Lim, Patricia A.',
    taxableAllowances: 1500.00,
    nonTaxableAllowances: 1000.00,
    commissions: 8500.00, // Q3 Enterprise Sales Commission (Taxable)
    incentivesBonus: 0,
    retroactivePay: 0,
    otherTaxableEarnings: 0,
    otherNonTaxableEarnings: 0,
    manualDeductionAmount: 0,
    manualDeductionReason: '',
    preparedBy: 'payroll.specialist@cassiopeia-andromeda.ph'
  },
  {
    inputId: 'INP-2025-10-004',
    payrollId: 'PR-2025-10-P1',
    employeeId: 'EMP-2025-0006',
    employeeName: 'Mendoza, Danilo B.',
    taxableAllowances: 0,
    nonTaxableAllowances: 1000.00, // Uniform/Laundry De Minimis
    commissions: 0,
    incentivesBonus: 1200.00, // Zero-Defect Production Incentive
    retroactivePay: 0,
    otherTaxableEarnings: 0,
    otherNonTaxableEarnings: 0,
    manualDeductionAmount: 350.00, // Lost ID card badge replacement
    manualDeductionReason: 'Lost RFID badge replacement fee',
    preparedBy: 'payroll.specialist@cassiopeia-andromeda.ph'
  },
  {
    inputId: 'INP-2025-10-005',
    payrollId: 'PR-2025-10-P1',
    employeeId: 'EMP-2025-0011',
    employeeName: 'Aquino, Kevin R.',
    taxableAllowances: 0,
    nonTaxableAllowances: 1000.00, // Rice Subsidy (Semi-Monthly)
    commissions: 0,
    incentivesBonus: 500.00, // Safety compliance bonus
    retroactivePay: 0,
    otherTaxableEarnings: 0,
    otherNonTaxableEarnings: 0,
    manualDeductionAmount: 0,
    manualDeductionReason: '',
    preparedBy: 'payroll.specialist@cassiopeia-andromeda.ph'
  }
];

export function computePayrollRow(
  period: PayrollPeriodRecord,
  emp: EmployeeRecord,
  input?: PayrollInputRecord
): PayrollCalculationRecord {
  const isMonthlyPaid = emp.payType === 'Monthly';
  const monthlyRate = emp.monthlySalary;
  const dailyRate = isMonthlyPaid ? Math.round((monthlyRate * 12 / 261) * 100) / 100 : monthlyRate;
  const hourlyRate = Math.round((dailyRate / 8) * 100) / 100;
  const isMwe = emp.position === 'Warehouse Assistant' || dailyRate <= 645;

  // Base Pay for cut-off (11 working days in Oct 1st Half)
  const scheduledDays = period.totalWorkingDays;
  const basicPay = isMonthlyPaid ? Math.round((monthlyRate / 2) * 100) / 100 : Math.round(dailyRate * scheduledDays * 100) / 100;

  // Simulated Timekeeping Deductions based on Employee Grade
  let absenceDays = 0;
  let lateMinutes = 0;
  let undertimeMinutes = 0;
  let otHours = 0;
  let ndHours = 0;
  let paidLeaveHours = 0;

  if (emp.employeeId === 'EMP-2025-0006') {
    // Machine Operator with 1 absence, 3.5h OT, and 8h Night Shift
    absenceDays = 0;
    lateMinutes = 18;
    otHours = 3.5;
    ndHours = 7.0;
  } else if (emp.employeeId === 'EMP-2025-0008') {
    // QA Inspector with 1 unpaid absence day
    absenceDays = 1.0;
    lateMinutes = 35;
  } else if (emp.employeeId === 'EMP-2025-0010') {
    // UI Designer with 8h approved Sick Leave
    paidLeaveHours = 8.0;
  } else if (emp.employeeId === 'EMP-2025-0011') {
    // Warehouse Assistant with 2h OT
    otHours = 2.0;
  }

  const daysWorked = scheduledDays - absenceDays;
  const absenceDeduction = Math.round(dailyRate * absenceDays * 100) / 100;
  const lateDeduction = Math.round((hourlyRate / 60) * lateMinutes * 100) / 100;
  const undertimeDeduction = Math.round((hourlyRate / 60) * undertimeMinutes * 100) / 100;
  const regularPay = Math.max(0, Math.round((basicPay - absenceDeduction - lateDeduction - undertimeDeduction) * 100) / 100);

  // Overtime, Night Differential, Leave
  const overtimePay = Math.round(otHours * hourlyRate * 1.25 * 100) / 100;
  const nightDiffPay = Math.round(ndHours * hourlyRate * 0.10 * 100) / 100;
  const restDayPay = 0;
  const holidayPay = 0;
  const paidLeavePay = Math.round((paidLeaveHours / 8) * dailyRate * 100) / 100;

  // Variable inputs
  const taxableEarningsInput = input ? (input.taxableAllowances + input.commissions + input.incentivesBonus + input.retroactivePay + input.otherTaxableEarnings) : 0;
  const nonTaxableEarningsInput = input ? (input.nonTaxableAllowances + input.otherNonTaxableEarnings) : 1000.00; // Standard ₱1K semi-monthly rice subsidy

  // Gross Pay
  const grossPay = Math.round((regularPay + overtimePay + nightDiffPay + restDayPay + holidayPay + paidLeavePay + taxableEarningsInput + nonTaxableEarningsInput) * 100) / 100;

  // Statutory Deductions (Evaluated against period deduction flags)
  const fullSss = computeSssContribution(monthlyRate);
  const fullPhic = computePhilHealthContribution(monthlyRate);
  const fullHdmf = computePagIbigContribution(monthlyRate);

  // Policy A: If period.deductSss is false (1st half), deduction = ₱0.00; if true (2nd half), deduction = 100% of monthly
  const sssEe = period.deductSss ? fullSss.totalEe : 0;
  const philHealthEe = period.deductPhilHealth ? fullPhic.eeShare : 0;
  const pagIbigEe = period.deductPagIbig ? fullHdmf.eeShare : 0;
  const totalStatutoryEe = Math.round((sssEe + philHealthEe + pagIbigEe) * 100) / 100;

  // Taxable Compensation
  const taxableCompensation = Math.max(0, Math.round((grossPay - nonTaxableEarningsInput - totalStatutoryEe) * 100) / 100);

  // Withholding Tax under TRAIN Law
  const taxResult = computeBirWithholdingTax(taxableCompensation, 'Semi-Monthly', isMwe);
  const withholdingTax = taxResult.computedTax;

  // Non-statutory deductions
  let loanDeductions = 0;
  let cashAdvanceDeductions = 0;
  let otherDeductions = input ? input.manualDeductionAmount : 0;

  if (emp.employeeId === 'EMP-2025-0005') loanDeductions = 1250.00; // SSS Salary Loan amortization
  if (emp.employeeId === 'EMP-2025-0009') cashAdvanceDeductions = 1500.00; // Emergency Cash Advance
  if (emp.employeeId === 'EMP-2025-0003') otherDeductions += 450.00; // HMO Dependent

  const totalDeductions = Math.round((totalStatutoryEe + withholdingTax + loanDeductions + cashAdvanceDeductions + otherDeductions) * 100) / 100;
  const netPay = Math.max(0, Math.round((grossPay - totalDeductions) * 100) / 100);

  // Employer Contributions
  const sssEr = period.deductSss ? fullSss.totalEr - fullSss.ecEr : 0;
  const sssEc = period.deductSss ? fullSss.ecEr : 0;
  const philHealthEr = period.deductPhilHealth ? fullPhic.erShare : 0;
  const pagIbigEr = period.deductPagIbig ? fullHdmf.erShare : 0;
  const totalEmployerCost = Math.round((grossPay + sssEr + sssEc + philHealthEr + pagIbigEr) * 100) / 100;

  // Cross footing audit: Gross - Total Deductions == Net Pay
  const crossFootingBalanced = Math.abs(netPay - (grossPay - totalDeductions)) < 0.01;

  return {
    calcId: `${period.payrollId}-${emp.employeeId}`,
    payrollId: period.payrollId,
    employeeId: emp.employeeId,
    employeeName: emp.fullName,
    department: emp.department,
    payType: emp.payType,
    monthlyRate,
    dailyRate,
    hourlyRate,
    isMwe,
    daysWorked,
    basicPay,
    absenceDeduction,
    lateDeduction,
    undertimeDeduction,
    regularPay,
    overtimeHours: otHours,
    overtimePay,
    nightDiffHours: ndHours,
    nightDiffPay,
    restDayHours: 0,
    restDayPay,
    holidayPay,
    paidLeaveHours,
    paidLeavePay,
    taxableEarningsInput,
    nonTaxableEarningsInput,
    grossPay,
    sssEe,
    philHealthEe,
    pagIbigEe,
    totalStatutoryEe,
    taxableCompensation,
    withholdingTax,
    loanDeductions,
    cashAdvanceDeductions,
    otherDeductions,
    totalDeductions,
    netPay,
    sssEr,
    sssEc,
    philHealthEr,
    pagIbigEr,
    totalEmployerCost,
    crossFootingBalanced,
  };
}

export function generatePayrollCalculationBatch(period: PayrollPeriodRecord): PayrollCalculationRecord[] {
  return FICTIONAL_EMPLOYEES.map((emp) => {
    const input = FICTIONAL_PAYROLL_INPUTS_OCT_P1.find((i) => i.employeeId === emp.employeeId);
    return computePayrollRow(period, emp, input);
  });
}
