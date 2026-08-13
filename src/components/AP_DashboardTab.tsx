import React from 'react';
import { Client, PayableInvoice, BankAccount } from '../types';
import { Landmark, ArrowUpRight, TrendingDown, Hourglass, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface APDashboardTabProps {
  currentClient: Client;
  payableInvoices: PayableInvoice[];
  bankAccounts: BankAccount[];
}

export function APDashboardTab({ currentClient, payableInvoices, bankAccounts }: APDashboardTabProps) {
  // Compute Outstanding & Disputed Payables
  const totalPayables = payableInvoices
    .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const holdInvoicesCount = payableInvoices.filter(i => i.status === 'Hold').length;
  const holdInvoicesAmount = payableInvoices
    .filter(i => i.status === 'Hold')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const totalCashInBanks = bankAccounts.reduce((sum, b) => sum + b.balance, 0);

  // Dynamic Aging calculation based on current date (assume June 14, 2026)
  const currentDate = new Date('2026-06-14');

  const agingBuckets = {
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    days90Plus: 0,
  };

  const supplierAging: Record<string, typeof agingBuckets> = {};

  payableInvoices
    .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
    .forEach(invoice => {
      const dueDate = new Date(invoice.dueDate);
      const diffTime = currentDate.getTime() - dueDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const supplier = invoice.supplierName || 'Unknown Supplier';
      if (!supplierAging[supplier]) {
        supplierAging[supplier] = { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0 };
      }

      if (diffDays <= 0) {
        agingBuckets.current += invoice.totalAmount;
        supplierAging[supplier].current += invoice.totalAmount;
      } else if (diffDays <= 30) {
        agingBuckets.days30 += invoice.totalAmount;
        supplierAging[supplier].days30 += invoice.totalAmount;
      } else if (diffDays <= 60) {
        agingBuckets.days60 += invoice.totalAmount;
        supplierAging[supplier].days60 += invoice.totalAmount;
      } else if (diffDays <= 90) {
        agingBuckets.days90 += invoice.totalAmount;
        supplierAging[supplier].days90 += invoice.totalAmount;
      } else {
        agingBuckets.days90Plus += invoice.totalAmount;
        supplierAging[supplier].days90Plus += invoice.totalAmount;
      }
    });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  };

  return (
    <div className="flex flex-col gap-6" id="ap-dashboard-tab">
      {/* 1. AP Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Outstanding AP</span>
            <span className="text-xl font-black text-slate-800 dark:text-slate-100">{formatCurrency(totalPayables)}</span>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-2xl shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Available Cash in Banks</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCashInBanks)}</span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-2xl shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm flex items-center justify-between col-span-1 md:col-span-2">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Disputed / Hold Invoices</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-amber-600 dark:text-amber-400">{formatCurrency(holdInvoicesAmount)}</span>
              <span className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
                {holdInvoicesCount} invoices
              </span>
            </div>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-2xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Unified Bank Accounts Hub */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-3xl p-6">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Landmark className="w-4 h-4 text-blue-500" />
          Bank Accounts & Available Balances
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bankAccounts.map(bank => (
            <div key={bank.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block">{bank.bankName}</span>
                <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono block mt-0.5">Account: {bank.accountNumber}</span>
              </div>
              <div className="text-right">
                <span className={`text-md font-extrabold block ${bank.balance < 1000000 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
                  {formatCurrency(bank.balance)}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider">Cleared Liquid Fund</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Interactive AP Aging Report */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5">
          <div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-indigo-500" />
              Accounts Payable Aging Schedule
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Outstanding liability invoices aging based on relative due dates. Standard brackets shown.
            </p>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono px-3 py-1 rounded-full mt-2 sm:mt-0 font-bold">
            As of June 14, 2026
          </span>
        </div>

        {/* Global Progress Bars */}
        <div className="grid grid-cols-5 gap-3.5 mb-6 text-center">
          {[
            { label: 'Current', val: agingBuckets.current, color: 'bg-emerald-500' },
            { label: '1 - 30 Days', val: agingBuckets.days30, color: 'bg-blue-500' },
            { label: '31 - 60 Days', val: agingBuckets.days60, color: 'bg-indigo-500' },
            { label: '61 - 90 Days', val: agingBuckets.days90, color: 'bg-amber-500' },
            { label: '90+ Days Due', val: agingBuckets.days90Plus, color: 'bg-rose-500' },
          ].map((item, idx) => {
            const pct = totalPayables > 0 ? (item.val / totalPayables) * 100 : 0;
            return (
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-2xl relative overflow-hidden">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">{item.label}</span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 block mt-1">{formatCurrency(item.val)}</span>
                <span className="text-[9px] text-slate-400 block mt-0.5">{pct.toFixed(0)}% of Total</span>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800">
                  <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Supplier Breakdown Table */}
        <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="p-3.5 pr-1">Supplier / Payee</th>
                <th className="p-3.5 text-right font-semibold">Current</th>
                <th className="p-3.5 text-right font-semibold">1-30 Days</th>
                <th className="p-3.5 text-right font-semibold">31-60 Days</th>
                <th className="p-3.5 text-right font-semibold">61-90 Days</th>
                <th className="p-3.5 text-right font-semibold">90+ Days</th>
                <th className="p-3.5 text-right font-black text-slate-700 dark:text-slate-300">Total Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {Object.keys(supplierAging).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    No outstanding vendor/supplier invoices found.
                  </td>
                </tr>
              ) : (
                Object.entries(supplierAging).map(([supplier, aging]) => {
                  const sTotal = aging.current + aging.days30 + aging.days60 + aging.days90 + aging.days90Plus;
                  return (
                    <tr key={supplier} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">{supplier}</td>
                      <td className="p-3.5 text-right text-slate-600 dark:text-slate-400">{formatCurrency(aging.current)}</td>
                      <td className="p-3.5 text-right text-slate-600 dark:text-slate-400">{formatCurrency(aging.days30)}</td>
                      <td className="p-3.5 text-right text-slate-600 dark:text-slate-400">{formatCurrency(aging.days60)}</td>
                      <td className="p-3.5 text-right text-slate-600 dark:text-slate-400">{formatCurrency(aging.days90)}</td>
                      <td className="p-3.5 text-right text-red-500 dark:text-rose-400 font-semibold">{formatCurrency(aging.days90Plus)}</td>
                      <td className="p-3.5 text-right font-black text-slate-800 dark:text-slate-200">{formatCurrency(sTotal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
