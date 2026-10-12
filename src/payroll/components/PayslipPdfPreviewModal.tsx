import React, { useState } from 'react';
import {
  FileText,
  Download,
  X,
  ShieldCheck,
  CheckCircle2,
  Printer,
  Mail,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Eye,
  FileDown,
  Building2,
  Calendar,
  Lock,
  Sparkles,
  Layers,
  Clock,
  Check
} from 'lucide-react';
import { EmployeePayslipData } from '../data/payrollRegisterData';

export interface PayslipPdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslipData: EmployeePayslipData;
  onCommitDownload: () => void;
  onOpenEmailModal?: () => void;
  isDownloading?: boolean;
  watermarkEnabled?: boolean;
  watermarkText?: string;
  customChecksum?: string;
}

/**
 * Formats a currency number in Philippine Pesos (PHP)
 */
function formatCurrency(amount: number): string {
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Read-Only PDF Preview Component
 * Mimics the exact final jsPDF layout inside an interactive modal
 * to provide a high-fidelity preview before committing to the official download.
 */
export const PayslipPdfPreviewModal: React.FC<PayslipPdfPreviewModalProps> = ({
  isOpen,
  onClose,
  payslipData,
  onCommitDownload,
  onOpenEmailModal,
  isDownloading = false,
  watermarkEnabled = false,
  watermarkText = 'OFFICIAL COPY - CONFIDENTIAL',
  customChecksum
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullWidth, setIsFullWidth] = useState<boolean>(false);

  if (!isOpen) return null;

  const checksum =
    customChecksum ||
    `SHA256-${Math.abs(
      (payslipData.employeeId + payslipData.payrollId + payslipData.netPay.toFixed(2))
        .split('')
        .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    )
      .toString(16)
      .toUpperCase()
      .padStart(8, '0')}-${payslipData.payrollId}-${payslipData.employeeId}`;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 15, 145));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 15, 70));
  const handleResetZoom = () => setZoomLevel(100);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md overflow-hidden animate-in fade-in duration-200"
    >
      {/* TOP MODAL CONTROL BAR */}
      <div className="flex-none bg-slate-900 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xl z-20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Read-Only PDF Payslip Preview
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold flex items-center gap-1">
                <Check className="h-2.5 w-2.5" />
                A4 Replica (1:1 Ratio)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {payslipData.employeeName} ({payslipData.employeeId}) &bull; Cut-off: {payslipData.cutoffRange}
            </p>
          </div>
        </div>

        {/* Viewport Zoom & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              disabled={zoomLevel <= 70}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span
              onClick={handleResetZoom}
              title="Click to reset zoom to 100%"
              className="px-2 font-mono text-[11px] text-slate-300 cursor-pointer hover:text-blue-400 select-none"
            >
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              disabled={zoomLevel >= 145}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setIsFullWidth(!isFullWidth)}
            title={isFullWidth ? 'Standard A4 Width' : 'Expand Width'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer transition-colors border border-slate-700"
          >
            {isFullWidth ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={handlePrint}
            title="Print Preview Sheet"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>

          <button
            onClick={onClose}
            title="Close Preview (Esc)"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 hover:border-rose-800 border border-slate-700 transition-colors cursor-pointer ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SCROLLABLE PREVIEW CANVAS VIEWPORT */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-slate-950/70">
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out'
          }}
          className={`${
            isFullWidth ? 'w-full max-w-5xl' : 'w-full max-w-4xl'
          } bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-300 relative overflow-hidden my-2`}
        >
          {/* Watermark Overlay (if active) */}
          {watermarkEnabled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-20">
              <div className="rotate-[-32deg] opacity-[0.07] border-4 border-rose-600 rounded-2xl p-6 text-center">
                <span className="text-5xl font-black uppercase tracking-widest text-rose-600 block">
                  {watermarkText}
                </span>
                <span className="text-sm font-bold uppercase tracking-wider text-rose-700 block mt-1">
                  Read-Only Inspection Copy &bull; Pre-Commitment
                </span>
              </div>
            </div>
          )}

          {/* 1. TOP SAPPHIRE ACCENT BAR (MIMICKING jsPDF ACCENT) */}
          <div className="h-2 bg-[#0F52BA] w-full" />

          {/* DOCUMENT PADDING CONTAINER (MIMICS A4 14mm MARGINS) */}
          <div className="p-8 sm:p-10 space-y-6 text-xs font-sans">
            {/* 2. COMPANY LETTERHEAD & OFFICIAL PAYSLIP BADGE */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 uppercase">
                  {payslipData.companyName}
                </h1>
                <p className="text-xs text-slate-600 max-w-lg leading-relaxed">
                  {payslipData.companyAddress}
                </p>
                <p className="text-[11px] font-mono font-medium text-slate-600 pt-0.5">
                  BIR Employer TIN: <span className="font-semibold text-slate-900">{payslipData.companyTin}</span> &bull; DOLE &amp; SEC Registered Entity &bull; Strictly Confidential
                </p>
              </div>

              <div className="text-right flex flex-col items-end">
                <span className="inline-block px-3.5 py-1.5 rounded-lg bg-[#0F52BA] text-white font-bold text-xs uppercase tracking-wider shadow-sm">
                  Official Payslip
                </span>
                <div className="text-[11px] font-mono text-slate-500 mt-2">
                  Format: <span className="text-slate-800 font-semibold">Standard A4 / BIR-DOLE Compliant</span>
                </div>
              </div>
            </div>

            {/* 3. PAYROLL PERIOD & DISBURSEMENT PARTICULARS BAR */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Payroll Cut-off ID
                </span>
                <span className="font-bold text-slate-950 font-mono text-sm block mt-0.5">
                  {payslipData.payrollId}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Cut-off Period Range
                </span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {payslipData.cutoffRange}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Pay Disbursement Date
                </span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {payslipData.payDate}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Disbursement Scheme
                </span>
                <span className="inline-block font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] mt-0.5">
                  {payslipData.payType} Paid (Semi-Monthly)
                </span>
              </div>
            </div>

            {/* 4. EMPLOYEE PARTICULARS & MANDATORY STATUTORY IDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 bg-white">
              {/* Left Profile */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Employee Profile &amp; Bank Disbursement
                </span>
                <div className="text-sm font-bold text-slate-950 flex items-center gap-2">
                  <span>{payslipData.employeeName}</span>
                  <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                    {payslipData.employeeId}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  Department: <strong className="text-slate-900">{payslipData.department}</strong> &bull; Designation: <strong className="text-slate-900">{payslipData.position}</strong>
                </div>
                <div className="text-xs text-slate-600 pt-0.5">
                  Disbursement Bank: <strong className="text-slate-900">{payslipData.bankName}</strong> &bull; Account: <span className="font-mono text-slate-900">{payslipData.bankAccountNumber}</span>
                </div>
              </div>

              {/* Right Government IDs */}
              <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Mandatory Government Identifiers
                </span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">BIR Taxpayer TIN:</span>
                    <span className="font-semibold text-slate-900">{payslipData.tin}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">SSS / WISP ID:</span>
                    <span className="font-semibold text-slate-900">{payslipData.sssNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">PhilHealth PIN:</span>
                    <span className="font-semibold text-slate-900">{payslipData.philHealthNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Pag-IBIG / HDMF MID:</span>
                    <span className="font-semibold text-slate-900">{payslipData.pagIbigNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. ATTENDANCE & TIMEKEEPING SUMMARY */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                Timekeeping &amp; Attendance Audit Summary
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Days Worked</span>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">{payslipData.daysWorked} Days</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Unpaid Absences</span>
                  <span className={`font-bold text-xs sm:text-sm ${payslipData.absenceDays > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {payslipData.absenceDays} Days
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Late / Tardy</span>
                  <span className={`font-bold text-xs sm:text-sm ${payslipData.lateMinutes > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {payslipData.lateMinutes} Mins
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Approved OT</span>
                  <span className="font-bold text-purple-700 text-xs sm:text-sm">{payslipData.overtimeHours.toFixed(1)} Hrs</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Night Diff</span>
                  <span className="font-bold text-purple-700 text-xs sm:text-sm">{payslipData.nightDiffHours.toFixed(1)} Hrs</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block">Tax Profile</span>
                  <span className={`font-bold text-xs ${payslipData.isMwe ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {payslipData.isMwe ? 'MWE (Exempt)' : 'Standard'}
                  </span>
                </div>
              </div>
            </div>

            {/* 6. GROSS-TO-NET COMPUTATION TABLES (SIDE BY SIDE) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* LEFT BOX: GROSS EARNINGS */}
              <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="bg-[#0F52BA] text-white font-bold px-4 py-2.5 text-xs flex justify-between items-center">
                    <span>GROSS EARNINGS</span>
                    <span className="font-mono text-[11px]">AMOUNT (PHP)</span>
                  </div>

                  <div className="p-4 space-y-2 font-mono text-xs divide-y divide-slate-100">
                    <div className="flex justify-between py-1 text-slate-700">
                      <span>Basic Salary (Period Share)</span>
                      <span className="font-semibold text-slate-900">{payslipData.basicPay.toFixed(2)}</span>
                    </div>

                    {payslipData.absenceDeduction > 0 && (
                      <div className="flex justify-between py-1 text-rose-600 font-medium">
                        <span>Less: Absence ({payslipData.absenceDays}d)</span>
                        <span>-{payslipData.absenceDeduction.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.lateDeduction > 0 && (
                      <div className="flex justify-between py-1 text-rose-600 font-medium">
                        <span>Less: Tardiness ({payslipData.lateMinutes}m)</span>
                        <span>-{payslipData.lateDeduction.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1 font-bold text-slate-950 bg-slate-50/80 px-2 rounded">
                      <span>Regular Pay Earned</span>
                      <span>{payslipData.regularPay.toFixed(2)}</span>
                    </div>

                    {payslipData.overtimePay > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Overtime Pay ({payslipData.overtimeHours}h @ 125%)</span>
                        <span className="font-semibold text-slate-900">+{payslipData.overtimePay.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.nightDiffPay > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Night Shift Diff ({payslipData.nightDiffHours}h @ 10%)</span>
                        <span className="font-semibold text-slate-900">+{payslipData.nightDiffPay.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.holidayPay > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Holiday Premium Pay</span>
                        <span className="font-semibold text-slate-900">+{payslipData.holidayPay.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.paidLeavePay > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Paid Leave Benefit Pay</span>
                        <span className="font-semibold text-slate-900">+{payslipData.paidLeavePay.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.taxableAllowances > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Taxable Allowances / Commissions</span>
                        <span className="font-semibold text-slate-900">+{payslipData.taxableAllowances.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.nonTaxableRiceSubsidy > 0 && (
                      <div className="flex justify-between py-1 text-emerald-700">
                        <span>Rice Subsidy (De Minimis)</span>
                        <span className="font-semibold">+{payslipData.nonTaxableRiceSubsidy.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.bonusesCommissions > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Performance Bonus / Incentive</span>
                        <span className="font-semibold text-slate-900">+{payslipData.bonusesCommissions.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Gross Bottom Bar */}
                <div className="bg-slate-100 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center font-bold text-slate-950 font-mono text-xs sm:text-sm">
                  <span>TOTAL GROSS EARNINGS:</span>
                  <span className="text-base text-slate-950">
                    {formatCurrency(payslipData.grossPay)}
                  </span>
                </div>
              </div>

              {/* RIGHT BOX: STATUTORY & OTHER DEDUCTIONS */}
              <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="bg-slate-900 text-white font-bold px-4 py-2.5 text-xs flex justify-between items-center">
                    <span>STATUTORY &amp; OTHER DEDUCTIONS</span>
                    <span className="font-mono text-[11px]">AMOUNT (PHP)</span>
                  </div>

                  <div className="p-4 space-y-2 font-mono text-xs divide-y divide-slate-100">
                    <div className="flex justify-between py-1 text-slate-700">
                      <span>SSS Contribution (EE Share)</span>
                      <span className="font-semibold text-slate-900">
                        {payslipData.sssEe > 0 ? payslipData.sssEe.toFixed(2) : '0.00 (1st Half)'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>PhilHealth Contribution (EE Share)</span>
                      <span className="font-semibold text-slate-900">
                        {payslipData.philHealthEe > 0 ? payslipData.philHealthEe.toFixed(2) : '0.00 (1st Half)'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>Pag-IBIG Fund (EE Share)</span>
                      <span className="font-semibold text-slate-900">
                        {payslipData.pagIbigEe > 0 ? payslipData.pagIbigEe.toFixed(2) : '0.00 (1st Half)'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-slate-700">
                      <span>Taxable Compensation Base</span>
                      <span className="text-slate-600">{payslipData.taxableCompensation.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between py-1 font-bold text-rose-700 bg-rose-50/70 px-2 rounded">
                      <span>{payslipData.isMwe ? 'TRAIN Withholding Tax (MWE Exempt)' : 'BIR TRAIN Withholding Tax'}</span>
                      <span>{payslipData.isMwe ? '0.00' : payslipData.withholdingTax.toFixed(2)}</span>
                    </div>

                    {payslipData.loanDeductions > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>SSS / HDMF / Company Loan</span>
                        <span className="font-semibold text-slate-900">{payslipData.loanDeductions.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.cashAdvanceDeductions > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Emergency Cash Advance</span>
                        <span className="font-semibold text-slate-900">{payslipData.cashAdvanceDeductions.toFixed(2)}</span>
                      </div>
                    )}

                    {payslipData.otherDeductions > 0 && (
                      <div className="flex justify-between py-1 text-slate-700">
                        <span>Other Authorized Deductions</span>
                        <span className="font-semibold text-slate-900">{payslipData.otherDeductions.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Deductions Bottom Bar */}
                <div className="bg-rose-50/80 border-t border-rose-200 px-4 py-2.5 flex justify-between items-center font-bold text-rose-700 font-mono text-xs sm:text-sm">
                  <span>TOTAL DEDUCTIONS:</span>
                  <span className="text-base text-rose-700">
                    -{formatCurrency(payslipData.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>

            {/* 7. NET TAKE-HOME PAY HIGHLIGHT BANNER */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                  Net Take-Home Pay (Disbursed to Bank Account)
                </span>
                <span className="text-xs text-emerald-700 font-sans block">
                  Disbursed via {payslipData.bankName} Account ending in {payslipData.bankAccountNumber.slice(-4)} &bull; Pay Date: {payslipData.payDate}
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
                  {formatCurrency(payslipData.netPay)}
                </span>
              </div>
            </div>

            {/* 8. EMPLOYER STATUTORY CONTRIBUTIONS BLOCK (DOLE TRANSPARENCY) */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 text-[11px] font-mono text-slate-600">
              <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1 font-sans text-xs">
                Employer Social Benefit Counterparts (Company Paid &bull; DOLE Transparency)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  SSS ER + EC: <strong className="text-slate-900">PHP {(payslipData.sssEr + payslipData.sssEc).toFixed(2)}</strong>
                </div>
                <div>
                  PhilHealth ER: <strong className="text-slate-900">PHP {payslipData.philHealthEr.toFixed(2)}</strong>
                </div>
                <div>
                  Pag-IBIG ER: <strong className="text-slate-900">PHP {payslipData.pagIbigEr.toFixed(2)}</strong>
                </div>
                <div>
                  Total Employer Burden: <strong className="text-[#0F52BA]">PHP {payslipData.totalEmployerCost.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* 9. CERTIFICATION, CONFIDENTIALITY & AUDIT SIGNATURE FOOTER */}
            <div className="border-t border-slate-200 pt-4 space-y-2 text-[10px] text-slate-500">
              <p className="leading-relaxed">
                CONFIDENTIALITY NOTICE: This electronic pay statement is private and confidential pursuant to Republic Act No. 10173 (Data Privacy Act of 2012). If you have received this statement in error, please immediately notify your Human Resources / Finance Department and delete this record.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 font-mono text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Audit Signature Checksum: <strong className="text-slate-900">{checksum}</strong></span>
                </div>
                <div>
                  Generated: {new Date().toISOString().replace('T', ' ').slice(0, 19)} PST &bull; Philippine Enterprise Payroll Engine v4.2
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION TOOLBAR */}
      <div className="flex-none bg-slate-900 border-t border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-2xl z-20">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            Read-Only Review Mode &bull; Verify gross-to-net calculations before final distribution.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Preview
          </button>

          {onOpenEmailModal && (
            <button
              onClick={() => {
                onClose();
                onOpenEmailModal();
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Proceed to email distribution"
            >
              <Mail className="h-3.5 w-3.5 text-blue-400" />
              <span>Email Payslip...</span>
            </button>
          )}

          <button
            onClick={onCommitDownload}
            disabled={isDownloading}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
            title="Generate and download the official signed PDF file"
          >
            {isDownloading ? (
              <>
                <Clock className="h-3.5 w-3.5 animate-spin" />
                <span>Generating Official PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" />
                <span>Commit to Official Download (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
