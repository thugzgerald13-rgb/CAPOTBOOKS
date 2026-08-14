import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAccounting } from '../context/AccountingContext';
import { Client, PurchaseOrder, ReceivingReport, PayableInvoice, BankAccount, SupplierAdvance, WithholdingTaxEntry, CheckVoucher, DebitCreditMemo } from '../types';
import { 
  ArrowLeft, Landmark, Receipt, CircleDollarSign, 
  Settings, History, HelpCircle, FileText, ArrowLeftRight, Check, Plus, Trash2, ArrowUpRight 
} from 'lucide-react';

// Import sub-components
import { APDashboardTab } from './AP_DashboardTab';
import { APMatchingTab } from './AP_MatchingTab';
import { APDisbursementsTab } from './AP_DisbursementsTab';
import { APWithholdingTab } from './AP_WithholdingTab';

export default function AccountsPayable() {
  const { currentClient, saveClient, showToast, isDarkMode, navigateToPage } = useAccounting();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'matching' | 'disbursements' | 'withholding' | 'memos'>('dashboard');

  // Form states: Debit Credit Memo
  const [memoInvoiceId, setMemoInvoiceId] = useState('');
  const [memoType, setMemoType] = useState<'Debit' | 'Credit'>('Debit');
  const [memoAmount, setMemoAmount] = useState(0);
  const [memoReason, setMemoReason] = useState('');

  // 1. Initial State Hydration / Seeding for AP
  useEffect(() => {
    if (!currentClient) return;

    let needsUpdate = false;
    const seededClient = { ...currentClient };

    // Auto seed Bank Accounts if none exist
    if (!seededClient.bankAccounts || seededClient.bankAccounts.length === 0) {
      seededClient.bankAccounts = [
        { id: 'bank_bdo', bankName: 'BDO Unibank', accountNumber: '0012-8902-1192', balance: 15400000 },
        { id: 'bank_bpi', bankName: 'Bank of the Philippine Islands (BPI)', accountNumber: '0039-1120-4100', balance: 850000 },
        { id: 'bank_metro', bankName: 'Metrobank', accountNumber: '0041-0012-9908', balance: 4500000 },
      ];
      needsUpdate = true;
    }

    // Auto seed BIR Withholding tax entries (ATCs) if missing
    if (!seededClient.withholdingTaxEntries || seededClient.withholdingTaxEntries.length === 0) {
      seededClient.withholdingTaxEntries = [
        { id: 'atc_wi100', atcCode: 'WI 100', description: 'Creditable Tax - Purchase of Goods', taxRate: 0.01, category: 'Expanded' },
        { id: 'atc_wc158', atcCode: 'WC 158', description: 'Creditable Tax - Real Property Lease/Rentals', taxRate: 0.05, category: 'Expanded' },
        { id: 'atc_wi120', atcCode: 'WI 120', description: 'Creditable Tax - Supplier of Services', taxRate: 0.02, category: 'Expanded' },
        { id: 'atc_wi140', atcCode: 'WI 140', description: 'Creditable Tax - Professional Fees / Consultants', taxRate: 0.05, category: 'Expanded' },
      ];
      needsUpdate = true;
    }

    // Auto seed demo purchase orders for 3-way matching demonstration
    if (!seededClient.purchaseOrders || seededClient.purchaseOrders.length === 0) {
      seededClient.purchaseOrders = [
        {
          id: 'PO-2026-0001',
          date: '2026-06-01',
          supplierId: 'SUP-9812',
          supplierName: 'Apex Logistics Corp',
          items: [{ itemCode: 'SUP-INK', description: 'Corporate Office Ink Supplies', qty: 100, unitPrice: 500 }],
          totalAmount: 50000,
          status: 'Received',
        },
        {
          id: 'PO-2026-0002',
          date: '2026-06-05',
          supplierId: 'SUP-1102',
          supplierName: 'Summit Office Trade Inc',
          items: [
            { itemCode: 'ADMIN-PC', description: 'Workstation Computers', qty: 5, unitPrice: 35000 }
          ],
          totalAmount: 175000,
          status: 'Approved',
        }
      ];
      needsUpdate = true;
    }

    // Auto seed demo receiving report for 3-way matching demonstration
    if (!seededClient.receivingReports || seededClient.receivingReports.length === 0) {
      seededClient.receivingReports = [
        {
          id: 'RR-2026-0001',
          date: '2026-06-04',
          poId: 'PO-2026-0001',
          supplierName: 'Apex Logistics Corp',
          items: [
            { itemCode: 'SUP-INK', description: 'Corporate Office Ink Supplies', qtyOrdered: 100, qtyReceived: 90, unitPrice: 500 }
          ],
          totalAmount: 45000,
          receivedBy: 'Cody Martin (Whse Manager)',
        }
      ];
      needsUpdate = true;
    }

    // Auto seed demo supplier invoices for 3-way matches (Discrepancy Demo)
    if (!seededClient.payableInvoices || seededClient.payableInvoices.length === 0) {
      seededClient.payableInvoices = [
        {
          id: 'AP-INV-1001',
          invoiceNumber: 'SI-99021',
          date: '2026-06-05',
          dueDate: '2026-07-05',
          poId: 'PO-2026-0001',
          rrId: 'RR-2026-0001',
          supplierId: 'SUP-9812',
          supplierName: 'Apex Logistics Corp',
          items: [{ itemCode: 'SUP-INK', description: 'Billed Office Ink Supplies', qty: 100, unitPrice: 500 }],
          subtotal: 50000,
          vatAmount: 6000,
          isVatable: true,
          withholdingTaxId: 'atc_wi100',
          whtAmount: 500,
          totalAmount: 55500,
          status: 'Discrepancy',
          discrepancyDetails: 'Qty mismatch for SUP-INK: Invoice billed 100, RR received 90',
        },
        {
          id: 'AP-INV-1002',
          invoiceNumber: 'SI-88912',
          date: '2026-06-02',
          dueDate: '2026-06-25',
          supplierId: 'SUP-4102',
          supplierName: 'Pacific Power & Utilities Inc',
          items: [{ itemCode: 'UT-POWER', description: 'Direct utilities power grid lines', qty: 1, unitPrice: 120000 }],
          subtotal: 120000,
          vatAmount: 14400,
          isVatable: true,
          totalAmount: 134400,
          status: 'Approved',
        }
      ];
      needsUpdate = true;
    }

    // Auto seed historical check vouchers if empty
    if (!seededClient.checkVouchers) {
      seededClient.checkVouchers = [];
      needsUpdate = true;
    }

    // Auto seed prepayment advances if empty
    if (!seededClient.supplierAdvances) {
      seededClient.supplierAdvances = [];
      needsUpdate = true;
    }

    // Auto seed debit/credit memos if empty
    if (!seededClient.debitCreditMemos) {
      seededClient.debitCreditMemos = [];
      needsUpdate = true;
    }

    if (needsUpdate) {
      saveClient(seededClient.id, seededClient);
      showToast('Enterprise AP & Cash Disbursements Sandbox Hydrated.');
    }
  }, [currentClient, saveClient, showToast]);

  if (!currentClient) {
    return (
      <div className="p-8 text-center" id="ap-no-client">
        <p className="text-sm font-bold text-slate-500">Please select an active client profile first.</p>
      </div>
    );
  }

  // Fallbacks to prevent reference crash
  const payableInvoices = currentClient.payableInvoices || [];
  const purchaseOrders = currentClient.purchaseOrders || [];
  const receivingReports = currentClient.receivingReports || [];
  const bankAccounts = currentClient.bankAccounts || [];
  const supplierAdvances = currentClient.supplierAdvances || [];
  const withholdingTaxEntries = currentClient.withholdingTaxEntries || [];
  const debitCreditMemos = currentClient.debitCreditMemos || [];
  const checkVouchers = currentClient.checkVouchers || [];

  const handleSaveCurrentClient = async (updated: Client) => {
    await saveClient(currentClient.id, updated);
  };

  // Execute Supplier Debit / Credit Memo Adjustments Ledger Impact
  const handleCreateMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoInvoiceId || memoAmount <= 0 || !memoReason.trim()) return;

    const invoice = payableInvoices.find(i => i.id === memoInvoiceId);
    if (!invoice) return;

    const memoId = `MEMO-2026-${String(debitCreditMemos.length + 1).padStart(4, '0')}`;
    const newMemo: DebitCreditMemo = {
      id: memoId,
      type: memoType,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplierName,
      date: new Date().toISOString().split('T')[0],
      amount: memoAmount,
      reason: memoReason.trim(),
    };

    // Calculate updated total value for the targeted invoice
    // Debit Memo REDUCES payable liability, Credit Memo INCREASES liability
    const adjustmentFactor = memoType === 'Debit' ? -memoAmount : memoAmount;
    const updatedInvoices = payableInvoices.map(i => {
      if (i.id === invoice.id) {
        return {
          ...i,
          totalAmount: Math.max(0, i.totalAmount + adjustmentFactor),
        };
      }
      return i;
    });

    const updatedClient = {
      ...currentClient,
      payableInvoices: updatedInvoices,
      debitCreditMemos: [...debitCreditMemos, newMemo],
    };

    await saveClient(currentClient.id, updatedClient);
    setMemoInvoiceId('');
    setMemoAmount(0);
    setMemoReason('');
    showToast(`Saved ${memoType} Memo ${memoId} & updated invoice balance`);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  };

  return (
    <div className="w-full mt-8" id="ap-workspace-page">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-100 dark:bg-slate-905 bg-[whitesmoke] dark:bg-slate-900 w-full h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Primary Header Banner */}
        <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 rounded-3xl">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold px-2 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Enterprise AP Core
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Accounts Payable & Cash Disbursements Workspace
              </h2>
            </div>
          </div>
        </div>

        {/* Work Desk Body splits into Sidebar Tabs & Active Screen Panels */}
        <div className="flex-1 flex overflow-hidden">
          {/* Work Desk Side Navigation */}
          <div className="w-56 border-r border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 p-4 flex flex-col justify-between shrink-0">
            <div className="space-y-1.5">
              <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 px-3">Primary Desks</span>
              
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <History className="w-4 h-4 shrink-0" />
                <span>Aging & Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('matching')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'matching' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span>3-Way Match Desk</span>
              </button>

              <button
                onClick={() => setActiveTab('disbursements')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'disbursements' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <CircleDollarSign className="w-4 h-4 shrink-0" />
                <span>Disbursements Panel</span>
              </button>

              <button
                onClick={() => setActiveTab('withholding')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'withholding' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>BIR Tax Withholding</span>
              </button>

              <button
                onClick={() => setActiveTab('memos')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'memos' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <ArrowLeftRight className="w-4 h-4 shrink-0" />
                <span>Debit / Credit Memos</span>
              </button>
            </div>

            <div className="p-3 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100/40 dark:border-blue-900/10 rounded-2xl text-[11px] text-blue-800 dark:text-blue-400 font-medium">
              <p className="leading-relaxed">
                <strong>💡 Tip:</strong> Try setting up a Debit Memo (Parts Return) against open invoices to automatically offset pending disbursement clearings!
              </p>
            </div>
          </div>

          {/* Work Desk Active Content Screen Panel */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {/* 1. DASHBOARD OVERVIEW & AGING SCREEN */}
                {activeTab === 'dashboard' && (
                  <APDashboardTab 
                    currentClient={currentClient}
                    payableInvoices={payableInvoices}
                    bankAccounts={bankAccounts}
                  />
                )}

                {/* 2. RECONCILIATION & 3-WAY MATCHING SCREEN */}
                {activeTab === 'matching' && (
                  <APMatchingTab 
                    currentClient={currentClient}
                    purchaseOrders={purchaseOrders}
                    receivingReports={receivingReports}
                    payableInvoices={payableInvoices}
                    withholdingTaxEntries={withholdingTaxEntries}
                    onSaveCurrentClient={handleSaveCurrentClient}
                    showToast={showToast}
                  />
                )}

                {/* 3. CASH DISBURSEMENTS & SUFFICIENCY SCREEN */}
                {activeTab === 'disbursements' && (
                  <APDisbursementsTab 
                    currentClient={currentClient}
                    payableInvoices={payableInvoices}
                    bankAccounts={bankAccounts}
                    supplierAdvances={supplierAdvances}
                    checkVouchers={checkVouchers}
                    onSaveCurrentClient={handleSaveCurrentClient}
                    showToast={showToast}
                  />
                )}

                {/* 4. WITHHOLDING TAX CHANNELS & BIR 2307 SCREEN */}
                {activeTab === 'withholding' && (
                  <APWithholdingTab 
                    currentClient={currentClient}
                    payableInvoices={payableInvoices}
                    withholdingTaxEntries={withholdingTaxEntries}
                  />
                )}

                {/* 5. DEBIT / CREDIT MEMOS ADJUSTMENTS HUB */}
                {activeTab === 'memos' && (
                  <div className="space-y-6" id="ap-memos-tab">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Log Memo Form */}
                      <form onSubmit={handleCreateMemo} className="md:col-span-1 bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl space-y-4">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                          Log Debit / Credit Memo
                        </h4>
                        
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target invoice ID *</label>
                          <select
                            value={memoInvoiceId}
                            onChange={(e) => setMemoInvoiceId(e.target.value)}
                            className="form-input w-full p-2 text-xs"
                            required
                          >
                            <option value="">-- Choose Invoice to adjust --</option>
                            {payableInvoices
                              .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
                              .map(i => (
                                <option key={i.id} value={i.id}>
                                  {i.invoiceNumber} - {i.supplierName} (Bal: {formatCurrency(i.totalAmount)})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Adjustments Category Type *</label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => setMemoType('Debit')}
                              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${memoType === 'Debit' ? 'bg-red-50 border border-red-200 text-red-650' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border'}`}
                            >
                              Debit Memo (Reduce AP)
                            </button>
                            <button
                              type="button"
                              onClick={() => setMemoType('Credit')}
                              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${memoType === 'Credit' ? 'bg-emerald-50 border border-emerald-250 text-emerald-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border'}`}
                            >
                              Credit Memo (Increase AP)
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Adjustment value (₱) *</label>
                          <input
                            type="number"
                            value={memoAmount}
                            onChange={(e) => setMemoAmount(Math.max(0, Number(e.target.value)))}
                            className="form-input w-full p-2 text-xs"
                            min={1}
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reconciliation reason *</label>
                          <input
                            type="text"
                            value={memoReason}
                            onChange={(e) => setMemoReason(e.target.value)}
                            className="form-input w-full p-2 text-xs"
                            placeholder="Returns of defective items SKU-92"
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={!memoInvoiceId || memoAmount <= 0 || !memoReason.trim()}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-30 disabled:pointer-events-none"
                        >
                          Clear & Book Adjustment
                        </button>
                      </form>

                      {/* Summary list */}
                      <div className="md:col-span-2 space-y-4">
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Debit / Credit Adjustments Archive</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Historic audit log of supplier balances modified via local memos.
                          </p>
                        </div>

                        <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                          <div className="overflow-x-auto">
<table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                              <tr>
                                <th className="p-3">Memo Serial ID</th>
                                <th className="p-3">Ref Invoice</th>
                                <th className="p-3">Partners</th>
                                <th className="p-3">Category Adjust</th>
                                <th className="p-3">Reason</th>
                                <th className="p-3 text-right">Adjustment Valuation</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {debitCreditMemos.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-10 text-center text-slate-400 font-bold">
                                    No logged adjustments memos issued yet.
                                  </td>
                                </tr>
                              ) : (
                                debitCreditMemos.map(mem => (
                                  <tr key={mem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                                    <td className="p-3 font-mono font-black text-slate-700 dark:text-slate-300">{mem.id}</td>
                                    <td className="p-3 block truncate max-w-[100px]" title={mem.invoiceNumber}>{mem.invoiceNumber}</td>
                                    <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">{mem.supplierName}</td>
                                    <td className="p-3">
                                      {mem.type === 'Debit' ? (
                                        <span className="text-[9px] bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded-full uppercase">
                                          Debit Memo (Less AP)
                                        </span>
                                      ) : (
                                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full uppercase">
                                          Credit Memo (Add AP)
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 font-medium text-slate-400 max-w-xs truncate" title={mem.reason}>{mem.reason}</td>
                                    <td className="p-3 text-right font-black text-slate-800 dark:text-slate-100">
                                      {mem.type === 'Debit' ? '-' : '+'} {formatCurrency(mem.amount)}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
