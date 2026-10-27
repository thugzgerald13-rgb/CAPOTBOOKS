// SoaTab.tsx — Statement of Account. Generated from billing invoices + payments.
// NOT for BIR EIS. Only the E-Invoice tab feeds EIS.
import { useMemo, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Field, Input, Select, Button, EmptyState } from './ui';
import { FileDown, Pencil, FileText } from 'lucide-react';
import type { SoaRecord, SoaLine, InvoiceTemplate, BillingInvoice } from '../types';
import { listTemplatesFor, getTemplate } from '../lib/invoiceTemplates';
import { downloadSoaPdf } from '../lib/invoicePdf';
import { toast } from './ui/Toast';
import { TemplateEditor } from './TemplateEditor';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

const money = (n: number) => `₱${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SoaTab() {
  const { currentClient, currentClientId, businessProfile, showToast } = useAccounting();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<InvoiceTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string>('builtin-soa-amber');
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth);
  const [periodTo, setPeriodTo] = useState(today);
  const [generated, setGenerated] = useState<SoaRecord | null>(null);

  const templates = useMemo(() => currentClientId ? listTemplatesFor(currentClientId, 'soa') : [], [currentClientId]);
  const template = useMemo(() => currentClientId ? getTemplate(currentClientId, templateId) : getTemplate('', templateId), [currentClientId, templateId]);

  const invoices: BillingInvoice[] = currentClient?.billingInvoices || [];

  const generate = () => {
    if (!currentClient || !currentClientId) return;
    // Opening balance = unpaid invoices dated before periodFrom
    let opening = 0;
    const lines: SoaLine[] = [];
    let balance = 0;
    const inRange = invoices.filter(i => i.date >= periodFrom && i.date <= periodTo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const inv of invoices) {
      if (inv.date < periodFrom && inv.status !== 'Paid') opening += inv.amount;
    }
    balance = opening;
    for (const inv of inRange) {
      balance += inv.amount;
      lines.push({ date: inv.date, reference: inv.invoiceNo, description: `Invoice — ${inv.customerName}`, debit: inv.amount, credit: 0, balance });
      if (inv.status === 'Paid' && inv.datePaid) {
        balance -= inv.amount;
        lines.push({ date: inv.datePaid, reference: `OR-${inv.invoiceNo}`, description: `Payment received (${inv.paymentType || 'Cash'})`, debit: 0, credit: inv.amount, balance });
      }
    }
    const rec: SoaRecord = {
      id: crypto.randomUUID(), clientId: currentClientId,
      clientName: currentClient.name || currentClient.registeredName || 'Client',
      clientTin: currentClient.tin, clientAddress: currentClient.address,
      periodFrom, periodTo, openingBalance: opening, lines, closingBalance: balance,
      templateId, generatedAt: new Date().toISOString(),
    };
    setGenerated(rec);
    showToast('Statement of Account generated');
  };

  const handleDownloadPdf = () => {
    if (!generated) return;
    try { downloadSoaPdf(generated, businessProfile, template); showToast('SOA PDF downloaded'); }
    catch { toast.error('Failed to generate PDF'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Field label="Template" className="mb-0">
            <div className="flex gap-2">
              <Select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-48">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.builtin ? ' (built-in)' : ''}</option>)}
              </Select>
              <Button variant="outline" size="sm" onClick={() => { setEditingTpl(null); setEditorOpen(true); }}><Pencil className="w-4 h-4" /> Customize</Button>
            </div>
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
        <FileText className="w-4 h-4 mt-0.5 shrink-0" />
        <div><strong>Statement of Account is not transmitted to BIR.</strong> It is a client-facing summary of outstanding balances for a period. Only structured E-Invoices feed the EIS.</div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Period from"><YearDropdownDateInput value={periodFrom} onChange={value => setPeriodFrom(value)} className="input-base" /></Field>
          <Field label="Period to"><YearDropdownDateInput value={periodTo} onChange={value => setPeriodTo(value)} className="input-base" /></Field>
          <div className="flex items-end"><Button variant="primary" onClick={generate}>Generate SOA</Button></div>
        </div>

        {generated ? (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-amber-50 dark:bg-amber-950/30 p-4 flex justify-between items-center flex-wrap gap-2">
              <div>
                <div className="font-bold text-lg">STATEMENT OF ACCOUNT</div>
                <div className="text-xs text-slate-500">{generated.clientName} · {generated.periodFrom} to {generated.periodTo}</div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadPdf}><FileDown className="w-4 h-4" /> Download PDF</Button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 uppercase">
                <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Reference</th><th className="text-left p-2">Description</th><th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th><th className="text-right p-2">Balance</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800"><td className="p-2" colSpan={5}><em>Opening balance</em></td><td className="text-right p-2 font-semibold">{money(generated.openingBalance)}</td></tr>
                {generated.lines.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-xs">No transactions in this period.</td></tr>}
                {generated.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-2 text-xs">{l.date}</td><td className="p-2 text-xs font-mono">{l.reference}</td>
                    <td className="p-2 text-xs">{l.description}</td>
                    <td className="p-2 text-right text-xs">{l.debit ? money(l.debit) : '—'}</td>
                    <td className="p-2 text-right text-xs">{l.credit ? money(l.credit) : '—'}</td>
                    <td className="p-2 text-right text-xs font-semibold">{money(l.balance)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-amber-50 dark:bg-amber-950/30 font-bold">
                  <td colSpan={5} className="p-2 text-right">CLOSING BALANCE</td><td className="p-2 text-right">{money(generated.closingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No SOA generated yet" description="Pick a period and click Generate SOA to see outstanding balances." />
        )}
      </div>

      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} clientId={currentClientId!} docType="soa"
        editing={editingTpl}
        onSave={(tpl) => { import('../lib/invoiceTemplates').then(m => { m.saveTemplate(currentClientId!, tpl); setTemplateId(tpl.id); showToast('Template saved'); }); }}
        onDelete={(id) => { import('../lib/invoiceTemplates').then(m => { m.deleteTemplate(currentClientId!, id); setTemplateId('builtin-soa-amber'); }); }} />
    </div>
  );
}
