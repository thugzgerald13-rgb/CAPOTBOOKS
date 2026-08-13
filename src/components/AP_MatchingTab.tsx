import React, { useState } from 'react';
import { Client, PurchaseOrder, ReceivingReport, PayableInvoice, PayableInvoiceItem, WithholdingTaxEntry } from '../types';
import { ShoppingBag, Eye, Plus, Check, Play, AlertCircle, Ban, ArrowRight, ShieldCheck } from 'lucide-react';

interface APMatchingTabProps {
  currentClient: Client;
  purchaseOrders: PurchaseOrder[];
  receivingReports: ReceivingReport[];
  payableInvoices: PayableInvoice[];
  withholdingTaxEntries: WithholdingTaxEntry[];
  onSaveCurrentClient: (updatedClient: Client) => void | Promise<void>;
  showToast: (msg: string) => void;
}

export function APMatchingTab({
  currentClient,
  purchaseOrders,
  receivingReports,
  payableInvoices,
  withholdingTaxEntries,
  onSaveCurrentClient,
  showToast,
}: APMatchingTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'pos' | 'rrs'>('invoices');

  // Form State: Purchase Order
  const [showPOForm, setShowPOForm] = useState(false);
  const [poSupplier, setPoSupplier] = useState('');
  const [poItemCode, setPoItemCode] = useState('');
  const [poItemDesc, setPoItemDesc] = useState('');
  const [poQty, setPoQty] = useState(1);
  const [poPrice, setPoPrice] = useState(0);

  // Form State: Receiving Report
  const [showRRForm, setShowRRForm] = useState(false);
  const [rrPoId, setRrPoId] = useState('');
  const [rrReceivedBy, setRrReceivedBy] = useState('');
  const [rrItemQtyReceived, setRrItemQtyReceived] = useState<Record<string, number>>({});

  // Form State: Supplier Invoice
  const [showSIForm, setShowSIForm] = useState(false);
  const [siInvoiceNum, setSiInvoiceNum] = useState('');
  const [siPoId, setSiPoId] = useState('');
  const [siRrId, setSiRrId] = useState('');
  const [siSupplier, setSiSupplier] = useState('');
  const [siItemQty, setSiItemQty] = useState<Record<string, number>>({});
  const [siItemPrice, setSiItemPrice] = useState<Record<string, number>>({});
  const [siWhtId, setSiWhtId] = useState('');
  const [siIsVatable, setSiIsVatable] = useState(true);

  // Formatting helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  };

  // Add Purchase Order
  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplier.trim() || !poItemCode.trim()) return;

    const poId = `PO-2026-${String(purchaseOrders.length + 1).padStart(4, '0')}`;
    const poItem = {
      itemCode: poItemCode.trim().toUpperCase(),
      description: poItemDesc.trim() || 'Inventory Supplies',
      qty: poQty,
      unitPrice: poPrice,
    };

    const newPO: PurchaseOrder = {
      id: poId,
      date: new Date().toISOString().split('T')[0],
      supplierId: 'SUP-' + Date.now().toString().slice(-4),
      supplierName: poSupplier.trim(),
      items: [poItem],
      totalAmount: poQty * poPrice,
      status: 'Approved',
    };

    const updatedClient = {
      ...currentClient,
      purchaseOrders: [...purchaseOrders, newPO],
    };

    await onSaveCurrentClient(updatedClient);
    setShowPOForm(false);
    setPoSupplier('');
    setPoItemCode('');
    setPoItemDesc('');
    setPoQty(1);
    setPoPrice(0);
    showToast(`Created & Approved ${poId}`);
  };

  // Click handler to prepopulate Receiving Report with PO values
  const handleOpenRRForm = (po: PurchaseOrder) => {
    setRrPoId(po.id);
    const initialQtys: Record<string, number> = {};
    po.items.forEach(item => {
      initialQtys[item.itemCode] = item.qty; // default to 100% matched receive
    });
    setRrItemQtyReceived(initialQtys);
    setShowRRForm(true);
  };

  const handleCreateRR = async (e: React.FormEvent) => {
    e.preventDefault();
    const po = purchaseOrders.find(p => p.id === rrPoId);
    if (!po) return;

    const rrId = `RR-2026-${String(receivingReports.length + 1).padStart(4, '0')}`;
    const rrItems = po.items.map(item => ({
      itemCode: item.itemCode,
      description: item.description,
      qtyOrdered: item.qty,
      qtyReceived: rrItemQtyReceived[item.itemCode] || 0,
      unitPrice: item.unitPrice,
    }));

    const rrTotal = rrItems.reduce((acc, item) => acc + item.qtyReceived * item.unitPrice, 0);

    const newRR: ReceivingReport = {
      id: rrId,
      date: new Date().toISOString().split('T')[0],
      poId: po.id,
      supplierName: po.supplierName,
      items: rrItems,
      totalAmount: rrTotal,
      receivedBy: rrReceivedBy.trim() || 'Warehouse Clerk',
    };

    // Update PO status
    const updatedPOs = purchaseOrders.map(p => (p.id === po.id ? { ...p, status: 'Received' as const } : p));

    const updatedClient = {
      ...currentClient,
      purchaseOrders: updatedPOs,
      receivingReports: [...receivingReports, newRR],
    };

    await onSaveCurrentClient(updatedClient);
    setShowRRForm(false);
    setRrPoId('');
    setRrReceivedBy('');
    setRrItemQtyReceived({});
    showToast(`Saved Goods Receiving Report ${rrId}`);
  };

  // Prepopulate invoice form based on RR
  const handleOpenSIForm = (rr: ReceivingReport) => {
    setSiRrId(rr.id);
    setSiPoId(rr.poId);
    setSiSupplier(rr.supplierName);
    
    // Set quantities and price from RR
    const initialQtys: Record<string, number> = {};
    const initialPrices: Record<string, number> = {};
    rr.items.forEach(item => {
      initialQtys[item.itemCode] = item.qtyReceived;
      initialPrices[item.itemCode] = item.unitPrice;
    });
    setSiItemQty(initialQtys);
    setSiItemPrice(initialPrices);
    setShowSIForm(true);
  };

  const handleCreateSI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siInvoiceNum.trim()) return;

    let subtotal = 0;
    const items: PayableInvoiceItem[] = Object.entries(siItemQty).map(([code, qty]) => {
      const q = Number(qty);
      const price = Number(siItemPrice[code] || 0);
      subtotal += q * price;
      return {
        itemCode: code,
        description: `Billed supplies for ${code}`,
        qty: q,
        unitPrice: price,
      };
    });

    const isVat = siIsVatable;
    const vatAmount = isVat ? subtotal * 0.12 : 0;
    let whtAmount = 0;
    
    if (siWhtId) {
      const selectedWht = withholdingTaxEntries.find(w => w.id === siWhtId);
      if (selectedWht) {
        whtAmount = subtotal * selectedWht.taxRate;
      }
    }

    const netInvoiceTotal = subtotal + vatAmount - whtAmount;

    const newInvoice: PayableInvoice = {
      id: `AP-INV-${Date.now().toString().slice(-4)}`,
      invoiceNumber: siInvoiceNum.trim(),
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30-day term
      poId: siPoId || undefined,
      rrId: siRrId || undefined,
      supplierId: 'SUP-' + Date.now().toString().slice(-4),
      supplierName: siSupplier,
      items,
      subtotal,
      vatAmount,
      isVatable: isVat,
      withholdingTaxId: siWhtId || undefined,
      whtAmount,
      totalAmount: netInvoiceTotal,
      status: 'Unmatched',
    };

    const updatedClient = {
      ...currentClient,
      payableInvoices: [...payableInvoices, newInvoice],
    };

    await onSaveCurrentClient(updatedClient);
    setShowSIForm(false);
    setSiInvoiceNum('');
    setSiPoId('');
    setSiRrId('');
    setSiSupplier('');
    setCurrentClientInvoiceQtysAndPrices();
    showToast(`Draft Invoice ${newInvoice.invoiceNumber} Saved`);
  };

  const setCurrentClientInvoiceQtysAndPrices = () => {
    setSiItemQty({});
    setSiItemPrice({});
    setSiWhtId('');
  };

  // Central Core Feature: Three-Way Match Examination execution
  const executeThreeWayMatch = async (invoice: PayableInvoice) => {
    if (!invoice.poId || !invoice.rrId) {
      showToast('No linked PO and RR found to perform 3-Way Match.');
      return;
    }

    const po = purchaseOrders.find(p => p.id === invoice.poId);
    const rr = receivingReports.find(r => r.id === invoice.rrId);

    if (!po || !rr) {
      showToast('Associated Purchase Order or Receiving Report is missing.');
      return;
    }

    // Run Comparison
    let matchSuccessful = true;
    let discrepancies: string[] = [];

    invoice.items.forEach(siItem => {
      const poItem = po.items.find(pi => pi.itemCode === siItem.itemCode);
      const rrItem = rr.items.find(ri => ri.itemCode === siItem.itemCode);

      if (!poItem) {
        matchSuccessful = false;
        discrepancies.push(`Item ${siItem.itemCode} does not exist on PO ${po.id}`);
      } else if (siItem.unitPrice !== poItem.unitPrice) {
        matchSuccessful = false;
        discrepancies.push(`Price mismatch for ${siItem.itemCode}: Invoice=₱${siItem.unitPrice}, PO=₱${poItem.unitPrice}`);
      }

      if (!rrItem) {
        matchSuccessful = false;
        discrepancies.push(`Item ${siItem.itemCode} was never received in RR ${rr.id}`);
      } else if (siItem.qty !== rrItem.qtyReceived) {
        matchSuccessful = false;
        discrepancies.push(`Qty mismatch for ${siItem.itemCode}: Invoice billed ${siItem.qty}, RR received ${rrItem.qtyReceived}`);
      }
    });

    const newStatus = matchSuccessful ? 'Matched' : 'Discrepancy';
    const discDetails = matchSuccessful ? undefined : discrepancies.join('; ');

    const updatedInvoices = payableInvoices.map(i => {
      if (i.id === invoice.id) {
        return {
          ...i,
          status: newStatus as any,
          discrepancyDetails: discDetails,
        };
      }
      return i;
    });

    const updatedClient = {
      ...currentClient,
      payableInvoices: updatedInvoices,
    };

    await onSaveCurrentClient(updatedClient);
    if (matchSuccessful) {
      showToast(`✅ PERFECT MATCH! Invoice ${invoice.invoiceNumber} verified & matched successfully.`);
    } else {
      showToast(`🚨 DISCREPANCY SEEN! Billed invoice disagrees with orders/receiving docs.`);
    }
  };

  // Approve a matched or holding invoice
  const handleApproveInvoice = async (invoiceId: string) => {
    const updatedInvoices = payableInvoices.map(i => {
      if (i.id === invoiceId) {
        return { ...i, status: 'Approved' as const };
      }
      return i;
    });

    const updatedClient = {
      ...currentClient,
      payableInvoices: updatedInvoices,
    };

    await onSaveCurrentClient(updatedClient);
    showToast('Invoice approved for disbursement payments desk.');
  };

  // Hold or Dispute Invoice
  const handleToggleHoldInvoice = async (invoice: PayableInvoice) => {
    const isHold = invoice.status === 'Hold';
    const targetStatus = isHold ? 'Unmatched' as const : 'Hold' as const;

    const updatedInvoices = payableInvoices.map(i => {
      if (i.id === invoice.id) {
        return { ...i, status: targetStatus };
      }
      return i;
    });

    const updatedClient = {
      ...currentClient,
      payableInvoices: updatedInvoices,
    };

    await onSaveCurrentClient(updatedClient);
    if (!isHold) {
      showToast(`🚫 Invoice ${invoice.invoiceNumber} put on HOLD. Blocked from releases.`);
    } else {
      showToast(`🔓 Hold released for invoice ${invoice.invoiceNumber}. Ready for matches.`);
    }
  };

  return (
    <div className="space-y-6" id="ap-matching-tab">
      {/* Tab select Buttons */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 pb-px gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
        <button
          onClick={() => { setActiveSubTab('invoices'); setShowPOForm(false); setShowRRForm(false); setShowSIForm(false); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeSubTab === 'invoices' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-500'}`}
        >
          Supplier Invoices ({payableInvoices.length})
        </button>
        <button
          onClick={() => { setActiveSubTab('pos'); setShowPOForm(false); setShowRRForm(false); setShowSIForm(false); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeSubTab === 'pos' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-500'}`}
        >
          Purchase Orders ({purchaseOrders.length})
        </button>
        <button
          onClick={() => { setActiveSubTab('rrs'); setShowPOForm(false); setShowRRForm(false); setShowSIForm(false); }}
          className={`pb-2.5 px-1 border-b-2 transition-all ${activeSubTab === 'rrs' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-500'}`}
        >
          Receiving Reports ({receivingReports.length})
        </button>
      </div>

      {/* SUB-TAB 1: SUPPLIER INVOICES */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-4">
          {!showSIForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Billed Accounts Payable Invoices</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Manage direct invoices or 3-way match bills with active POs/Goods receipt reports.
                  </p>
                </div>
                <button
                  onClick={() => setShowSIForm(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Direct Invoice</span>
                </button>
              </div>

              {/* Invoices List */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-3">Invoice / Ref</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Linked PO/RR</th>
                      <th className="p-3 text-right">Amnt (Net EWT)</th>
                      <th className="p-3">Match Status</th>
                      <th className="p-3 text-center">Desk Releases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {payableInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-slate-400 font-bold">
                          No billed invoices recorded. Create a Purchase Order and receive goods first!
                        </td>
                      </tr>
                    ) : (
                      payableInvoices.map(si => {
                        const hasMatchingLinks = si.poId && si.rrId;
                        return (
                          <tr key={si.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <td className="p-3">
                              <span className="font-bold text-slate-700 dark:text-slate-200 block truncate max-w-[120px]" title={si.invoiceNumber}>
                                {si.invoiceNumber}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">Due: {si.dueDate}</span>
                            </td>
                            <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">{si.supplierName}</td>
                            <td className="p-3">
                              {hasMatchingLinks ? (
                                <div className="space-y-0.5">
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono px-1.5 py-0.5 rounded block w-fit">
                                    {si.poId}
                                  </span>
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono px-1.5 py-0.5 rounded block w-fit">
                                    {si.rrId}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No Match documents link</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-black text-slate-700 dark:text-slate-300">
                              {formatCurrency(si.totalAmount)}
                              {si.whtAmount && si.whtAmount > 0 ? (
                                <span className="text-[9px] text-amber-600 block font-normal" title="EWT Tax deducted prior to release">
                                  -₱{si.whtAmount.toFixed(0)} WHT
                                </span>
                              ) : null}
                            </td>
                            <td className="p-3">
                              {/* Status badge */}
                              {si.status === 'Hold' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 font-bold px-2 py-0.5 rounded-full uppercase border border-purple-100 dark:border-purple-900/40">
                                  🚫 Disputed / Hold
                                </span>
                              ) : si.status === 'Paid' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase border border-emerald-100 dark:border-emerald-900/40">
                                  ✓ Paid
                                </span>
                              ) : si.status === 'Matched' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase border border-emerald-100 dark:border-emerald-900/40">
                                  ✓ Matched (3-Way)
                                </span>
                              ) : si.status === 'Approved' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-450 px-2 py-0.5 rounded-full font-bold uppercase border border-sky-100 dark:border-sky-900/40">
                                  Approved for Clearance
                                </span>
                              ) : si.status === 'Discrepancy' ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-450 font-bold px-2 py-0.5 rounded-full uppercase border border-rose-100 dark:border-rose-900/40">
                                    ⚠️ Discrepancy Found
                                  </span>
                                  <p className="text-[9px] text-red-500 leading-tight max-w-[150px] font-mono whitespace-pre-wrap">
                                    {si.discrepancyDetails}
                                  </p>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500 font-bold px-2 py-0.5 rounded-full uppercase">
                                  Unmatched
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {si.status !== 'Paid' && si.status !== 'Cancelled' && (
                                  <>
                                    {hasMatchingLinks && si.status !== 'Matched' && si.status !== 'Approved' && (
                                      <button
                                        onClick={() => executeThreeWayMatch(si)}
                                        className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 rounded-lg font-bold"
                                        title="Run Three-Way Match"
                                      >
                                        <Play className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {si.status !== 'Approved' && (
                                      <button
                                        onClick={() => handleApproveInvoice(si.id)}
                                        disabled={si.status === 'Hold'}
                                        className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-600 rounded-lg disabled:opacity-30 disabled:pointer-events-none"
                                        title="Direct Approve"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleToggleHoldInvoice(si)}
                                      className={`p-1.5 rounded-lg font-bold ${si.status === 'Hold' ? 'hover:bg-green-50 text-emerald-600' : 'hover:bg-purple-50 text-purple-600'}`}
                                      title={si.status === 'Hold' ? 'Release Block' : 'Dispute Hold'}
                                    >
                                      {si.status === 'Hold' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Log Direct Invoice Form */
            <form onSubmit={handleCreateSI} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-850 p-5 rounded-2xl flex flex-col gap-4">
              <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Log Supplier Billing Invoice</h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Invoice Number *</label>
                  <input
                    type="text"
                    value={siInvoiceNum}
                    onChange={(e) => setSiInvoiceNum(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. SI-12891"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Supplier / Payee Name *</label>
                  <input
                    type="text"
                    value={siSupplier}
                    onChange={(e) => setSiSupplier(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. Apex Corp"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned Withholding Tax (BIR EWT)</label>
                  <select
                    value={siWhtId}
                    onChange={(e) => setSiWhtId(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                  >
                    <option value="">No Withholding Deductible</option>
                    {withholdingTaxEntries.map(w => (
                      <option key={w.id} value={w.id}>{w.atcCode} - {w.description} ({w.taxRate * 100}%)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Invoice Item Code</label>
                  <input
                    type="text"
                    placeholder="e.g. SUP-OFFICE"
                    className="form-input w-full p-2 text-xs"
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      if (code) {
                        setSiItemQty(prev => ({ ...prev, [code]: prev[code] || 1 }));
                        setSiItemPrice(prev => ({ ...prev, [code]: prev[code] || 1000 }));
                      }
                    }}
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={siIsVatable}
                      onChange={(e) => setSiIsVatable(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    Subtract output 12% vatable input tax claimable
                  </label>
                </div>
              </div>

              {Object.keys(siItemQty).length > 0 && (
                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl space-y-2">
                  <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Item details configuration</h6>
                  {Object.keys(siItemQty).map(c => (
                    <div key={c} className="flex items-center gap-3 text-xs">
                      <span className="font-bold w-24 text-slate-700 dark:text-slate-300">{c}</span>
                      <div className="flex items-center gap-1.5">
                        <span>Quantity:</span>
                        <input
                          type="number"
                          value={siItemQty[c]}
                          min={1}
                          onChange={(e) => setSiItemQty(prev => ({ ...prev, [c]: Number(e.target.value) }))}
                          className="form-input w-16 p-1 text-xs text-center"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>Price/Unit:</span>
                        <input
                          type="number"
                          value={siItemPrice[c]}
                          onChange={(e) => setSiItemPrice(prev => ({ ...prev, [c]: Number(e.target.value) }))}
                          className="form-input w-24 p-1 text-xs text-center"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSIForm(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Save Draft Invoice
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* SUB-TAB 2: PURCHASE ORDERS */}
      {activeSubTab === 'pos' && (
        <div className="space-y-4">
          {!showPOForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Approved Purchase Orders (PO)</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Procure materials with pre-approved rates to control subsequent bill reconciliation.
                  </p>
                </div>
                <button
                  onClick={() => setShowPOForm(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Raise Purchase Order</span>
                </button>
              </div>

              {/* PO table */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-3">PO Reference ID</th>
                      <th className="p-3">Date Drafted</th>
                      <th className="p-3">Vendor / Supplier</th>
                      <th className="p-3">Procured items summary</th>
                      <th className="p-3 text-right font-semibold">Total PO Valuation</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {purchaseOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-slate-400 font-bold">
                          No active Purchase Orders. Create a new PO above to initiate procurement.
                        </td>
                      </tr>
                    ) : (
                      purchaseOrders.map(po => (
                        <tr key={po.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-mono font-black text-slate-800 dark:text-slate-200">{po.id}</td>
                          <td className="p-3 text-slate-500">{po.date}</td>
                          <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{po.supplierName}</td>
                          <td className="p-3 font-mono text-[11px] text-slate-400">
                            {po.items.map(i => `${i.qty}x ${i.itemCode} (@₱${i.unitPrice})`).join(', ')}
                          </td>
                          <td className="p-3 text-right font-extrabold text-slate-800 dark:text-slate-100">
                            {formatCurrency(po.totalAmount)}
                          </td>
                          <td className="p-3 text-center">
                            {po.status === 'Received' ? (
                              <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-2 py-0.5 rounded-full uppercase">
                                Received
                              </span>
                            ) : (
                              <button
                                onClick={() => handleOpenRRForm(po)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg text-[10px] transition-all flex items-center gap-1 mx-auto"
                              >
                                <span>Receive Goods</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* PO Creation form */
            <form onSubmit={handleCreatePO} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-855 p-5 rounded-2xl flex flex-col gap-4">
              <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Raise & Approve New Purchase Order</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vendor Supplier *</label>
                  <input
                    type="text"
                    value={poSupplier}
                    onChange={(e) => setPoSupplier(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. Apex Corp"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Item SKU / Code *</label>
                  <input
                    type="text"
                    value={poItemCode}
                    onChange={(e) => setPoItemCode(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. SUP-INK-BLACK"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Item Description</label>
                  <input
                    type="text"
                    value={poItemDesc}
                    onChange={(e) => setPoItemDesc(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="Office Ink Cartridges"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quantity Requested *</label>
                  <input
                    type="number"
                    value={poQty}
                    onChange={(e) => setPoQty(Math.max(1, Number(e.target.value)))}
                    className="form-input w-full p-2 text-xs"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Unit Price Tag *</label>
                  <input
                    type="number"
                    value={poPrice}
                    onChange={(e) => setPoPrice(Math.max(0, Number(e.target.value)))}
                    className="form-input w-full p-2 text-xs"
                    min={0}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPOForm(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Raise Approved PO
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* SUB-TAB 3: RECEIVING REPORTS */}
      {activeSubTab === 'rrs' && (
        <div className="space-y-4">
          {!showRRForm ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Warehouse Receiving Reports</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Document actual quantity of goods received from supplier delivery receipts for reconciliation checking.
                </p>
              </div>

              {/* RRs Table */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 uppercase text-[10px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-3">RR Number</th>
                      <th className="p-3">Linked PO</th>
                      <th className="p-3">Received Date</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Quantities received summary</th>
                      <th className="p-3 text-center">Invoicing Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {receivingReports.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-slate-400 font-bold">
                          No active Warehouse Goods Receiving reports. Initiate a goods receive action on approved Purchase Orders!
                        </td>
                      </tr>
                    ) : (
                      receivingReports.map(rr => {
                        const alreadyInvoiced = payableInvoices.some(si => si.rrId === rr.id);
                        return (
                          <tr key={rr.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <td className="p-3 font-mono font-black text-slate-800 dark:text-slate-200">{rr.id}</td>
                            <td className="p-3 font-mono font-bold text-slate-500">{rr.poId}</td>
                            <td className="p-3 text-slate-500">{rr.date}</td>
                            <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">{rr.supplierName}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-400">
                              {rr.items.map(i => `${i.itemCode}: ${i.qtyReceived} received (Ordered ${i.qtyOrdered})`).join(', ')}
                            </td>
                            <td className="p-3 text-center">
                              {alreadyInvoiced ? (
                                <span className="text-[10px] text-emerald-600 font-bold border border-emerald-100 dark:border-emerald-950 bg-emerald-50/50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-full">
                                  Invoiced Already
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleOpenSIForm(rr)}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] transition-all flex items-center gap-1 mx-auto"
                                >
                                  <span>Generate Invoice</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* RR creation form */
            <form onSubmit={handleCreateRR} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-855 p-5 rounded-2xl flex flex-col gap-4">
              <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Goods Receiving Report - PO {rrPoId}</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Linked Purchase Order ID *</label>
                  <input
                    type="text"
                    value={rrPoId}
                    disabled
                    className="form-input w-full p-2 text-xs bg-slate-100 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Receiving Warehouse Officer Name *</label>
                  <input
                    type="text"
                    value={rrReceivedBy}
                    onChange={(e) => setRrReceivedBy(e.target.value)}
                    className="form-input w-full p-2 text-xs"
                    placeholder="e.g. John Doe (Logistics)"
                    required
                  />
                </div>
              </div>

              {/* Received quantites breakdown */}
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Item delivery quantities check</h6>
                {purchaseOrders.find(p => p.id === rrPoId)?.items.map(item => (
                  <div key={item.itemCode} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 pt-1 border-b border-slate-50 pb-2">
                    <div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">{item.itemCode} - {item.description}</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">PO Ordered: {item.qty} units</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-semibold">Qty actually received:</span>
                      <input
                        type="number"
                        value={rrItemQtyReceived[item.itemCode] !== undefined ? rrItemQtyReceived[item.itemCode] : item.qty}
                        max={item.qty + 10}
                        min={0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setRrItemQtyReceived(prev => ({ ...prev, [item.itemCode]: val }));
                        }}
                        className="form-input w-24 p-1 text-xs text-center font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRRForm(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Approve Cargo Arrival (RR)
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
