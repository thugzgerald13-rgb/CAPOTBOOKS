/**
 * ReceiptPrint — printable cashier receipt for the pharmacy POS.
 *
 * Rendered inside the receipt modal and marked `.print-area` so the existing
 * `@media print` rules in src/index.css isolate it on paper (thermal-roll
 * style, monospace, narrow width). Print via window.print() from the modal.
 */
import type { PosTransaction } from '../../lib/pos/types';
import { peso } from '../../lib/pos/tax';
import { sellingUnitLabel } from '../../lib/pos/units';

export interface PosBusinessInfo {
  name: string;
  tin?: string;
  address?: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

export function ReceiptPrint({ tx, business }: { tx: PosTransaction; business: PosBusinessInfo }) {
  const discountLabel =
    tx.customer.type === 'senior'
      ? `Senior Citizen Discount (20%)`
      : tx.customer.type === 'pwd'
        ? `PWD Discount (20%)`
        : null;

  return (
    <div className="print-area bg-white text-slate-900 text-[12px] leading-snug font-mono rounded-lg p-4 max-w-sm mx-auto">
      <div className="text-center border-b border-dashed border-slate-300 pb-2 mb-2">
        <div className="font-bold text-sm">{business.name || 'CAPOTBOOKS Pharmacy'}</div>
        {business.address && <div className="text-[11px] text-slate-600">{business.address}</div>}
        {business.tin && <div className="text-[11px] text-slate-600">TIN: {business.tin}</div>}
        <div className="mt-1 font-bold tracking-wide">SALES INVOICE / OFFICIAL RECEIPT</div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mb-2">
        <span>Receipt No:</span><span className="text-right font-bold">{tx.receiptNo}</span>
        <span>Date:</span><span className="text-right">{fmtDate(tx.createdAt)}</span>
        <span>Cashier:</span><span className="text-right">{tx.cashier}</span>
        <span>Payment:</span><span className="text-right">{tx.paymentMethod}</span>
      </div>

      {(tx.customer.name || tx.customer.idNo || tx.customer.type !== 'regular') && (
        <div className="border-b border-dashed border-slate-300 pb-2 mb-2 text-[11px]">
          <div className="font-bold uppercase">
            {tx.customer.type === 'senior' ? 'Senior Citizen' : tx.customer.type === 'pwd' ? 'Person With Disability (PWD)' : 'Customer'}
          </div>
          {tx.customer.name && <div>Name: {tx.customer.name}</div>}
          {tx.customer.idType && <div>ID Type: {tx.customer.idType}</div>}
          {tx.customer.idNo && <div>ID No: {tx.customer.idNo}</div>}
          {tx.customer.tin && <div>TIN: {tx.customer.tin}</div>}
          {tx.customer.address && <div>Address: {tx.customer.address}</div>}
        </div>
      )}

      <table className="w-full text-[11px] mb-2">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="text-left py-0.5">Qty</th>
            <th className="text-left py-0.5">Item</th>
            <th className="text-right py-0.5">Price</th>
            <th className="text-right py-0.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {tx.lines.map((line) => (
            <tr key={line.lineId} className="border-b border-dashed border-slate-200">
              <td className="py-0.5 whitespace-nowrap">
                {line.qty} {sellingUnitLabel(line.sellingUnit)}
              </td>
              <td className="py-0.5 pr-2">
                {line.genericName ? `${line.genericName}${line.brandName ? ` (${line.brandName})` : ''}` : line.name}
              </td>
              <td className="py-0.5 text-right whitespace-nowrap">{peso(line.unitPrice)}</td>
              <td className="py-0.5 text-right whitespace-nowrap">{peso(line.netLine)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between"><span>Gross Amount</span><span>{peso(tx.gross)}</span></div>
        {tx.discountAmount > 0 && (
          <div className="flex justify-between text-rose-700">
            <span>{discountLabel || 'Discount'}</span>
            <span>−{peso(tx.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between"><span>VAT Treatment</span><span>{tx.vatType}</span></div>
        {tx.vatAmount > 0 && <div className="flex justify-between"><span>Output VAT (12%)</span><span>{peso(tx.vatAmount)}</span></div>}
        <div className="flex justify-between font-bold border-t border-slate-300 pt-1 mt-1">
          <span>Total Net</span><span>{peso(tx.net)}</span>
        </div>
        {tx.paymentMethod === 'Cash' && (
          <>
            <div className="flex justify-between"><span>Tendered</span><span>{peso(tx.tendered)}</span></div>
            <div className="flex justify-between"><span>Change</span><span>{peso(tx.change)}</span></div>
          </>
        )}
      </div>

      {tx.status !== 'completed' && (
        <div className="mt-2 text-center font-bold uppercase text-rose-700 border border-rose-300 rounded py-1">
          {tx.status === 'voided' ? 'VOIDED' : 'REFUNDED'}
          {tx.voidReason ? ` — ${tx.voidReason}` : ''}
          {tx.refundReason ? ` — ${tx.refundReason}` : ''}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-[10px] text-center text-slate-600 space-y-1">
        {tx.customer.type !== 'regular' && (
          <div>Discount granted per BIR senior citizen / PWD regulations; customer ID on file.</div>
        )}
        <div>Thank you for your purchase!</div>
      </div>
    </div>
  );
}
