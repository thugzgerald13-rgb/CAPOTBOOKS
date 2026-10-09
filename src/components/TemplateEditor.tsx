// TemplateEditor.tsx — modal to create / edit a custom invoice template.
import { useEffect, useState } from 'react';
import { Modal, Field, Input, Select, Textarea, Button } from './ui';
import { Trash2, Upload } from 'lucide-react';
import type { InvoiceTemplate, TemplateDocType } from '../types';
import { blankTemplate } from '../lib/invoiceTemplates';

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  docType: TemplateDocType;
  editing?: InvoiceTemplate | null;
  onSave: (tpl: InvoiceTemplate) => void;
  onDelete?: (id: string) => void;
}

export function TemplateEditor({ open, onClose, clientId, docType, editing, onSave, onDelete }: Props) {
  const [tpl, setTpl] = useState<InvoiceTemplate>(() => editing || blankTemplate(docType, 'My Template'));

  useEffect(() => {
    if (open) setTpl(editing || blankTemplate(docType, 'My Template'));
  }, [open, editing, docType]);

  if (!open) return null;
  const set = (patch: Partial<InvoiceTemplate>) => setTpl(t => ({ ...t, ...patch }));
  const isBuiltin = !!tpl.builtin;

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logoDataUrl: String(reader.result), showLogo: true });
    reader.readAsDataURL(file);
  };

  return (
    <Modal open={open} onClose={onClose} title={isBuiltin ? `Duplicate & customize: ${tpl.name}` : (editing ? 'Edit Template' : 'New Template')} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Template name">
            <Input value={tpl.name} onChange={e => set({ name: e.target.value })} disabled={isBuiltin} />
          </Field>
          <Field label="Document type">
            <Select value={tpl.docType} onChange={e => set({ docType: e.target.value as TemplateDocType })} disabled={isBuiltin}>
              <option value="billing">Billing Invoice</option>
              <option value="e-invoice">E-Invoice (BIR EIS)</option>
              <option value="soa">Statement of Account</option>
            </Select>
          </Field>
        </div>
        <Field label="Document title (printed on header, e.g. INVOICE / ELECTRONIC INVOICE / STATEMENT OF ACCOUNT)">
          <Input value={tpl.documentTitle} onChange={e => set({ documentTitle: e.target.value.toUpperCase() })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Primary color (header)">
            <Input type="color" value={tpl.primaryColor} onChange={e => set({ primaryColor: e.target.value })} className="h-10 p-1" />
          </Field>
          <Field label="Secondary color (totals band)">
            <Input type="color" value={tpl.secondaryColor} onChange={e => set({ secondaryColor: e.target.value })} className="h-10 p-1" />
          </Field>
          <Field label="Font">
            <Select value={tpl.fontFamily} onChange={e => set({ fontFamily: e.target.value as any })}>
              <option value="helvetica">Helvetica (sans)</option>
              <option value="times">Times (serif)</option>
              <option value="courier">Courier (mono)</option>
            </Select>
          </Field>
        </div>
        <Field label="Logo (optional — JPG/PNG, stored locally)">
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-xs font-bold border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Upload logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </label>
            {tpl.logoDataUrl && (
              <>
                <img src={tpl.logoDataUrl} alt="logo" className="h-10 object-contain rounded border border-slate-200" />
                <button onClick={() => set({ logoDataUrl: undefined, showLogo: false })} className="text-rose-500 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
              </>
            )}
          </div>
        </Field>
        <Field label="Company name override (leave blank to use Business Profile)">
          <Input value={tpl.companyNameOverride || ''} onChange={e => set({ companyNameOverride: e.target.value })} placeholder="Defaults to your trade name" />
        </Field>
        <Field label="Tagline (under company name)">
          <Input value={tpl.tagline || ''} onChange={e => set({ tagline: e.target.value })} />
        </Field>
        <Field label="Terms & conditions (printed at bottom)">
          <Textarea rows={2} value={tpl.termsAndConditions} onChange={e => set({ termsAndConditions: e.target.value })} />
        </Field>
        <Field label="Payment instructions (overrides Business Profile GCash/Maya/bank)">
          <Textarea rows={2} value={tpl.paymentInstructions || ''} onChange={e => set({ paymentInstructions: e.target.value })} placeholder="Leave blank to use Business Profile" />
        </Field>
        <Field label="Footer note">
          <Input value={tpl.footerNote || ''} onChange={e => set({ footerNote: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {([
            ['showSellerTin', 'Seller TIN'], ['showSellerAddress', 'Seller address'], ['showBuyerTin', 'Buyer TIN'],
            ['showBuyerAddress', 'Buyer address'], ['showVatBreakdown', 'VAT breakdown'], ['showWithholding', 'Withholding tax'],
            ['showPaymentInstructions', 'Payment instructions'], ['showQrPlaceholder', 'QR placeholder (e-invoice)'], ['showLogo', 'Show logo'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded border border-slate-200 dark:border-slate-700">
              <input type="checkbox" checked={!!(tpl as any)[key]} onChange={e => set({ [key]: e.target.checked } as any)} className="w-4 h-4" />
              <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div>
          {editing && !isBuiltin && onDelete && (
            <Button variant="danger" onClick={() => { onDelete(editing.id); onClose(); }}><Trash2 className="w-4 h-4" /> Delete</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onSave({ ...tpl, builtin: false }); onClose(); }}>
            {isBuiltin ? 'Save as custom template' : 'Save template'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
