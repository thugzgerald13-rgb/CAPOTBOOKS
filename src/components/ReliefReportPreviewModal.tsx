import React, { useState, useId } from "react";
import {
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Minus,
  Square,
  FileSpreadsheet
} from "lucide-react";
import {
  type InquiryReport,
  type PurchaseRecord,
  type SalesRecord,
  type ImportRecord,
  formatMoney,
  inquiryPrintHtml,
  printHtml,
  dashTin,
  splitOwnerAddress,
} from "../lib/reliefInquiry";

interface ReliefReportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  report: InquiryReport;
  periodLabel: string;
  onExportExcel?: () => void;
}

export function ReliefReportPreviewModal({
  open,
  onClose,
  report,
  periodLabel,
  onExportExcel,
}: ReliefReportPreviewModalProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const zoomSelectId = useId();

  if (!open || !report) return null;

  const isPurchases = report.type === "purchases";
  const isSales = report.type === "sales";
  const isImports = report.type === "imports";

  const [ownerAddr1, ownerAddr2] = report.owner.addressLine1 && report.owner.addressLine2
    ? [report.owner.addressLine1, report.owner.addressLine2]
    : splitOwnerAddress(report.owner.address);

  const allRecordsCount = report.monthGroups.reduce((acc, mg) => acc + Math.max(mg.records.length, 1), 0);
  const recordsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(allRecordsCount / recordsPerPage));
  const activePage = Math.min(currentPage, totalPages);

  const handlePrint = () => {
    printHtml(inquiryPrintHtml(report, periodLabel));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-1 sm:p-3 overflow-hidden animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-[#f0f0f0] text-slate-800 rounded-md shadow-2xl border border-slate-400 flex flex-col overflow-hidden transition-all duration-150 ${
          isMaximized ? "w-full h-full rounded-none" : "w-[98vw] max-w-[1240px] h-[92vh] max-h-[860px]"
        }`}
      >
        {/* FoxPro Classic Title Bar */}
        <div className="bg-[#f0f0f0] border-b border-slate-300 px-3 py-1.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-400 border border-amber-600 rounded-[2px] flex items-center justify-center text-[10px] font-bold text-amber-950 shadow-xs">
              FR
            </div>
            <span className="text-xs font-semibold text-slate-800 tracking-tight truncate">
              Report Designer - {report.reportFileName} - Bureau of Internal Revenue - Relief System
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {}}
              title="Minimize"
              className="w-6 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded text-xs cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Restore" : "Maximize"}
              className="w-6 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded text-xs cursor-pointer"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="w-7 h-5 flex items-center justify-center text-slate-600 hover:bg-red-600 hover:text-white rounded text-xs transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Menu Bar */}
        <div className="bg-[#f8f8f8] border-b border-slate-200 px-3 py-0.5 flex items-center gap-4 text-xs text-slate-700 select-none">
          <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer">File</span>
          <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer">Edit</span>
          <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer">Help</span>
        </div>

        {/* Toolbar */}
        <div className="bg-[#ebebeb] border-b border-slate-300 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 select-none">
          <div className="flex items-center gap-1 bg-white/60 p-0.5 rounded border border-slate-300 shadow-xs">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={activePage <= 1}
              title="First Page"
              className="p-1 text-slate-700 hover:bg-slate-200 disabled:opacity-35 disabled:hover:bg-transparent rounded cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={activePage <= 1}
              title="Previous Page"
              className="p-1 text-slate-700 hover:bg-slate-200 disabled:opacity-35 disabled:hover:bg-transparent rounded cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono text-slate-700 min-w-[70px] text-center">
              {activePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={activePage >= totalPages}
              title="Next Page"
              className="p-1 text-slate-700 hover:bg-slate-200 disabled:opacity-35 disabled:hover:bg-transparent rounded cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage >= totalPages}
              title="Last Page"
              className="p-1 text-slate-700 hover:bg-slate-200 disabled:opacity-35 disabled:hover:bg-transparent rounded cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/60 px-2 py-0.5 rounded border border-slate-300 text-xs">
              <label htmlFor={zoomSelectId} className="text-slate-600">Zoom:</label>
              <select
                id={zoomSelectId}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="bg-transparent text-slate-800 font-semibold focus:outline-hidden cursor-pointer"
              >
                <option value={50}>50%</option>
                <option value={75}>75%</option>
                <option value={90}>90%</option>
                <option value={100}>100%</option>
                <option value={115}>115%</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
              </select>
            </div>

            {onExportExcel && (
              <button
                type="button"
                onClick={onExportExcel}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded shadow-xs text-xs font-medium transition-colors cursor-pointer"
                title="Export to Excel spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Excel</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-xs text-xs font-semibold transition-colors cursor-pointer"
              title="Print document"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Workspace Canvas (Gray Desktop Area with Centered White Sheet) */}
        <div className="flex-1 bg-[#525659] overflow-auto p-4 sm:p-8 flex justify-center items-start">
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out",
            }}
            className="my-2"
          >
            {/* White Paper Sheet */}
            <div className="bg-white text-black shadow-2xl border border-slate-300 w-[1050px] min-h-[720px] p-10 font-[Arial] text-[11px] leading-[1.35] select-text">
              {/* Header block */}
              <div className="mb-2">
                <div className="text-[11px] leading-tight">Bureau of Internal Revenue</div>
                <div className="text-[11px] leading-tight">Reconciliation of Listings for Enforcement System</div>
                <div className="text-[11px] leading-tight">{report.title}</div>
                <div className="text-[11px] leading-tight mt-0.5">Report Date : {report.reportDate}</div>
              </div>

              {/* Top divider */}
              <div className="border-t border-black my-1.5" />

              {/* Owner Block */}
              <div className="flex justify-between text-[11px] leading-[1.38] my-1">
                <div className="w-[58%] space-y-0.5">
                  <div className="flex">
                    <span className="w-[140px] shrink-0">T.I.N. of Owner :</span>
                    <span className="font-bold">{dashTin(report.owner.tin)}</span>
                  </div>
                  <div className="flex">
                    <span className="w-[140px] shrink-0">Registered Name :</span>
                    <span>{report.owner.name}</span>
                  </div>
                  {!isImports && (
                    <div className="flex">
                      <span className="w-[140px] shrink-0">Trade Name :</span>
                      <span>{report.owner.tradeName || report.owner.name}</span>
                    </div>
                  )}
                </div>

                <div className="w-[42%] space-y-0.5">
                  <div className="flex">
                    <span className="w-[110px] shrink-0">Owners Address:</span>
                    <span className="truncate">{ownerAddr1}</span>
                  </div>
                  <div className="flex">
                    <span className="w-[110px] shrink-0"></span>
                    <span className="truncate">{ownerAddr2}</span>
                  </div>
                </div>
              </div>

              {/* Owner divider */}
              <div className="border-t border-black my-1.5" />

              {/* Month Sections */}
              {report.monthGroups.map((mg, mgIdx) => (
                <div key={mgIdx} className="mb-2">
                  {/* Taxable Month Bar */}
                  <div className="flex items-center text-[11px] my-1">
                    <span className="w-[140px] shrink-0">Taxable Month</span>
                    <span className="italic">{mg.monthLabel}</span>
                  </div>

                  <div className="border-t border-black my-1.5" />

                  {/* Report Data Table */}
                  <table className="w-full table-fixed border-collapse text-[11px]">
                    <thead>
                      {isPurchases ? (
                        <>
                          <tr>
                            <th className="text-left font-bold w-[125px]">T.I.N.</th>
                            <th className="text-left font-bold" colSpan={7}>Registered Name</th>
                          </tr>
                          <tr>
                            <th></th>
                            <th className="text-right font-bold w-[115px]">Total Purchase</th>
                            <th className="text-right font-bold w-[95px]">Zero Rated</th>
                            <th className="text-right font-bold w-[95px]">Exempt</th>
                            <th className="text-right font-bold w-[125px]">Gross Taxable</th>
                            <th className="text-right font-bold w-[130px] leading-tight align-bottom">
                              Services/Other<br />Than Goods/<br />Capital Goods
                            </th>
                            <th className="text-right font-bold w-[120px]">Taxable Net</th>
                            <th className="text-right font-bold w-[110px]">Input Tax</th>
                          </tr>
                        </>
                      ) : isSales ? (
                        <>
                          <tr>
                            <th className="text-left font-bold w-[130px]">T.I.N.</th>
                            <th className="text-left font-bold" colSpan={6}>Registered Name</th>
                          </tr>
                          <tr>
                            <th></th>
                            <th className="text-right font-bold w-[130px]">Total Sales</th>
                            <th className="text-right font-bold w-[110px]">Zero Rated</th>
                            <th className="text-right font-bold w-[110px]">Exempt</th>
                            <th className="text-right font-bold w-[140px]">Gross Taxable</th>
                            <th className="text-right font-bold w-[130px]">Taxable Net</th>
                            <th className="text-right font-bold w-[120px]">Output Tax</th>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr>
                            <th className="text-left font-bold w-[120px]">Entry Number</th>
                            <th className="text-left font-bold w-[110px]">Assessment Date</th>
                            <th className="text-left font-bold" colSpan={3}>Registered Name</th>
                            <th className="text-left font-bold w-[110px]">Country of Origin</th>
                            <th className="text-left font-bold w-[110px]" colSpan={2}>Importation Date</th>
                          </tr>
                          <tr>
                            <th></th>
                            <th className="text-right font-bold w-[125px]">Total Landed Cost</th>
                            <th className="text-right font-bold w-[110px]">Dutiable Value</th>
                            <th className="text-right font-bold w-[100px]">Charges</th>
                            <th className="text-right font-bold w-[115px]">Taxable Goods</th>
                            <th className="text-right font-bold w-[95px]">Exempt</th>
                            <th className="text-right font-bold w-[95px]">VAT</th>
                            <th className="text-left font-bold w-[90px]">OR Number</th>
                          </tr>
                        </>
                      )}
                    </thead>

                    <tbody>
                      {/* Divider between headers and detail rows */}
                      <tr>
                        <td colSpan={isPurchases ? 8 : isSales ? 7 : 8} className="p-0">
                          <div className="border-t border-black my-1" />
                        </td>
                      </tr>

                      {mg.records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isPurchases ? 8 : isSales ? 7 : 8}
                            className="py-4 text-center italic text-slate-500 font-sans"
                          >
                            No record/s to display
                          </td>
                        </tr>
                      ) : isPurchases ? (
                        (mg.records as PurchaseRecord[]).map((rec, rIdx) => (
                          <React.Fragment key={rIdx}>
                            {/* Detail Line 1: TIN and Registered Name */}
                            <tr className="leading-tight">
                              <td className="font-mono text-left">{rec.tin}</td>
                              <td className="font-mono text-left truncate" colSpan={7}>{rec.registeredName}</td>
                            </tr>
                            {/* Detail Line 2: Address */}
                            <tr className="leading-tight">
                              <td></td>
                              <td className="font-mono text-left truncate" colSpan={7}>{rec.address}</td>
                            </tr>
                            {/* Detail Line 3: Amounts */}
                            <tr className="font-mono text-right leading-tight">
                              <td></td>
                              <td>{formatMoney(rec.totalPurchase)}</td>
                              <td>{formatMoney(rec.zeroRated)}</td>
                              <td>{formatMoney(rec.exempt)}</td>
                              <td>{formatMoney(rec.grossTaxable)}</td>
                              <td>{formatMoney(rec.services)}</td>
                              <td>{formatMoney(rec.taxableNet)}</td>
                              <td>{formatMoney(rec.inputTax)}</td>
                            </tr>
                            {/* Detail Line 4: Goods Other */}
                            <tr className="font-mono text-right leading-tight">
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td>{formatMoney(rec.goodsOther)}</td>
                              <td></td>
                              <td></td>
                            </tr>
                            {/* Detail Line 5: Capital Goods */}
                            <tr className="font-mono text-right leading-tight">
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td>{formatMoney(rec.capital)}</td>
                              <td></td>
                              <td></td>
                            </tr>
                          </React.Fragment>
                        ))
                      ) : isSales ? (
                        (mg.records as SalesRecord[]).map((rec, rIdx) => (
                          <React.Fragment key={rIdx}>
                            <tr className="leading-tight">
                              <td className="font-mono text-left">{rec.tin}</td>
                              <td className="font-mono text-left truncate" colSpan={6}>{rec.registeredName}</td>
                            </tr>
                            <tr className="leading-tight">
                              <td></td>
                              <td className="font-mono text-left truncate" colSpan={6}>{rec.address}</td>
                            </tr>
                            <tr className="font-mono text-right leading-tight">
                              <td></td>
                              <td>{formatMoney(rec.totalSales)}</td>
                              <td>{formatMoney(rec.zeroRated)}</td>
                              <td>{formatMoney(rec.exempt)}</td>
                              <td>{formatMoney(rec.grossTaxable)}</td>
                              <td>{formatMoney(rec.taxableNet)}</td>
                              <td>{formatMoney(rec.outputTax)}</td>
                            </tr>
                          </React.Fragment>
                        ))
                      ) : (
                        (mg.records as ImportRecord[]).map((rec, rIdx) => (
                          <React.Fragment key={rIdx}>
                            <tr className="leading-tight">
                              <td className="font-mono text-left">{rec.entryNo}</td>
                              <td className="font-mono text-left">{rec.assessDate}</td>
                              <td className="font-mono text-left truncate" colSpan={3}>{rec.registeredName}</td>
                              <td className="font-mono text-left">{rec.country}</td>
                              <td className="font-mono text-left" colSpan={2}>{rec.importDate}</td>
                            </tr>
                            <tr className="font-mono text-right leading-tight">
                              <td></td>
                              <td>{formatMoney(rec.totalLandedCost)}</td>
                              <td>{formatMoney(rec.dutiableValue)}</td>
                              <td>{formatMoney(rec.charges)}</td>
                              <td>{formatMoney(rec.taxableGoods)}</td>
                              <td>{formatMoney(rec.exempt)}</td>
                              <td>{formatMoney(rec.vat)}</td>
                              <td className="font-mono text-left">{rec.orNumber}</td>
                            </tr>
                          </React.Fragment>
                        ))
                      )}

                      {/* Divider above Taxable Month Totals */}
                      <tr>
                        <td colSpan={isPurchases ? 8 : isSales ? 7 : 8} className="p-0">
                          <div className="border-t border-black my-1" />
                        </td>
                      </tr>

                      {/* Taxable Month Totals row */}
                      {isPurchases ? (
                        <tr className="font-mono text-right font-bold leading-tight">
                          <td className="text-left font-bold font-sans">Taxable Month Totals</td>
                          <td>{formatMoney(mg.monthTotals.totalPurchase || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.zeroRated || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.exempt || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.grossTaxable || 0)}</td>
                          <td></td>
                          <td>{formatMoney(mg.monthTotals.taxableNet || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.inputTax || 0)}</td>
                        </tr>
                      ) : isSales ? (
                        <tr className="font-mono text-right font-bold leading-tight">
                          <td className="text-left font-bold font-sans">Taxable Month Totals</td>
                          <td>{formatMoney(mg.monthTotals.totalSales || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.zeroRated || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.exempt || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.grossTaxable || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.taxableNet || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.outputTax || 0)}</td>
                        </tr>
                      ) : (
                        <tr className="font-mono text-right font-bold leading-tight">
                          <td className="text-left font-bold font-sans">Taxable Month Totals</td>
                          <td>{formatMoney(mg.monthTotals.totalLandedCost || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.dutiableValue || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.charges || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.taxableGoods || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.exempt || 0)}</td>
                          <td>{formatMoney(mg.monthTotals.vat || 0)}</td>
                          <td></td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Double rule under Month Totals */}
                  <div className="border-t border-b border-black h-[3px] my-1.5" />
                </div>
              ))}

              {/* Report Totals Table */}
              <table className="w-full table-fixed border-collapse text-[11px]">
                <tbody>
                  {isPurchases ? (
                    <tr className="font-mono text-right font-bold leading-tight">
                      <td className="text-left font-bold font-sans w-[125px]">Report Totals</td>
                      <td className="w-[115px]">{formatMoney(report.reportTotals.totalPurchase || 0)}</td>
                      <td className="w-[95px]">{formatMoney(report.reportTotals.zeroRated || 0)}</td>
                      <td className="w-[95px]">{formatMoney(report.reportTotals.exempt || 0)}</td>
                      <td className="w-[125px]">{formatMoney(report.reportTotals.grossTaxable || 0)}</td>
                      <td className="w-[130px]"></td>
                      <td className="w-[120px]">{formatMoney(report.reportTotals.taxableNet || 0)}</td>
                      <td className="w-[110px]">{formatMoney(report.reportTotals.inputTax || 0)}</td>
                    </tr>
                  ) : isSales ? (
                    <tr className="font-mono text-right font-bold leading-tight">
                      <td className="text-left font-bold font-sans w-[130px]">Report Totals</td>
                      <td className="w-[130px]">{formatMoney(report.reportTotals.totalSales || 0)}</td>
                      <td className="w-[110px]">{formatMoney(report.reportTotals.zeroRated || 0)}</td>
                      <td className="w-[110px]">{formatMoney(report.reportTotals.exempt || 0)}</td>
                      <td className="w-[140px]">{formatMoney(report.reportTotals.grossTaxable || 0)}</td>
                      <td className="w-[130px]">{formatMoney(report.reportTotals.taxableNet || 0)}</td>
                      <td className="w-[120px]">{formatMoney(report.reportTotals.outputTax || 0)}</td>
                    </tr>
                  ) : (
                    <tr className="font-mono text-right font-bold leading-tight">
                      <td className="text-left font-bold font-sans w-[120px]">Report Totals</td>
                      <td className="w-[125px]">{formatMoney(report.reportTotals.totalLandedCost || 0)}</td>
                      <td className="w-[110px]">{formatMoney(report.reportTotals.dutiableValue || 0)}</td>
                      <td className="w-[100px]">{formatMoney(report.reportTotals.charges || 0)}</td>
                      <td className="w-[115px]">{formatMoney(report.reportTotals.taxableGoods || 0)}</td>
                      <td className="w-[95px]">{formatMoney(report.reportTotals.exempt || 0)}</td>
                      <td className="w-[95px]">{formatMoney(report.reportTotals.vat || 0)}</td>
                      <td className="w-[90px]"></td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Double rule under Report Totals */}
              <div className="border-t border-b border-black h-[3px] my-1.5" />
            </div>
          </div>
        </div>

        {/* FoxPro Classic Status Bar */}
        <div className="bg-[#f0f0f0] border-t border-slate-300 px-3 py-1 flex items-center justify-between text-[11px] font-mono text-slate-700 select-none">
          <div className="truncate">
            Temp (g:\users\gerald\desktop\compiRecord: EOF/1
          </div>
          <div className="flex items-center gap-8 shrink-0">
            <span>Exclusive</span>
            <span className="font-sans text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">
              Page {activePage} of {totalPages}
            </span>
            <span className="border border-slate-300 px-2 bg-white text-[10px] font-bold">
              NUM
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
