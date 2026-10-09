import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, RefreshCw, Receipt as ReceiptIcon, ShieldAlert, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from './ui/Toast';
import { quote, getModule, isModuleId, peso, type BillingCycle, type ModuleId } from '../lib/modules';

// Legacy flat-plan names (requests filed before modules existed).
const LEGACY_PLAN_NAMES: Record<string, string> = { starter: 'Starter Plan', pro: 'Pro Plan', enterprise: 'Enterprise Plan' };

type RequestStatus = 'pending' | 'approved' | 'rejected';
interface PaymentRequestRow {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  plan: string;
  modules: string[] | null;
  billing_cycle: string | null;
  amount: number;
  receipt_url: string | null; // storage path in 'receipts' bucket
  status: RequestStatus;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const FILTERS: Array<{ id: RequestStatus | 'all'; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

function receiptPublicUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    return supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}

function statusBadge(status: RequestStatus) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900';
}

function RequestCard({
  req, onApproved, onRejected, busy,
}: {
  req: PaymentRequestRow;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
  busy: boolean;
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [notes, setNotes] = useState('');
  const [actionBusy, setActionBusy] = useState<'approve' | 'reject' | null>(null);
  const imgUrl = receiptPublicUrl(req.receipt_url);
  const reqModules = (req.modules || []).filter(isModuleId) as ModuleId[];
  const cycle: BillingCycle = req.billing_cycle === 'annual' ? 'annual' : 'monthly';
  const isModuleOrder = reqModules.length > 0;
  const planLabel = isModuleOrder
    ? reqModules.map((m) => getModule(m).label).join(' + ')
    : LEGACY_PLAN_NAMES[req.plan] || req.plan;
  // The amount is typed by the payer's browser — compare it with the catalog
  // price so a ₱199 receipt can't unlock a ₱1,499 bundle by accident.
  const expected = isModuleOrder ? quote(reqModules, cycle).total : null;
  const amountMismatch = expected !== null && Math.round(Number(req.amount)) !== expected;

  const handleApprove = async () => {
    setActionBusy('approve');
    try {
      const { error } = await supabase.rpc('approve_payment_request', { p_request_id: req.id });
      if (error) throw error;
      toast.success(`Approved — ${planLabel} unlocked for ${req.user_email || req.user_id}`);
      onApproved(req.id);
    } catch (err) {
      toast.error('Approve failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally { setActionBusy(null); }
  };

  const handleReject = async () => {
    setActionBusy('reject');
    try {
      const { error } = await supabase.rpc('reject_payment_request', { p_request_id: req.id, p_notes: notes.trim() || null });
      if (error) throw error;
      toast.info('Payment request rejected.');
      onRejected(req.id);
    } catch (err) {
      toast.error('Reject failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally { setActionBusy(null); }
  };

  return (
    <div className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Receipt */}
        <div className="shrink-0">
          {imgUrl ? (
            <a href={imgUrl} target="_blank" rel="noreferrer" className="block group relative">
              <img src={imgUrl} alt="Payment receipt" className="w-32 h-32 object-cover rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" />
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/40 rounded-xl transition-colors">
                <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            </a>
          ) : (
            <div className="w-32 h-32 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
              <ReceiptIcon className="w-6 h-6" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{req.user_email || req.user_name || req.user_id}</span>
            <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusBadge(req.status)}`}>{req.status}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
            <div><span className="font-bold text-slate-600 dark:text-slate-300">{isModuleOrder ? 'Modules:' : 'Plan:'}</span> {planLabel}{isModuleOrder && <> · <span className="font-bold text-slate-600 dark:text-slate-300">Term:</span> {cycle === 'annual' ? '12 months' : '30 days'}</>}</div>
            <div><span className="font-bold text-slate-600 dark:text-slate-300">Amount paid:</span> {peso(Number(req.amount))}{expected !== null && <> · <span className="font-bold text-slate-600 dark:text-slate-300">Catalog price:</span> {peso(expected)}</>}</div>
            {amountMismatch && (
              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold">
                <ShieldAlert className="w-3.5 h-3.5" /> Amount differs from the catalog price — check the receipt in GCash before approving.
              </div>
            )}
            <div><span className="font-bold text-slate-600 dark:text-slate-300">Submitted:</span> {new Date(req.created_at).toLocaleString()}</div>
            {req.reviewed_at && <div><span className="font-bold text-slate-600 dark:text-slate-300">Reviewed:</span> {new Date(req.reviewed_at).toLocaleString()}</div>}
            {req.admin_notes && <div><span className="font-bold text-slate-600 dark:text-slate-300">Notes:</span> {req.admin_notes}</div>}
          </div>

          {req.status === 'pending' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!rejectMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={busy || actionBusy !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                  >
                    {actionBusy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve & Unlock Modules
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectMode(true)}
                    disabled={busy || actionBusy !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Reason for rejection (optional, shown in records)"
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={busy || actionBusy !== null}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {actionBusy === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Confirm Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectMode(false); setNotes(''); }}
                    disabled={actionBusy !== null}
                    className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaymentApproval() {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data as PaymentRequestRow[]) || []);
    } catch (err) {
      toast.error('Could not load payment requests', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <ShieldAlert className="w-10 h-10 text-rose-400" />
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Admin access required</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">The payment approval dashboard is only available to the developer / admin account.</p>
      </div>
    );
  }

  const counts = requests.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const visible = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center">
            <ReceiptIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Payment Approval</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Verify GCash receipts and unlock the purchased modules.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => {
          const count = f.id === 'all' ? requests.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
                active
                  ? 'bg-cyan-600 border-cyan-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-400'
              }`}
            >
              {f.id === 'pending' && <Clock className="w-3 h-3" />}
              {f.id === 'approved' && <CheckCircle2 className="w-3 h-3" />}
              {f.id === 'rejected' && <XCircle className="w-3 h-3" />}
              {f.label}
              <span className={`px-1.5 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
      ) : visible.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No {filter === 'all' ? '' : filter} payment requests</p>
          <p className="text-xs text-slate-400">New GCash payments submitted by users will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              busy={busy}
              onApproved={() => { setBusy(false); load(); }}
              onRejected={() => { setBusy(false); load(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
