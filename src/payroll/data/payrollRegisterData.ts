/**
 * Stage 7: Payroll Register, Summary, Approval & Payslip Generation
 * Implements Sheet 18 (Payroll Register), Sheet 19 (Payroll Summary), and Sheet 20 (Payroll Approval)
 */

import { FICTIONAL_EMPLOYEES, FICTIONAL_BANK_DETAILS, FICTIONAL_GOVERNMENT_IDS } from './employeeDatabase';
import { PAYROLL_PERIODS_2025, PayrollPeriodRecord } from './payrollPeriodsData';
import {
  PayrollCalculationRecord,
  generatePayrollCalculationBatch
} from './payrollCalculationData';

export interface PayrollRegisterRecord {
  registerId: string; // REG-{Payroll_ID}-{Employee_ID}
  payrollId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  basicPay: number;
  otPay: number;
  holidayPay: number;
  nightDiffPay: number;
  allowancesGross: number;
  grossPay: number;
  sssEe: number;
  philHealthEe: number;
  pagIbigEe: number;
  withholdingTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  totalEmployerCost: number;
  lockedTimestamp: string;
}

export interface PayrollDepartmentSummaryRecord {
  payrollId: string;
  department: string;
  headcount: number;
  totalBasicPay: number;
  totalOtPay: number;
  totalGrossPay: number;
  totalEmployeeStatutory: number;
  totalWithholdingTax: number;
  totalOtherDeductions: number;
  totalNetPay: number;
  totalEmployerStatutory: number;
  totalDepartmentExpense: number;
}

export interface PayrollApprovalRecord {
  approvalId: string; // APP-{Payroll_ID}
  payrollId: string;
  grossPayrollAmount: number;
  netDisbursementAmount: number;
  preparerName: string;
  preparationDate: string;
  hrCheckerName: string;
  hrCheckDate: string;
  financeApproverName: string;
  financeApprovalDate: string;
  approvalDecision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_CORRECTION' | 'PENDING_APPROVAL';
  authorizationToken: string;
}

export interface EmployeePayslipData {
  companyName: string;
  companyAddress: string;
  companyTin: string;
  payrollId: string;
  periodName: string;
  cutoffRange: string;
  payDate: string;
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  tin: string;
  sssNumber: string;
  philHealthNumber: string;
  pagIbigNumber: string;
  bankName: string;
  bankAccountNumber: string;
  payType: string;
  monthlySalary: number;
  dailyRate: number;
  hourlyRate: number;
  isMwe: boolean;

  // Timekeeping items
  daysWorked: number;
  absenceDays: number;
  absenceDeduction: number;
  lateMinutes: number;
  lateDeduction: number;
  undertimeMinutes: number;
  undertimeDeduction: number;

  // Earnings items
  basicPay: number;
  regularPay: number;
  overtimeHours: number;
  overtimePay: number;
  nightDiffHours: number;
  nightDiffPay: number;
  holidayPay: number;
  paidLeavePay: number;
  taxableAllowances: number;
  nonTaxableRiceSubsidy: number;
  bonusesCommissions: number;
  grossPay: number;

  // Deductions items
  sssEe: number;
  philHealthEe: number;
  pagIbigEe: number;
  totalStatutoryEe: number;
  taxableCompensation: number;
  withholdingTax: number;
  loanDeductions: number;
  cashAdvanceDeductions: number;
  otherDeductions: number;
  totalDeductions: number;

  // Final Net
  netPay: number;

  // Employer Counterparts (Transparency)
  sssEr: number;
  sssEc: number;
  philHealthEr: number;
  pagIbigEr: number;
  totalEmployerCost: number;
}

/**
 * Converts a calculated payroll batch into finalized Payroll Register records (Sheet 18)
 */
export function convertCalcToRegister(
  calcBatch: PayrollCalculationRecord[],
  lockedTimestamp?: string
): PayrollRegisterRecord[] {
  const ts = lockedTimestamp || new Date().toISOString();
  return calcBatch.map((c) => ({
    registerId: `REG-${c.payrollId}-${c.employeeId}`,
    payrollId: c.payrollId,
    employeeId: c.employeeId,
    employeeName: c.employeeName,
    department: c.department,
    basicPay: c.basicPay,
    otPay: c.overtimePay,
    holidayPay: c.holidayPay,
    nightDiffPay: c.nightDiffPay,
    allowancesGross: Math.round((c.taxableEarningsInput + c.nonTaxableEarningsInput) * 100) / 100,
    grossPay: c.grossPay,
    sssEe: c.sssEe,
    philHealthEe: c.philHealthEe,
    pagIbigEe: c.pagIbigEe,
    withholdingTax: c.withholdingTax,
    otherDeductions: Math.round((c.loanDeductions + c.cashAdvanceDeductions + c.otherDeductions) * 100) / 100,
    totalDeductions: c.totalDeductions,
    netPay: c.netPay,
    employerContributions: Math.round((c.sssEr + c.sssEc + c.philHealthEr + c.pagIbigEr) * 100) / 100,
    totalEmployerCost: c.totalEmployerCost,
    lockedTimestamp: ts
  }));
}

