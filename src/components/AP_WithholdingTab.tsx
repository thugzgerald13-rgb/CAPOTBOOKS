import React, { useState } from 'react';
import { Client, PayableInvoice, WithholdingTaxEntry } from '../types';
import { FileText, Award, Calendar, Printer, Download, MapPin, Building } from 'lucide-react';

interface APWithholdingTabProps {
  currentClient: Client;
  payableInvoices: PayableInvoice[];
  withholdingTaxEntries: WithholdingTaxEntry[];
}

export function APWithholdingTab({ currentClient, payableInvoices, withholdingTaxEntries }: APWithholdingTabProps) {
  const [whtSubTab, setWhtSubTab] = useState<'taxes' | 'bir2307' | 'bir1601q'>('taxes');
  
  // BIR Form 2307 options
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [reportingQuarter, setReportingQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q2');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  };

  // Extract suppliers that have invoices with WHT withheld
  const whtInvoices = payableInvoices.filter(i => i.withholdingTaxId && i.whtAmount && i.whtAmount > 0);
  const whtSuppliers = Array.from(new Set(whtInvoices.map(i => i.supplierName)));

  // Calculate gross, rate, and tax for 2307
  const getSupplier2307Data = (supplierName: string) => {
    const supplierInvoices = whtInvoices.filter(i => i.supplierName === supplierName);
    
    let totalGross = 0;
    let totalWithheld = 0;
    let atcCode = 'WI 100';
    let taxRateStr = '1%';
    
    supplierInvoices.forEach(inv => {
      totalGross += inv.subtotal;
      totalWithheld += inv.whtAmount || 0;
      if (inv.withholdingTaxId) {
        const matchingATC = withholdingTaxEntries.find(w => w.id === inv.withholdingTaxId);
        if (matchingATC) {
          atcCode = matchingATC.atcCode;
          taxRateStr = `${matchingATC.taxRate * 100}%`;
        }
      }
    });

    return {
      supplierName,
      totalGross,
      totalWithheld,
      atcCode,
      taxRateStr,
      invoicesCount: supplierInvoices.length,
    };
  };

  const selectedData = selectedSupplier ? getSupplier2307Data(selectedSupplier) : null;

  // Quarterly BIR Form 1601-EQ calculations
  const calculateQuarterly1601EQGrid = () => {
    const grid: Record<string, { baseAmount: number; rate: number; taxWithheld: number; description: string }> = {};

    whtInvoices.forEach(inv => {
      if (!inv.withholdingTaxId) return;
      const atc = withholdingTaxEntries.find(w => w.id === inv.withholdingTaxId);
      if (!atc) return;

      if (!grid[atc.atcCode]) {
        grid[atc.atcCode] = {
          baseAmount: 0,
          rate: atc.taxRate,
          taxWithheld: 0,
          description: atc.description,
        };
      }

      grid[atc.atcCode].baseAmount += inv.subtotal;
      grid[atc.atcCode].taxWithheld += inv.whtAmount || 0;
    });

    return Object.entries(grid).map(([code, d]) => ({
      atcCode: code,
      description: d.description,
      taxRate: `${d.rate * 100}%`,
      baseAmount: d.baseAmount,
      taxWithheld: d.taxWithheld,
    }));
  };

  const quarterlyRemittances = calculateQuarterly1601EQGrid();

  return (
    <div className="space-y-6" id="ap-withholding-tab">
      {/* Selector pills */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 pb-px gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
        <button
          onClick={() => setWhtSubTab('taxes')}
          className={`pb-2.5 px-1 border-b-2 transition-all ${whtSubTab === 'taxes' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          Alphanumeric Tax Codes (ATCs)
        </button>
        <button
          onClick={() => { setWhtSubTab('bir2307'); if (whtSuppliers.length > 0 && !selectedSupplier) setSelectedSupplier(whtSuppliers[0]); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${whtSubTab === 'bir2307' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          BIR Form 2307 (Certificate)
        </button>
        <button
          onClick={() => setWhtSubTab('bir1601q')}
          className={`pb-2.5 px-1 border-b-2 transition-all ${whtSubTab === 'bir1601q' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          BIR Form 1601-EQ Hub
        </button>
      </div>

      {/* SECTION 1: ATC SELECTION SETUP */}
      {whtSubTab === 'taxes' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-blue-600" />
              National Internal Revenue Alphanumeric Tax Codes (ATC)
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              Standard BIR codes controlling Creditable withholding taxes at source in the Philippines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {withholdingTaxEntries.map(atc => (
              <div key={atc.id} className="p-4 rounded-3xl bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded">
                      {atc.atcCode}
                    </span>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      {atc.category} EWT
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block truncate max-w-sm" title={atc.description}>
                    {atc.description}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100">{(atc.taxRate * 100).toFixed(0)}%</span>
                  <span className="text-[9px] text-slate-400 block uppercase tracking-wider">withholding rate</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: BIR FORM 2307 GENERATION & PRINT DESIGNS */}
      {whtSubTab === 'bir2307' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 p-5 rounded-3xl space-y-4 h-fit">
            <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Certificate Configuration</h5>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Supplier Vendor Partner *</label>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="form-input w-full p-2 text-xs"
              >
                <option value="">-- Choose Supplier --</option>
                {whtSuppliers.map(sName => (
                  <option key={sName} value={sName}>{sName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filing Tax Period *</label>
              <select
                value={reportingQuarter}
                onChange={(e) => setReportingQuarter(e.target.value as any)}
                className="form-input w-full p-2 text-xs"
              >
                <option value="Q1">Q1 (January - March 2026)</option>
                <option value="Q2">Q2 (April - June 2026)</option>
                <option value="Q3">Q3 (July - September 2026)</option>
                <option value="Q4">Q4 (October - December 2026)</option>
              </select>
            </div>

            <div className="p-3 bg-white dark:bg-slate-900 border rounded-2xl block text-center">
              <button
                onClick={() => window.print()}
                disabled={!selectedSupplier}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print BIR 2307 Form</span>
              </button>
            </div>
          </div>

          <div className="md:col-span-3 space-y-4 shadow-sm relative">
            {selectedData ? (
              <div className="border border-black p-5 font-sans space-y-4 text-black dark:text-black bg-yellow-50/20 rounded-2xl relative select-none">
                {/* 2307 Form layout */}
                <div className="flex justify-between items-center border-b-2 border-black pb-3 text-center">
                  <div className="text-left w-24">
                    <span className="text-[14px] font-black font-sans tracking-tighter block">BIR Form No.</span>
                    <h2 className="text-2xl font-black block leading-none font-serif text-slate-900">2307</h2>
                  </div>
                  <div>
                    <h3 className="text-xs font-black tracking-widest uppercase">Republika ng Pilipinas</h3>
                    <h1 className="text-[13px] font-black uppercase text-slate-900 tracking-tight leading-tighter">Kagawaran ng Pananalapi</h1>
                    <h3 className="text-[11px] font-extrabold uppercase mt-0.5">Kawanihan ng Rentas Internas</h3>
                    <p className="text-[10px] font-bold text-slate-600 mt-1 uppercase italic">Certificate of Creditable Tax Withheld at Source</p>
                  </div>
                  <div className="text-right w-24">
                    <span className="text-[8px] border-2 border-black p-1 block font-bold leading-none bg-white font-mono">July 2018 (ENCS)</span>
                  </div>
                </div>

                {/* Quarter period */}
                <div className="grid grid-cols-4 border border-black bg-slate-100 text-[10px] font-bold p-1 text-center divide-x divide-black uppercase">
                  <div className="col-span-2">Period Covered: April 1, 2026 to June 30, 2026</div>
                  <div>Year: 2026</div>
                  <div>Quarter: {reportingQuarter}</div>
                </div>

                {/* Part 1: Payee details */}
                <div className="bg-slate-200 border border-black p-1 px-3 text-[10px] font-black uppercase">
                  Part I - Payee Information
                </div>
                <div className="border border-black p-3.5 space-y-2.5 text-[11px] font-bold bg-white rounded-lg">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase block font-sans">Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs font-black text-slate-800">247-901-812-000</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-slate-500 uppercase block font-sans">Payee Registered Name</span>
                      <span className="text-slate-850 uppercase font-black">{selectedData.supplierName}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase block font-sans">Payee Registered Address</span>
                        <span className="text-slate-700 uppercase font-semibold text-[10px]">Manila Gateway Hub, Metro Manila, Philippines</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Part II: Withholding agent */}
                <div className="bg-slate-200 border border-black p-1 px-3 text-[10px] font-black uppercase">
                  Part II - Payor Information (Withholding Agent)
                </div>
                <div className="border border-black p-3.5 space-y-2.5 text-[11px] font-bold bg-white rounded-lg">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase block font-sans">Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs font-black text-slate-800">312-990-112-000</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-slate-500 uppercase block font-sans">Withholding Agent Business Profile</span>
                      <span className="text-slate-900 uppercase font-black">{currentClient.registeredName || currentClient.name}</span>
                    </div>
                  </div>
                </div>

                {/* Part III: Matching Details schedule */}
                <div className="bg-slate-200 border border-black p-1 px-3 text-[10px] font-black uppercase">
                  Part III - Details of Tax Withheld
                </div>
                <div className="border border-black bg-white rounded-lg overflow-hidden">
                  <table className="w-full text-[10px] text-left border-collapse">
                    <thead className="bg-slate-100 uppercase font-black text-center border-b border-black">
                      <tr>
                        <th className="p-2 border-r border-black">Income Payment Classified Details</th>
                        <th className="p-2 border-r border-black w-24">ATC</th>
                        <th className="p-2 border-r border-black w-24">Gross Income</th>
                        <th className="p-2 border-r border-black w-16">Rate (%)</th>
                        <th className="p-2 w-24">Tax Withheld</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold text-center uppercase">
                      <tr>
                        <td className="p-2 border-r border-black text-left">Purchased raw materials / supplies from local vendors</td>
                        <td className="p-2 border-r border-black font-mono font-bold text-center">{selectedData.atcCode}</td>
                        <td className="p-2 border-r border-black text-right font-mono pr-2">₱{selectedData.totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 border-r border-black font-mono">{selectedData.taxRateStr}</td>
                        <td className="p-2 text-right font-mono font-black pr-2 text-blue-600">₱{selectedData.totalWithheld.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center pt-4 text-[10px] text-center uppercase font-bold text-slate-500 font-sans">
                  <div>
                    <span className="block border-b border-black pb-2 text-black font-black">Internal Accountant Specialist</span>
                    <span className="block mt-1">Filing Representative</span>
                  </div>
                  <div>
                    <span className="block border-b border-black pb-2 text-black font-black">Corporate CEO / Treasurer</span>
                    <span className="block mt-1">Payor Authorized Signature</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 font-bold border border-slate-100 rounded-3xl bg-slate-50">
                Please select a supplier containing active withholding tax (EWT) invoices to review the BIR Certificate Form 2307.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: BIR FORM 1601-EQ HUB */}
      {whtSubTab === 'bir1601q' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600" />
              Quarterly BIR Form 1601-EQ EWT Remittance Matrix
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              Consolidated tax filings layout summaries indicating total remitted bases and creditable withheld amounts.
            </p>
          </div>

          <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                <tr>
                  <th className="p-3.5">Filing ATC</th>
                  <th className="p-3.5">Tax Classification description</th>
                  <th className="p-3.5 text-center">Filing Rate</th>
                  <th className="p-3.5 text-right font-semibold">Total Base Gross Base</th>
                  <th className="p-3.5 text-right font-black text-slate-700 dark:text-slate-350">Remitted Tax Withheld</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                {quarterlyRemittances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 font-bold">
                      No quarterly remittances compiled. Tag ATC codes during supplier invoice logs prior to match clearances!
                    </td>
                  </tr>
                ) : (
                  quarterlyRemittances.map(rem => (
                    <tr key={rem.atcCode} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="p-3.5 font-mono font-black text-slate-800 dark:text-slate-100">{rem.atcCode}</td>
                      <td className="p-3.5 text-slate-500">{rem.description}</td>
                      <td className="p-3.5 text-center font-mono">{rem.taxRate}</td>
                      <td className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(rem.baseAmount)}</td>
                      <td className="p-3.5 text-right font-mono font-black text-blue-600 dark:text-blue-400">{formatCurrency(rem.taxWithheld)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
