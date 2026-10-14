import { useState, useEffect, useRef } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { FileSignature, Plus, Trash2, Check, X, ChevronDown, ChevronUp, Save, FolderOpen, Paperclip, RefreshCw } from 'lucide-react';
import { DEFAULT_GJ_COLUMNS } from './GeneralJournal';
import { JournalVoucher as JournalVoucherType, JournalVoucherLine, JournalEntry } from '../types';
import { addIntervalISO, loadJVTemplates, persistJVTemplates, readJVAttachment, type JVTemplate, type JVAttachment, type RecurrenceFrequency } from '../lib/glPosting';
import { useGranularPermissions } from '../lib/useGranularPermissions';

interface DraftLine {
  id: string;
  accountId: string;
  accountName: string;
  debit: string;
  credit: string;
}

const newDraftLine = (): DraftLine => ({ id: crypto.randomUUID(), accountId: '', accountName: '', debit: '', credit: '' });

/**
 * Checks whether a journal voucher represents a cash payment.
 * A cash payment voucher is one where any line credits a Cash account
 * (account name contains "Cash", e.g. "Cash on Hand", "Cash in Bank").
 * Cash payments belong in the Cash Disbursements Journal, not the General Journal.
 */
function isCashPaymentVoucher(voucher: { lines: Array<{ accountName?: string; credit?: number }> }): boolean {
  const lines = voucher.lines || [];
  return lines.some((line) => {
    const accountName = (line.accountName || '').toLowerCase();
    const isCashAccount = accountName.includes('cash');
    const isCredit = Number(line.credit || 0) > 0;
    return isCashAccount && isCredit;
  });
}