/**
 * Aggregates Register records into Departmental Summary records (Sheet 19)
 */
export function generateDepartmentSummaries(
  registerRows: PayrollRegisterRecord[]
): PayrollDepartmentSummaryRecord[] {
  const deptMap: { [dept: string]: PayrollDepartmentSummaryRecord } = {};

  registerRows.forEach((r) => {
    if (!deptMap[r.department]) {
      deptMap[r.department] = {
        payrollId: r.payrollId,
        department: r.department,
        headcount: 0,
        totalBasicPay: 0,
        totalOtPay: 0,
        totalGrossPay: 0,
        totalEmployeeStatutory: 0,
        totalWithholdingTax: 0,
        totalOtherDeductions: 0,
        totalNetPay: 0,
        totalEmployerStatutory: 0,
        totalDepartmentExpense: 0,
      };
    }
    const d = deptMap[r.department];
    d.headcount += 1;
    d.totalBasicPay = Math.round((d.totalBasicPay + r.basicPay) * 100) / 100;
    d.totalOtPay = Math.round((d.totalOtPay + r.otPay) * 100) / 100;
    d.totalGrossPay = Math.round((d.totalGrossPay + r.grossPay) * 100) / 100;
    d.totalEmployeeStatutory = Math.round((d.totalEmployeeStatutory + r.sssEe + r.philHealthEe + r.pagIbigEe) * 100) / 100;
    d.totalWithholdingTax = Math.round((d.totalWithholdingTax + r.withholdingTax) * 100) / 100;
    d.totalOtherDeductions = Math.round((d.totalOtherDeductions + r.otherDeductions) * 100) / 100;
    d.totalNetPay = Math.round((d.totalNetPay + r.netPay) * 100) / 100;
    d.totalEmployerStatutory = Math.round((d.totalEmployerStatutory + r.employerContributions) * 100) / 100;
    d.totalDepartmentExpense = Math.round((d.totalDepartmentExpense + r.totalEmployerCost) * 100) / 100;
  });

  return Object.values(deptMap).sort((a, b) => b.totalGrossPay - a.totalGrossPay);
}

/**
 * Builds printable payslip data for any single employee
 */
export function buildEmployeePayslip(
  calc: PayrollCalculationRecord,
  period: PayrollPeriodRecord
): EmployeePayslipData {
  const emp = FICTIONAL_EMPLOYEES.find((e) => e.employeeId === calc.employeeId);
  const bank = FICTIONAL_BANK_DETAILS.find((b) => b.employeeId === calc.employeeId);
  const gov = FICTIONAL_GOVERNMENT_IDS.find((g) => g.employeeId === calc.employeeId);

  return {
    companyName: 'Cassiopeia & Andromeda Philippines Inc.',
    companyAddress: 'Unit 2801, One Global Place, 5th Avenue, Bonifacio Global City, Taguig, 1634 Metro Manila',
    companyTin: '009-881-423-000',
    payrollId: period.payrollId,
    periodName: period.periodName,
    cutoffRange: `${period.cutoffStartDate} to ${period.cutoffEndDate}`,
    payDate: period.payDate,
    employeeId: calc.employeeId,
    employeeName: calc.employeeName,
    position: emp?.position || 'Staff',
    department: calc.department,
    tin: gov?.tin || '000-000-000-000',
    sssNumber: gov?.sssNumber || '00-0000000-0',
    philHealthNumber: gov?.philHealthNumber || '00-000000000-0',
    pagIbigNumber: gov?.pagIbigNumber || '0000-0000-0000',
    bankName: bank?.bankName || 'BDO Unibank',
    bankAccountNumber: bank?.accountNumber || '••••••••1234',
    payType: calc.payType,
    monthlySalary: calc.monthlyRate,
    dailyRate: calc.dailyRate,
    hourlyRate: calc.hourlyRate,
    isMwe: calc.isMwe,

    daysWorked: calc.daysWorked,
    absenceDays: calc.basicPay > 0 && calc.dailyRate > 0 ? Math.round((calc.absenceDeduction / calc.dailyRate) * 10) / 10 : 0,
    absenceDeduction: calc.absenceDeduction,
    lateMinutes: calc.hourlyRate > 0 ? Math.round((calc.lateDeduction / (calc.hourlyRate / 60))) : 0,
    lateDeduction: calc.lateDeduction,
    undertimeMinutes: 0,
    undertimeDeduction: calc.undertimeDeduction,

    basicPay: calc.basicPay,
    regularPay: calc.regularPay,
    overtimeHours: calc.overtimeHours,
    overtimePay: calc.overtimePay,
    nightDiffHours: calc.nightDiffHours,
    nightDiffPay: calc.nightDiffPay,
    holidayPay: calc.holidayPay,
    paidLeavePay: calc.paidLeavePay,
    taxableAllowances: calc.taxableEarningsInput,
    nonTaxableRiceSubsidy: calc.nonTaxableEarningsInput,
    bonusesCommissions: 0,
    grossPay: calc.grossPay,

    sssEe: calc.sssEe,
    philHealthEe: calc.philHealthEe,
    pagIbigEe: calc.pagIbigEe,
    totalStatutoryEe: calc.totalStatutoryEe,
    taxableCompensation: calc.taxableCompensation,
    withholdingTax: calc.withholdingTax,
    loanDeductions: calc.loanDeductions,
    cashAdvanceDeductions: calc.cashAdvanceDeductions,
    otherDeductions: calc.otherDeductions,
    totalDeductions: calc.totalDeductions,

    netPay: calc.netPay,

    sssEr: calc.sssEr,
    sssEc: calc.sssEc,
    philHealthEr: calc.philHealthEr,
    pagIbigEr: calc.pagIbigEr,
    totalEmployerCost: calc.totalEmployerCost,
  };
}

