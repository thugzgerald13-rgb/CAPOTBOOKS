import React, { useState } from 'react';
import { Client, PayableInvoice, BankAccount, SupplierAdvance, CheckVoucher, MiscellaneousPayment } from '../types';
import { CreditCard, Landmark, Eye, Printer, Trash, RefreshCw, Plus, Check, ShieldAlert, FileText, ArrowDownCircle, ArrowLeftRight } from 'lucide-react';

interface APDisbursementsTabProps {
  currentClient: Client;
  payableInvoices: PayableInvoice[];
  bankAccounts: BankAccount[];
  supplierAdvances: SupplierAdvance[];
  checkVouchers: CheckVoucher[];
  onSaveCurrentClient: (updatedClient: Client) => void | Promise<void>;
  showToast: (msg: string) => void;
}

export function APDisbursementsTab({
  currentClient,
  payableInvoices,
  bankAccounts,
  supplierAdvances,
  checkVouchers,
  onSaveCurrentClient,
  showToast,
}: APDisbursementsTabProps) {
  const [activeDisbSub, setActiveDisbSub] = useState<'clearing' | 'advances' | 'misc' | 'registry'>('clearing');

  // Form selections and parameters
  const [selectedBankId, setSelectedBankId] = useState('');
  const [issuedCheckNo, setIssuedCheckNo] = useState('');
  
  // Voucher detail drawer/viewer
  const [viewingVoucher, setViewingVoucher] = useState<CheckVoucher | null>(null);

  // Clearing form states
  const [clearingInvoiceId, setClearingInvoiceId] = useState('');

  // Advances states
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advSupplier, setAdvSupplier] = useState('');
  const [advAmount, setAdvAmount] = useState(0);
  const [advNotes, setAdvNotes] = useState('');

  // Direct Miscellaneous payments states
  const [showMiscForm, setShowMiscForm] = useState(false);
  const [miscPayee, setMiscPayee] = useState('');
  const [miscAmount, setMiscAmount] = useState(0);
  const [miscCategory, setMiscCategory] = useState('Utilities');
  const [miscDesc, setMiscDesc] = useState('');

  // Helper numbers to words (Philippine Peso format)
  const numberToWords = (num: number): string => {
    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    const inWords = (n: number | string): string => {
      let temp = Number(n);
      if (temp === 0) return '';
      if (temp < 20) return a[temp];
      if (temp < 100) return b[Math.floor(temp / 10)] + ' ' + a[temp % 10];
      if (temp < 1000) return a[Math.floor(temp / 100)] + 'hundred ' + inWords(temp % 100);
      if (temp < 1000000) return inWords(Math.floor(temp / 1000)) + 'thousand ' + inWords(temp % 1000);
      return inWords(Math.floor(temp / 1000000)) + 'million ' + inWords(temp % 1000000);
    };

    const principal = Math.floor(num);
    const decimal = Math.round((num - principal) * 100);
    
    let result = inWords(principal) + 'pesos ';
    if (decimal > 0) {
      result += `and ${decimal}/100 cents `;
    } else {
      result += 'only';
    }
    return result.replace(/\s+/g, ' ').trim().toUpperCase();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  };

  // Determine Balance checks
  const targetBank = bankAccounts.find(b => b.id === selectedBankId);
  const currentBankBalance = targetBank ? targetBank.balance : 0;

  // Calculate current payment amount
  const getDisbursementAmount = (): number => {
    if (activeDisbSub === 'clearing') {
      const inv = payableInvoices.find(i => i.id === clearingInvoiceId);
      return inv ? inv.totalAmount : 0;
    }
    if (activeDisbSub === 'advances') return advAmount;
    if (activeDisbSub === 'misc') return miscAmount;
    return 0;
  };

  const disbAmount = getDisbursementAmount();
  const remainsFund = currentBankBalance - disbAmount;
  const isInsufficient = selectedBankId !== '' && remainsFund < 0;

  // Execute Invoice Clearance Discharge
  const handleClearInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clearingInvoiceId || !selectedBankId || !issuedCheckNo.trim() || isInsufficient) return;

    const invoice = payableInvoices.find(i => i.id === clearingInvoiceId);
    if (!invoice) return;

    const cvId = `CV-2026-${String(checkVouchers.length + 1).padStart(4, '0')}`;
    const newVoucher: CheckVoucher = {
      id: cvId,
      date: new Date().toISOString().split('T')[0],
      payeeName: invoice.supplierName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentType: 'Invoice Clearance',
      amount: invoice.totalAmount,
      checkedBy: 'Internal Audit',
      approvedBy: 'Finance Controller',
      bankAccountId: selectedBankId,
      bankName: targetBank?.bankName || 'Unknown Bank',
      checkNumber: issuedCheckNo.trim(),
      status: 'Withdrawn',
    };

    // Deduct bank account structure
    const updatedBanks = bankAccounts.map(b => (b.id === selectedBankId ? { ...b, balance: b.balance - invoice.totalAmount } : b));

    // Update invoice status to PAID
    const updatedInvoices = payableInvoices.map(i => (i.id === invoice.id ? { ...i, status: 'Paid' as const } : i));

    const updatedClient = {
      ...currentClient,
      bankAccounts: updatedBanks,
      payableInvoices: updatedInvoices,
      checkVouchers: [...checkVouchers, newVoucher],
    };

    await onSaveCurrentClient(updatedClient);
    setClearingInvoiceId('');
    setSelectedBankId('');
    setIssuedCheckNo('');
    showToast(`Issued Check Voucher ${cvId} & marked Invoice Paid`);
  };

  // Supplier Prepayment Downpayment clearance
  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advSupplier.trim() || advAmount <= 0 || !selectedBankId || !issuedCheckNo.trim() || isInsufficient) return;

    const cvId = `CV-2026-${String(checkVouchers.length + 1).padStart(4, '0')}`;
    const advId = `ADV-2026-${String(supplierAdvances.length + 1).padStart(4, '0')}`;

    const newAdvance: SupplierAdvance = {
      id: advId,
      supplierId: 'SUP-' + Date.now().toString().slice(-4),
      supplierName: advSupplier.trim(),
      date: new Date().toISOString().split('T')[0],
      amount: advAmount,
      isLiquidated: false,
      notes: advNotes.trim() || undefined,
    };

    const newVoucher: CheckVoucher = {
      id: cvId,
      date: new Date().toISOString().split('T')[0],
      payeeName: advSupplier.trim(),
      paymentType: 'Advance',
      miscDetails: `Prepayment downpayment - ${newAdvance.id}`,
      amount: advAmount,
      checkedBy: 'Accounts Specialist',
      approvedBy: 'Disbursement Manager',
      bankAccountId: selectedBankId,
      bankName: targetBank?.bankName || 'Unknown Bank',
      checkNumber: issuedCheckNo.trim(),
      status: 'Withdrawn',
    };

    const updatedBanks = bankAccounts.map(b => (b.id === selectedBankId ? { ...b, balance: b.balance - advAmount } : b));

    const updatedClient = {
      ...currentClient,
      bankAccounts: updatedBanks,
      supplierAdvances: [...supplierAdvances, newAdvance],
      checkVouchers: [...checkVouchers, newVoucher],
    };

    await onSaveCurrentClient(updatedClient);
    setShowAdvanceForm(false);
    setAdvSupplier('');
    setAdvAmount(0);
    setAdvNotes('');
    setSelectedBankId('');
    setIssuedCheckNo('');
    showToast(`Disbursed supplier advance prepayment ${advId}`);
  };

  // Direct Miscellaneous Payment discharge
  const handleClearMisc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miscPayee.trim() || miscAmount <= 0 || !selectedBankId || !issuedCheckNo.trim() || isInsufficient) return;

    const cvId = `CV-2026-${String(checkVouchers.length + 1).padStart(4, '0')}`;

    const newVoucher: CheckVoucher = {
      id: cvId,
      date: new Date().toISOString().split('T')[0],
      payeeName: miscPayee.trim(),
      paymentType: 'Miscellaneous',
      miscDetails: `Direct payment mapped to [${miscCategory}]: ${miscDesc}`,
      amount: miscAmount,
      checkedBy: 'Treasury Analyst',
      approvedBy: 'CFO / Approver',
      bankAccountId: selectedBankId,
      bankName: targetBank?.bankName || 'Unknown Bank',
      checkNumber: issuedCheckNo.trim(),
      status: 'Withdrawn',
    };

    const updatedBanks = bankAccounts.map(b => (b.id === selectedBankId ? { ...b, balance: b.balance - miscAmount } : b));

    const updatedClient = {
      ...currentClient,
      bankAccounts: updatedBanks,
      checkVouchers: [...checkVouchers, newVoucher],
    };

    await onSaveCurrentClient(updatedClient);
    setShowMiscForm(false);
    setMiscPayee('');
    setMiscAmount(0);
    setMiscDesc('');
    setSelectedBankId('');
    setIssuedCheckNo('');
    showToast(`Logged direct Misc Expense payment ${cvId}`);
  };

  // Core AP Reverse Check Checkpoint trigger
  const handleReverseCheck = async (voucher: CheckVoucher) => {
    if (voucher.status === 'Reversed') return;

    const reason = prompt("Describe the reason for check reversals (e.g. Bounced Check, Stale Stop-Payment, Form Correction):");
    if (reason === null) return; // cancel click

    // 1. Return/Restore Bank accounts balance
    const updatedBanks = bankAccounts.map(b => {
      if (b.id === voucher.bankAccountId) {
        return { ...b, balance: b.balance + voucher.amount };
      }
      return b;
    });

    // 2. Rollback linked invoice state to approved (so it is unpaid / open to clear again!)
    let updatedInvoices = [...payableInvoices];
    if (voucher.invoiceId) {
      updatedInvoices = payableInvoices.map(i => {
        if (i.id === voucher.invoiceId) {
          return { ...i, status: 'Approved' as const };
        }
        return i;
      });
    }

    // 3. Mark check voucher on Client records as Reversed
    const updatedVouchers = checkVouchers.map(cv => {
      if (cv.id === voucher.id) {
        return {
          ...cv,
          status: 'Reversed' as const,
          reversedReason: reason || 'Audit check reversal requests',
          reversedAt: new Date().toISOString().split('T')[0],
        };
      }
      return cv;
    });

    const updatedClient = {
      ...currentClient,
      bankAccounts: updatedBanks,
      payableInvoices: updatedInvoices,
      checkVouchers: updatedVouchers,
    };

    await onSaveCurrentClient(updatedClient);
    setViewingVoucher(null);
    showToast(`🚫 STRIKE BACK: Reversed CV check ${voucher.id}. Restored Bank Funds!`);
  };

  return (
    <div className="space-y-6" id="ap-disbursements-tab">
      {/* Selector Subtabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-850 pb-px gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
        <button
          onClick={() => { setActiveDisbSub('clearing'); setSelectedBankId(''); setIssuedCheckNo(''); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeDisbSub === 'clearing' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          Invoice Clearance Desk
        </button>
        <button
          onClick={() => { setActiveDisbSub('advances'); setSelectedBankId(''); setIssuedCheckNo(''); setShowAdvanceForm(false); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeDisbSub === 'advances' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          Advances to Suppliers
        </button>
        <button
          onClick={() => { setActiveDisbSub('misc'); setSelectedBankId(''); setIssuedCheckNo(''); setShowMiscForm(false); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeDisbSub === 'misc' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          Miscellaneous Payments
        </button>
        <button
          onClick={() => { setActiveDisbSub('registry'); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeDisbSub === 'registry' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent hover:text-slate-500'}`}
        >
          Check Voucher Registry
        </button>
      </div>

      {/* CORE 1: INVOICE CLEARING DISBURSEMENTS */}
      {activeDisbSub === 'clearing' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create voucher form */}
          <form onSubmit={handleClearInvoice} className="md:col-span-1 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl space-y-4 h-fit">
            <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Prepare Check Disbursement
            </h5>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Approved Invoice *</label>
              <select
                value={clearingInvoiceId}
                onChange={(e) => setClearingInvoiceId(e.target.value)}
                className="form-input w-full p-2 text-xs"
                required
              >
                <option value="">-- Choose Invoice to Discharge --</option>
                {payableInvoices
                  .filter(i => i.status === 'Approved' || i.status === 'Matched')
                  .map(i => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} - {i.supplierName} ({formatCurrency(i.totalAmount)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Bank Account *</label>
              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="form-input w-full p-2 text-xs"
                required
              >
                <option value="">-- Choose Paying Bank Account --</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} (Bal: {formatCurrency(b.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Check Number *</label>
              <input
                type="text"
                value={issuedCheckNo}
                onChange={(e) => setIssuedCheckNo(e.target.value)}
                className="form-input w-full p-2 text-xs"
                placeholder="e.g. CK-0128912"
                required
              />
            </div>

            {/* SUFFICIENCY ENGINE ALERTING AREA */}
            {selectedBankId && (
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Real-time Sufficiency Checking</span>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Selected Funds:</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatCurrency(currentBankBalance)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold border-b pb-1.5 border-slate-100 dark:border-slate-800">
                  <span>Voucher Cost:</span>
                  <span className="text-slate-800 dark:text-slate-200">- {formatCurrency(disbAmount)}</span>
                </div>

                {isInsufficient ? (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40 text-red-700 dark:text-red-400 rounded-xl space-y-1 mt-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>INSUFFICIENT BALANCE</span>
                    </div>
                    <p className="text-[10px] leading-relaxed">
                      Shortfall of <strong>{formatCurrency(Math.abs(remainsFund))}</strong>. Disbursement blocked for overdraw hazard.
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-1.5 text-xs font-bold mt-2">
                    <Check className="w-4 h-4" />
                    <span>SUFFICIENT FUNDS GUARANTEED</span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!clearingInvoiceId || !selectedBankId || !issuedCheckNo.trim() || isInsufficient}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Approve Voucher & Pay Check
            </button>
          </form>

          {/* List of pending matching invoices */}
          <div className="md:col-span-2 space-y-4">
            <h6 className="font-bold text-xs uppercase tracking-wider text-slate-400">Matched Invoices Awaiting Payment Clearing</h6>
            <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
              <div className="overflow-x-auto">
<table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                  <tr>
                    <th className="p-3">Ref Invoice</th>
                    <th className="p-3">Payee</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-right">Invoice Sum</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payableInvoices.filter(i => i.status === 'Approved' || i.status === 'Matched').length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400 font-bold">
                        No approved or matched invoices waiting for disbursements. Check Three-Way matches to approve!
                      </td>
                    </tr>
                  ) : (
                    payableInvoices
                      .filter(i => i.status === 'Approved' || i.status === 'Matched')
                      .map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{inv.invoiceNumber}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{inv.supplierName}</td>
                          <td className="p-3 text-slate-500">{inv.dueDate}</td>
                          <td className="p-3 text-right font-black text-slate-700 dark:text-slate-350">{formatCurrency(inv.totalAmount)}</td>
                          <td className="p-3 text-center">
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase">
                              Awaiting Pay
                            </span>
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
      )}

      {/* CORE 2: SUPPLIER ADVANCES */}
      {activeDisbSub === 'advances' && (
        <div className="space-y-4">
          {!showAdvanceForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 font-sans">Advances & Prepayments Ledger</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Track cash advances given to suppliers, redeemable / liquidatable against down-stream invoices.
                  </p>
                </div>
                <button
                  onClick={() => setShowAdvanceForm(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Issue Supplier Advance</span>
                </button>
              </div>

              {/* Advances list */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                <div className="overflow-x-auto">
<table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-3">Advance ID</th>
                      <th className="p-3">Supplier Name</th>
                      <th className="p-3">Payment Date</th>
                      <th className="p-3 text-right">Advance Sum</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {supplierAdvances.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-slate-400 font-bold">
                          No supplier prepayments or downs listed.
                        </td>
                      </tr>
                    ) : (
                      supplierAdvances.map(adv => (
                        <tr key={adv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-mono font-black text-slate-800 dark:text-slate-200">{adv.id}</td>
                          <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">{adv.supplierName}</td>
                          <td className="p-3 text-slate-500">{adv.date}</td>
                          <td className="p-3 text-right font-black text-slate-800 dark:text-slate-100">{formatCurrency(adv.amount)}</td>
                          <td className="p-3 text-center">
                            {adv.isLiquidated ? (
                              <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2.5 py-0.5 rounded-full uppercase">
                                Liquidated
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5 rounded-full uppercase border border-amber-100 dark:border-amber-900/10">
                                Open Account Prep
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
</div>
              </div>
            </div>
          ) : (
            /* Advance creation form */
            <form onSubmit={handleCreateAdvance} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-855 p-5 rounded-2xl flex flex-col gap-4 max-w-xl">
              <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Issue Supplier Downpayment / Advance</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Supplier *</label>
                  <input
                    type="text"
                    value={advSupplier}
                    onChange={(e) => setAdvSupplier(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. Apex Corp"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prepayment Cash Value (₱) *</label>
                  <input
                    type="number"
                    value={advAmount}
                    onChange={(e) => setAdvAmount(Math.max(0, Number(e.target.value)))}
                    className="form-input w-full p-2 text-xs"
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Bank *</label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    required
                  >
                    <option value="">-- Choose Paying Bank --</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (Bal: {formatCurrency(b.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Check Number *</label>
                  <input
                    type="text"
                    value={issuedCheckNo}
                    onChange={(e) => setIssuedCheckNo(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. CK-41001"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Auditing Memo Notes</label>
                <input
                  type="text"
                  value={advNotes}
                  onChange={(e) => setAdvNotes(e.target.value)}
                  className="form-input w-full p-2 text-xs"
                  placeholder="Downpayment for contract Apex-902 supplies purchase"
                />
              </div>

              {selectedBankId && (
                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 rounded-xl">
                  {isInsufficient ? (
                    <div className="p-2 bg-red-50 text-red-700 rounded-lg flex items-center gap-1.5 text-xs font-bold">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>INSUFFICIENT FUNDS: Prepayment exceedspaying bank balance!</span>
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-1.5 text-xs font-bold">
                      <Check className="w-4 h-4" />
                      <span>Bank fund confirmed ready.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanceForm(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInsufficient || !selectedBankId || !issuedCheckNo.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-30"
                >
                  Clear Advance Check
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CORE 3: DIRECT MISCELLANEOUS DISBURSEMENTS */}
      {activeDisbSub === 'misc' && (
        <div className="space-y-4">
          {!showMiscForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 font-sans">Miscellaneous Payments</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Disburse non-invoice direct operating expenses (utilities, office leases) immediately with cash book postings.
                  </p>
                </div>
                <button
                  onClick={() => setShowMiscForm(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Direct Misc Check</span>
                </button>
              </div>

              {/* Simple grid list */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                <div className="overflow-x-auto">
<table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-3">Reference Voucher</th>
                      <th className="p-3">Payee / Pay To</th>
                      <th className="p-3">Charging Account</th>
                      <th className="p-3">Bank Source & Number</th>
                      <th className="p-3 text-right">Payment Sum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {checkVouchers.filter(cv => cv.paymentType === 'Miscellaneous').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-slate-400 font-bold">
                          No direct miscellaneous expense checks logged.
                        </td>
                      </tr>
                    ) : (
                      checkVouchers
                        .filter(cv => cv.paymentType === 'Miscellaneous')
                        .map(cv => (
                          <tr key={cv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <td className="p-3 font-mono font-black text-slate-850 dark:text-slate-100">{cv.id}</td>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{cv.payeeName}</td>
                            <td className="p-3">
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-2 py-0.5 rounded-full uppercase">
                                Direct Expense Charge
                              </span>
                            </td>
                            <td className="p-3 text-slate-500">
                              {cv.bankName} (CK: {cv.checkNumber})
                            </td>
                            <td className="p-3 text-right font-black text-slate-800 dark:text-slate-100">
                              {formatCurrency(cv.amount)}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
</div>
              </div>
            </div>
          ) : (
            /* Misc creation form */
            <form onSubmit={handleClearMisc} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-855 p-5 rounded-2xl flex flex-col gap-4 max-w-xl">
              <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Log Direct Operating Check Disbursement</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pay To / Payee Name *</label>
                  <input
                    type="text"
                    value={miscPayee}
                    onChange={(e) => setMiscPayee(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. Meralco Electric Power"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Charge Value Amount (₱) *</label>
                  <input
                    type="number"
                    value={miscAmount}
                    onChange={(e) => setMiscAmount(Math.max(0, Number(e.target.value)))}
                    className="form-input w-full p-2 text-xs"
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expense Class Account *</label>
                  <select
                    value={miscCategory}
                    onChange={(e) => setMiscCategory(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    required
                  >
                    <option value="Utilities">Utilities Expense (Power/Water)</option>
                    <option value="Rent">Office Rental Expense</option>
                    <option value="Office Supplies">Administrative Supplies</option>
                    <option value="Taxes">Taxes and Licensing Fees</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Disbursement Bank *</label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    required
                  >
                    <option value="">-- Choose paying bank --</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (Bal: {formatCurrency(b.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Check Serial Number *</label>
                  <input
                    type="text"
                    value={issuedCheckNo}
                    onChange={(e) => setIssuedCheckNo(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. CK-3890"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Detailed Description Memo</label>
                <input
                  type="text"
                  value={miscDesc}
                  onChange={(e) => setMiscDesc(e.target.value)}
                  className="form-input w-full p-2 text-xs"
                  placeholder="Payment for building water lines bills for May 2026"
                />
              </div>

              {selectedBankId && (
                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 rounded-xl">
                  {isInsufficient ? (
                    <div className="p-2 bg-red-50 text-red-700 rounded-lg flex items-center gap-1.5 text-xs font-bold">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>INSUFFICIENT FUNDS: Transaction exceeds checking balance!</span>
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-1.5 text-xs font-bold">
                      <Check className="w-4 h-4" />
                      <span>Ready to disburse cash book posting.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMiscForm(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInsufficient || !selectedBankId || !issuedCheckNo.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-30"
                >
                  Clear Direct Check
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CORE 4: GENERAL CHECK VOUCHER REGISTRY (WITH REVERSALS AND PRINTABLE OVERLAYS) */}
      {activeDisbSub === 'registry' && (
        <div className="space-y-4">
          <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
            <div className="overflow-x-auto">
<table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                <tr>
                  <th className="p-3">CV ID</th>
                  <th className="p-3">Payer Bank</th>
                  <th className="p-3">Payee Partner</th>
                  <th className="p-3">Expense/Invoice Details</th>
                  <th className="p-3 text-right">Cleared Amount</th>
                  <th className="p-3">Status Checked</th>
                  <th className="p-3 text-center">Desk Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {checkVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400 font-bold">
                      No check vouchers issued yet in cash disbursement journals.
                    </td>
                  </tr>
                ) : (
                  checkVouchers.map(cv => (
                    <tr key={cv.id} className="hover:bg-slate-55/50 dark:hover:bg-slate-800/10">
                      <td className="p-3 font-mono font-black text-slate-800 dark:text-slate-100">{cv.id}</td>
                      <td className="p-3">
                        <span className="font-bold block text-slate-700 dark:text-slate-200">{cv.bankName}</span>
                        <span className="text-[10px] text-slate-400 font-mono block">CK: {cv.checkNumber}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-600 dark:text-slate-350">{cv.payeeName}</td>
                      <td className="p-3">
                        {cv.paymentType === 'Invoice Clearance' ? (
                          <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/10 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium block w-fit">
                            Invoice: {cv.invoiceNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 block max-w-xs truncate" title={cv.miscDetails}>
                            {cv.miscDetails || 'Supplier Advance Down'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-black text-slate-700 dark:text-slate-300">{formatCurrency(cv.amount)}</td>
                      <td className="p-3">
                        {cv.status === 'Reversed' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[9px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">
                              🚫 Reversed Check!
                            </span>
                            <span className="text-[8px] text-red-500 font-mono block max-w-xs truncate" title={cv.reversedReason}>
                              Reas: {cv.reversedReason}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">
                            Cleared Solid
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingVoucher(cv)}
                            className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 border text-slate-600 font-extrabold rounded-lg text-[10px] select-none text-center"
                            title="Print Voucher / Check Drawer"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
</div>
          </div>
        </div>
      )}

      {/* DETAILED CORPORATE CHECK VOUCHER PRINT VIEWER DRAWER */}
      {viewingVoucher && (
        <div className="fixed inset-0 bg-black/60 z-55 flex items-center justify-center p-4 backdrop-blur-xs select-none">
          <div className="bg-white dark:bg-slate-900 max-w-3xl w-full rounded-3xl p-6 shadow-2xl relative flex flex-col gap-5 border">
            {/* Header controls */}
            <div className="flex items-center justify-between border-b pb-3.5 border-slate-100 dark:border-slate-800">
              <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Disbursement Check Voucher #{viewingVoucher.id}
              </h5>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Corporate Copy
                </button>
                {viewingVoucher.status !== 'Reversed' && (
                  <button
                    onClick={() => handleReverseCheck(viewingVoucher)}
                    className="p-1.5 px-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-1 select-none"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reverse Check Details
                  </button>
                )}
                <button
                  onClick={() => setViewingVoucher(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[450px] pr-2 space-y-6 scrollbar-hide">
              {/* VOUCHER GRID LAYOUT */}
              <div className="border-4 border-slate-900 p-5 font-sans space-y-4 text-black dark:text-black bg-neutral-50 rounded-2xl">
                <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3">
                  <div>
                    <h4 className="text-xl font-black tracking-tight uppercase">CAPOT CORPORATE BOOKS CORP.</h4>
                    <span className="text-[10px] uppercase font-bold tracking-wider">AP Disbursements cash clearance ledger office</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-mono font-black border border-black p-1 px-3 bg-white">CHECK VOUCHER</span>
                    <span className="block text-xs font-mono font-bold mt-1.5">CV ID: {viewingVoucher.id}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                <div className="grid grid-cols-4 gap-3 text-[11px] font-bold min-w-[480px]">
                  <div className="col-span-2 border-r border-slate-300 pr-2">
                    <span className="text-[9px] text-slate-500 uppercase block">PAYEE PARTNER</span>
                    <span className="text-sm uppercase text-black font-black">{viewingVoucher.payeeName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">VOUCHER DATE</span>
                    <span>{viewingVoucher.date}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">CHECK SERIAL NO.</span>
                    <span className="font-mono text-xs">{viewingVoucher.checkNumber} ({viewingVoucher.bankName})</span>
                  </div>
                </div>
                </div>

                {/* Accounting breakdowns */}
                <div className="border border-black bg-white rounded-lg overflow-hidden mt-2">
                  <div className="overflow-x-auto">
<table className="w-full text-[10px] text-left border-collapse">
                    <thead className="bg-slate-100 uppercase font-black border-b border-black">
                      <tr>
                        <th className="p-2 border-r border-black">PARTICULARS / ACCOUNT DESCRIPTION</th>
                        <th className="p-2 text-right border-r border-black w-24">DEBIT (DR)</th>
                        <th className="p-2 text-right w-24">CREDIT (CR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {viewingVoucher.paymentType === 'Invoice Clearance' ? (
                        <>
                          <tr>
                            <td className="p-2 border-r border-black">Accounts Payable - {viewingVoucher.payeeName} (Contra-Liability)</td>
                            <td className="p-2 text-right border-r border-black font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                            <td className="p-2 text-right text-slate-400">-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-black pl-5">Cash in Bank - {viewingVoucher.bankName} (Asset clearance)</td>
                            <td className="p-2 text-right border-r border-black text-slate-400">-</td>
                            <td className="p-2 text-right font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                          </tr>
                        </>
                      ) : viewingVoucher.paymentType === 'Advance' ? (
                        <>
                          <tr>
                            <td className="p-2 border-r border-black">Advances to Suppliers - Prepayment Assets</td>
                            <td className="p-2 text-right border-r border-black font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                            <td className="p-2 text-right text-slate-400">-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-black pl-5">Cash in Bank - {viewingVoucher.bankName}</td>
                            <td className="p-2 text-right border-r border-black text-slate-400">-</td>
                            <td className="p-2 text-right font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr>
                            <td className="p-2 border-r border-black">Operating Expenses - Direct Expense Debit</td>
                            <td className="p-2 text-right border-r border-black font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                            <td className="p-2 text-right text-slate-400">-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-black pl-5">Cash in Bank - {viewingVoucher.bankName}</td>
                            <td className="p-2 text-right border-r border-black text-slate-400">-</td>
                            <td className="p-2 text-right font-bold">₱{viewingVoucher.amount.toLocaleString('en-PH')}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
</div>
                </div>

                {/* Amount in words */}
                <div className="bg-slate-100 p-2 text-[10px] font-bold font-mono">
                  <span className="text-[9px] text-slate-500 uppercase block">AMOUNT IN WORDS</span>
                  <span className="text-black">{numberToWords(viewingVoucher.amount)}</span>
                </div>

                {/* Sign-off signatures block */}
                <div className="grid grid-cols-3 gap-3 pt-5 text-[10px] text-center uppercase font-bold text-slate-600 font-sans">
                  <div>
                    <div className="border-b border-black pb-2 text-black font-extrabold">{viewingVoucher.checkedBy}</div>
                    <span className="block mt-1">Prepared / Checked By</span>
                  </div>
                  <div>
                    <div className="border-b border-black pb-2 text-black font-extrabold">{viewingVoucher.approvedBy}</div>
                    <span className="block mt-1">Authorized Audit Approval</span>
                  </div>
                  <div>
                    <div className="border-b border-black pb-2 text-slate-400 italic">Waiting...</div>
                    <span className="block mt-1">Recipient Supplier Signature</span>
                  </div>
                </div>
              </div>

              {/* CORPORATE REALISTIC PHYSICAL CHECK LAYOUT DESIGN */}
              <div className="space-y-2 border-t pt-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Standard Bank Check Physical Layout Preview</span>
                <div className="border-4 border-dashed border-amber-900 bg-[#F5F2EB] p-5 rounded-2xl relative text-black h-48 flex flex-col justify-between font-serif">
                  <div className="flex justify-between items-start text-xs border-b border-orange-200 pb-1.5">
                    <div>
                      <span className="font-extrabold tracking-tight uppercase block text-[10px]">{viewingVoucher.bankName}</span>
                      <span className="text-[7px] text-slate-600 uppercase block font-sans">Corporate clearing desk branch, Philippines</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[9px] font-bold">CHECK NO. {viewingVoucher.checkNumber}</span>
                      <span className="block font-mono text-[9.5px] mt-1">Date: {viewingVoucher.date}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 pr-1 font-bold">
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[8px] font-sans text-slate-500 uppercase shrink-0">Pay Against this check to:</span>
                      <span className="border-b border-orange-200 flex-1 uppercase px-2 font-black tracking-side">{viewingVoucher.payeeName}</span>
                      <div className="border-2 border-orange-300 p-1 bg-white font-mono font-black text-right min-w-[120px] rounded shrink-0">
                        ₱{viewingVoucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-sans text-slate-500 uppercase shrink-0">Pesos sum:</span>
                      <span className="border-b border-orange-200 flex-1 uppercase px-1 text-[9px] italic truncate">{numberToWords(viewingVoucher.amount)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-end text-[7px] font-sans font-bold text-slate-600 mt-2">
                    <span className="font-mono text-center tracking-widest text-xs">⑆ 0128912 ⑆ 299012 ⑈ 998012 ⑈ 21</span>
                    <div className="text-center min-w-[160px]">
                      <div className="border-b border-orange-200 pb-1 italic font-serif text-[10px] text-black">DISBURSEMENT OFFICE</div>
                      <span className="uppercase block mt-0.5 font-semibold text-[7px]">Authorized Signatory</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