export function JournalVoucher() {
  const { currentClient, currentClientId, saveJournalVoucher, deleteJournalVoucher, showToast } = useAccounting();
  const { canAction: canJournalVoucherAction } = useGranularPermissions('journal_voucher');

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine(), newDraftLine()]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Run 010 / T010 — recurring, templates, attachments
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('Monthly');
  const [templates, setTemplates] = useState<JVTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [attachments, setAttachments] = useState<JVAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (currentClientId) setTemplates(loadJVTemplates(currentClientId)); }, [currentClientId]);

  if (!currentClient || !currentClientId) return null;

  const accounts = (currentClient.accounts || []).filter(a => !a.hidden);
  const vouchers = currentClient.journalVouchers || [];

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const addLine = () => setLines(prev => [...prev, newDraftLine()]);
  const removeLine = (id: string) => setLines(prev => prev.length > 2 ? prev.filter(l => l.id !== id) : prev);

  const handleAccountSelect = (id: string, accountId: string) => {
    const acct = accounts.find(a => a.id === accountId);
    updateLine(id, { accountId, accountName: acct?.name || '' });
  };

  const buildGjEntries = (voucher: JournalVoucherType): JournalEntry[] => {
    // CASH PAYMENT vouchers should NOT be recorded in the General Journal.
    // They belong in the Cash Disbursements Journal instead.
    if (isCashPaymentVoucher(voucher)) {
      return [];
    }

    const columns = currentClient.gjColumns || DEFAULT_GJ_COLUMNS;
    const colIds = new Set(columns.map(c => c.id));
    return voucher.lines.map(line => {
      const values: Record<string, string> = {};
      if (colIds.has('date')) values['date'] = voucher.date;
      if (colIds.has('particulars')) values['particulars'] = `${voucher.memo}${line.accountName ? ` - ${line.accountName}` : ''}`;
      if (colIds.has('ref_no')) values['ref_no'] = voucher.reference;
      if (colIds.has('debit')) values['debit'] = line.debit > 0 ? line.debit.toFixed(2) : '';
      if (colIds.has('credit')) values['credit'] = line.credit > 0 ? line.credit.toFixed(2) : '';
      return { id: crypto.randomUUID(), values };
    });
  };

  const handleSave = async () => {
    if (!canJournalVoucherAction('add')) { showToast('Your profile does not have permission to add journal vouchers.'); return; }
    if (!date || !reference.trim()) {
      alert('Date and Reference are required.');
      return;
    }

    const validLines = lines.filter(l => l.accountName && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) {
      alert('Add at least two lines, each with an account and a debit or credit amount.');
      return;
    }

    if (!isBalanced) {
      alert(`Debits and credits must balance. Currently off by ₱${Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      return;
    }

    const finalLines: JournalVoucherLine[] = validLines.map(l => ({
      id: l.id,
      accountId: l.accountId,
      accountName: l.accountName,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0
    }));

    const newVoucher = {
      id: crypto.randomUUID(),
      date,
      reference,
      memo,
      lines: finalLines,
      ...(isRecurring ? { isRecurring: true, recurrenceFrequency, nextDate: addIntervalISO(date, recurrenceFrequency) } : {}),
      ...(attachments.length ? { attachments } : {}),
    } as unknown as JournalVoucherType;

    try {
      await saveJournalVoucher(currentClientId, newVoucher, buildGjEntries(newVoucher));
    } catch {
      return;
    }

    setReference('');
    setMemo('');
    setLines([newDraftLine(), newDraftLine()]);
    setIsRecurring(false);
    setAttachments([]);
  };

  const handleDelete = async (id: string) => {
    if (!canJournalVoucherAction('delete')) { showToast('Your profile does not have permission to delete journal vouchers.'); return; }
    try {
      await deleteJournalVoucher(currentClientId, id);
    } catch {
      return;
    }
  };
  // ---- Run 010 / T010 handlers ----
  const handleSaveTemplate = () => {
    if (!canJournalVoucherAction('edit')) { showToast('Your profile does not have permission to manage journal voucher templates.'); return; }
    const validLines = lines.filter(l => l.accountName && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2 || !templateName.trim()) {
      alert('Enter a template name and at least two balanced lines before saving.');
      return;
    }
    const tpl: JVTemplate = {
      id: crypto.randomUUID(), name: templateName.trim(), memo,
      lines: validLines.map(l => ({ accountId: l.accountId, accountName: l.accountName, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
      createdAt: new Date().toISOString(),
    };
    const next = [...templates, tpl];
    setTemplates(next);
    if (currentClientId) persistJVTemplates(currentClientId, next);
    setTemplateName('');
    showToast(`Template "${tpl.name}" saved`);
  };
  const handleApplyTemplate = (tpl: JVTemplate) => {
    if (!canJournalVoucherAction('add')) { showToast('Your profile does not have permission to add journal vouchers.'); return; }
    setMemo(tpl.memo);
    setLines(tpl.lines.map(l => ({ id: crypto.randomUUID(), accountId: l.accountId, accountName: l.accountName, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' })));
    showToast(`Template "${tpl.name}" applied`);
  };
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const read: JVAttachment[] = [];
    for (const f of Array.from(files)) {
      try { read.push(await readJVAttachment(f)); } catch { /* skip unreadable */ }
    }
    setAttachments(prev => [...prev, ...read]);
    e.target.value = '';
  };
  const handleGenerateNext = (v: JournalVoucherType & { nextDate?: string; recurrenceFrequency?: RecurrenceFrequency }) => {
    if (!canJournalVoucherAction('add')) { showToast('Your profile does not have permission to generate journal vouchers.'); return; }
    if (!v.nextDate || !v.recurrenceFrequency) return;
    const generated: any = {
      ...v,
      id: crypto.randomUUID(),
      date: v.nextDate,
      isRecurring: false,
      nextDate: undefined,
      recurrenceFrequency: undefined,
      parentVoucherId: v.id,
    };
    const updatedTemplate: any = { ...v, nextDate: addIntervalISO(v.nextDate, v.recurrenceFrequency) };
    Promise.all([
      saveJournalVoucher(currentClientId, updatedTemplate, buildGjEntries(updatedTemplate)),
      saveJournalVoucher(currentClientId, generated, buildGjEntries(generated)),
    ]).then(() => showToast(`Generated recurring voucher for ${generated.date}`))
      .catch(() => showToast('Failed to generate recurring voucher'));
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Journal Voucher" icon={<FileSignature className="w-5 h-5 text-cyan-500" />} />
      <div className="p-4 md:p-6 flex-1">
      {canJournalVoucherAction('add') && <section>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
        <div>
          <label className="form-label">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </div>
        <div>
          <label className="form-label">Reference <span className="text-rose-500">*</span></label>
          <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="JV-001" className="form-input" />
        </div>
        <div>
          <label className="form-label">Memo</label>
          <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="Purpose of this voucher" className="form-input" />
        </div>
      </div>

      {/* Run 010 / T010 — recurring + templates + attachments */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
        <label className="flex items-center gap-2 cursor-pointer mb-1">
          <input type="checkbox" className="w-4 h-4 rounded accent-cyan-600" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Recurring entry</span>
        </label>
        {isRecurring && (
          <select value={recurrenceFrequency} onChange={e => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)} className="form-input !py-1.5 !text-xs">
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Annually">Annually</option>
          </select>
        )}
        <span className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name" className="form-input !py-1.5 !text-xs !w-40" />
        <button type="button" onClick={handleSaveTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">
          <Save className="w-3.5 h-3.5" /> Save as Template
        </button>
        {templates.length > 0 && (
          <select onChange={e => { const t = templates.find(x => x.id === e.target.value); if (t) handleApplyTemplate(t); e.target.value = ''; }} defaultValue="" className="form-input !py-1.5 !text-xs !w-44">
            <option value="" disabled>Load template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <span className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">
          <Paperclip className="w-3.5 h-3.5" /> Attach{attachments.length > 0 && ` (${attachments.length})`}
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAttachmentUpload} />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 w-full">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 text-[10px] font-semibold">
                <Paperclip className="w-3 h-3" /> {a.name}
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-500 font-bold">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 mb-4 text-xs text-amber-800 dark:text-amber-300">
        <strong>Note:</strong> Journal vouchers that credit a <strong>Cash</strong> account (cash payments) are recorded in the <strong>Cash Disbursements Journal</strong>, not in the General Journal. Only non-cash adjusting and transfer entries will appear in the General Journal.
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
<table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
              <th className="px-3 py-2.5 text-left">Account</th>
              <th className="px-3 py-2.5 text-right w-32">Debit</th>
              <th className="px-3 py-2.5 text-right w-32">Credit</th>
              <th className="px-3 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lines.map(line => (
              <tr key={line.id}>
                <td className="px-2 py-1.5">
                  {accounts.length > 0 ? (
                    <select
                      value={line.accountId}
                      onChange={e => handleAccountSelect(line.id, e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 rounded px-2 py-1.5 outline-none"
                    >
                      <option value="">Select account...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={line.accountName}
                      onChange={e => updateLine(line.id, { accountName: e.target.value })}
                      placeholder="Account title"
                      className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 rounded px-2 py-1.5 outline-none"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    value={line.debit}
                    onChange={e => updateLine(line.id, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                    placeholder="0.00"
                    className="w-full text-right font-mono bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 rounded px-2 py-1.5 outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    value={line.credit}
                    onChange={e => updateLine(line.id, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                    placeholder="0.00"
                    className="w-full text-right font-mono bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 rounded px-2 py-1.5 outline-none"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => removeLine(line.id)} disabled={lines.length <= 2} className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold border-t-2 border-slate-200 dark:border-slate-700">
            <tr>
              <td className="px-3 py-2.5 text-right">Total</td>
              <td className="px-3 py-2.5 text-right font-mono">₱{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2.5 text-right font-mono">₱{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button onClick={addLine} className="text-xs font-bold text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 rounded-lg px-3 py-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Line
        </button>
        <div className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-xs ${isBalanced ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
          {isBalanced ? <><Check className="w-4 h-4" /> Balanced</> : <><X className="w-4 h-4" /> Out of Balance: ₱{Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!isBalanced}
        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-sm shadow-cyan-500/20 flex justify-center items-center gap-2 mb-8"
      >
        <Plus className="w-5 h-5" /> Save Journal Voucher
      </button>

      </section>}

      <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">Voucher Register</h3>
      <div className="space-y-2">
        {vouchers.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">No journal vouchers saved yet.</div>
        )}
        {[...vouchers].reverse().map(v => {
          const vTotal = v.lines.reduce((s, l) => s + l.debit, 0);
          const isExpanded = expandedId === v.id;
          const isCashPayment = isCashPaymentVoucher(v);
          const vAny = v as any;
          const canGenerateNext = vAny.isRecurring && vAny.nextDate && vAny.nextDate <= today;
          return (
            <div key={v.id} className="bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : v.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-slate-500">{v.date}</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{v.reference}</span>
                  {v.memo && <span className="text-xs text-slate-400 italic">"{v.memo}"</span>}
                  {isCashPayment && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Cash Payment · CDJ only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300">₱{vTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  {canGenerateNext && canJournalVoucherAction('add') && (
                    <button onClick={(e) => { e.stopPropagation(); handleGenerateNext(vAny); }} className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 rounded-lg px-2 py-1 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition">
                      <RefreshCw className="w-3 h-3" /> Generate Next
                    </button>
                  )}
                  {vAny.isRecurring && <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">Recurring · {vAny.recurrenceFrequency}</span>}
                  {vAny.attachments?.length > 0 && <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{vAny.attachments.length}</span>}
                  {canJournalVoucherAction('delete') && <button onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }} className="p-1 text-slate-300 hover:text-red-500 rounded transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                  <div className="overflow-x-auto">
<table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 uppercase text-[10px]">
                        <th className="text-left py-1">Account</th>
                        <th className="text-right py-1">Debit</th>
                        <th className="text-right py-1">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.lines.map(l => (
                        <tr key={l.id} className="border-t border-slate-50 dark:border-slate-800/50">
                          <td className="py-1.5">{l.accountName}</td>
                          <td className="py-1.5 text-right font-mono">{l.debit > 0 ? l.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</td>
                          <td className="py-1.5 text-right font-mono">{l.credit > 0 ? l.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
          </div>
    </div>
  );
}