// -------------------------------------------------------------
// SEED DATA FOR STAGE 7: HISTORICAL LOCKED ARCHIVE & CURRENT CANDIDATE
// -------------------------------------------------------------

// Historical locked September 2nd Half (PR-2025-09-P2)
const sepP2Period = PAYROLL_PERIODS_2025[17];
const sepCalcBatch = generatePayrollCalculationBatch(sepP2Period);
export const HISTORICAL_REGISTER_SEP_P2: PayrollRegisterRecord[] = convertCalcToRegister(
  sepCalcBatch,
  '2025-10-04T18:00:00.000Z'
);

export const HISTORICAL_SUMMARY_SEP_P2: PayrollDepartmentSummaryRecord[] = generateDepartmentSummaries(
  HISTORICAL_REGISTER_SEP_P2
);

export const HISTORICAL_APPROVAL_SEP_P2: PayrollApprovalRecord = {
  approvalId: 'APP-PR-2025-09-P2',
  payrollId: 'PR-2025-09-P2',
  grossPayrollAmount: HISTORICAL_REGISTER_SEP_P2.reduce((s, r) => s + r.grossPay, 0),
  netDisbursementAmount: HISTORICAL_REGISTER_SEP_P2.reduce((s, r) => s + r.netPay, 0),
  preparerName: 'Maria Santos (Payroll Specialist)',
  preparationDate: '2025-10-02',
  hrCheckerName: 'Ramon Castillo (HR Director)',
  hrCheckDate: '2025-10-03',
  financeApproverName: 'Antonio Luna (Chief Financial Officer)',
  financeApprovalDate: '2025-10-04',
  approvalDecision: 'APPROVED',
  authorizationToken: 'AUTH-SHA256-8F7E4D3C2B1A90E5F6789ABCDEF0123456789012345678901234567890ABCDEF'
};

// Current Active October 1st Half (PR-2025-10-P1)
const octP1Period = PAYROLL_PERIODS_2025[18];
const octCalcBatch = generatePayrollCalculationBatch(octP1Period);
export const CURRENT_REGISTER_OCT_P1: PayrollRegisterRecord[] = convertCalcToRegister(octCalcBatch);
export const CURRENT_SUMMARY_OCT_P1: PayrollDepartmentSummaryRecord[] = generateDepartmentSummaries(CURRENT_REGISTER_OCT_P1);

export const CURRENT_APPROVAL_OCT_P1: PayrollApprovalRecord = {
  approvalId: 'APP-PR-2025-10-P1',
  payrollId: 'PR-2025-10-P1',
  grossPayrollAmount: CURRENT_REGISTER_OCT_P1.reduce((s, r) => s + r.grossPay, 0),
  netDisbursementAmount: CURRENT_REGISTER_OCT_P1.reduce((s, r) => s + r.netPay, 0),
  preparerName: 'Maria Santos (Payroll Specialist)',
  preparationDate: '2025-10-16',
  hrCheckerName: 'Ramon Castillo (HR Director)',
  hrCheckDate: '2025-10-17',
  financeApproverName: 'Antonio Luna (Chief Financial Officer)',
  financeApprovalDate: '2025-10-18',
  approvalDecision: 'APPROVED',
  authorizationToken: 'AUTH-SHA256-11A22B33C44D55E66F77A88B99C00D11E22F33A44B55C66D77E88F9900A11B22'
};
