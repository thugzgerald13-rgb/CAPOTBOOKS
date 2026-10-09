import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Lock, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  useEntitlements, loadEntitlements, isTrialActive, trialDaysLeft, hasTrialEnded, moduleAccess,
} from '../lib/subscription';
import {
  PAID_MODULES, BUNDLES, CORE_MODULE, ANNUAL_MONTHS_CHARGED, quote, orderFromSelection, peso,
  recommendedBundleId, isModuleId, getModule, type BillingCycle, type ModuleId, type PaymentOrder,
} from '../lib/modules';
import { PaymentInstructions } from './PaymentInstructions';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

interface PendingRequest { modules: string[] | null; billing_cycle: string | null; plan: string }

/** Plan & Billing section: trial status, bundles, and a-la-carte module picker. */
export function PlanAndModules() {
  const { user, userRole, isSubuser } = useAuth();
  const ent = useEntitlements();

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [selected, setSelected] = useState<ModuleId[]>([]);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const recommended = recommendedBundleId(userRole);
  const trialOn = isTrialActive(ent);
  const trialOver = hasTrialEnded(ent);
  const daysLeft = trialDaysLeft(ent);
  const canBuy = !isSubuser;

  const refresh = async () => {
    if (!user) return;
    await loadEntitlements(user.id, { force: true });
    try {
      const { data } = await supabase
        .from('payment_requests')
        .select('plan, status, modules, billing_cycle')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPending(data && data.status === 'pending' ? (data as PendingRequest) : null);
    } catch { /* table not migrated yet */ }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  // Deep link from a locked page: #/account-settings?buy=reports
  useEffect(() => {
    const q = window.location.hash.split('?')[1];
    const buy = q ? new URLSearchParams(q).get('buy') : null;
    if (buy && isModuleId(buy)) {
      setSelected([buy]);
      setTimeout(() => document.getElementById('plan-modules')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, []);

  const q = useMemo(() => quote(selected, cycle), [selected, cycle]);
  const toggle = (id: ModuleId) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const price = (monthly: number) =>
    cycle === 'annual' ? `${peso(monthly * ANNUAL_MONTHS_CHARGED)}/yr` : `${peso(monthly)}/mo`;

  const pendingLabel = pending?.modules?.length
    ? pending.modules.map((m) => (isModuleId(m) ? getModule(m).label : m)).join(', ')
    : pending?.plan;

  return (
    <div id="plan-modules" className="space-y-4">
      {/* Status banner */}
      {ent.isTeamMember ? (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
          You are working inside a team account. Modules and billing are managed by the account owner.
        </div>
      ) : trialOn ? (
        <div className="p-3 rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/20 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
          <div className="text-xs text-cyan-800 dark:text-cyan-200">
            <span className="font-bold">Free trial — {daysLeft} day{daysLeft === 1 ? '' : 's'} left</span> (ends {fmtDate(ent.trialEndsAt)}).
            Every module is unlocked. Afterwards, Core Books stay free with unlimited transactions and you keep only the modules you subscribe to.
          </div>
        </div>
      ) : trialOver ? (
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-2">
          <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <span className="font-bold">Your free trial ended {fmtDate(ent.trialEndsAt)}.</span> Core Books remain free and your data is untouched.
            Subscribe to a module below to unlock it again.
          </div>
        </div>
      ) : null}

      {/* Core */}
      <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/10">
        <div className="flex items-center gap-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" /> {CORE_MODULE.label} — {CORE_MODULE.tagline}
        </div>
        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">{CORE_MODULE.includes.join(' · ')}</p>
      </div>

      {canBuy && (
        <>
          {/* Billing cycle */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Bundles</div>
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-bold">
              {(['monthly', 'annual'] as BillingCycle[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`px-3 py-1.5 ${cycle === c ? 'bg-cyan-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
                >
                  {c === 'monthly' ? 'Monthly' : 'Annual · 2 months free'}
                </button>
              ))}
            </div>
          </div>

          {/* Bundles */}
          <div className="grid md:grid-cols-3 gap-3">
            {BUNDLES.map((b) => {
              const alaCarte = quote(b.modules, 'monthly').alaCarteMonthly;
              const isRec = b.id === recommended;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-xl border p-4 ${isRec ? 'border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}
                >
                  {isRec && <span className="absolute -top-2 right-3 text-[10px] font-bold bg-cyan-600 text-white px-2 py-0.5 rounded-full">RECOMMENDED</span>}
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100">{b.label}</div>
                  <div className="text-[11px] text-slate-400">{b.tagline}</div>
                  <div className="text-lg font-black text-cyan-600 dark:text-cyan-400 my-1">{price(b.monthly)}</div>
                  <div className="text-[10px] text-slate-400">Save {peso(alaCarte - b.monthly)}/mo vs. buying separately</div>
                  <ul className="space-y-1 mt-2">
                    {b.modules.map((m) => (
                      <li key={m} className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{getModule(m).label}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => setOrder(orderFromSelection(b.modules, cycle))}
                    className="mt-3 w-full text-xs font-bold py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >{pending !== null ? 'Payment Pending' : 'Subscribe'}</button>
                </div>
              );
            })}
          </div>

          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-2">Or pick individual modules</div>
        </>
      )}

      {/* Module list */}
      <div className="space-y-2">
        {PAID_MODULES.map((m) => {
          const access = moduleAccess(ent, m.id);
          const paid = ent.paid[m.id];
          const checked = selected.includes(m.id);
          return (
            <label
              key={m.id}
              className={`flex items-start gap-3 p-3 rounded-xl border ${canBuy ? 'cursor-pointer' : ''} ${checked ? 'border-cyan-400 dark:border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}
            >
              {canBuy && (
                <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} className="mt-1 w-4 h-4 rounded accent-cyan-600" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{m.label}</span>
                  {access === 'active' && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Active{paid?.expiresAt ? ` · until ${fmtDate(paid.expiresAt)}` : ''}
                    </span>
                  )}
                  {access === 'trial' && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">In trial</span>
                  )}
                  {access === 'locked' && ent.status === 'ready' && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">{m.tagline} — {m.includes.join(', ')}</div>
              </div>
              <div className="text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">{price(m.monthly)}</div>
            </label>
          );
        })}
      </div>

      {canBuy && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {selected.length === 0 ? 'Select modules to see your price.' : (
              <>
                <span className="font-black text-slate-800 dark:text-slate-100">{peso(q.total)}</span>
                {cycle === 'annual' ? ' for 12 months' : ' for 30 days'}
                {q.savingsMonthly > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · bundle pricing saves {peso(q.savingsMonthly)}/mo</span>}
              </>
            )}
          </div>
          <button
            type="button"
            disabled={selected.length === 0 || pending !== null}
            onClick={() => setOrder(orderFromSelection(selected, cycle))}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending !== null ? 'Payment Pending' : 'Subscribe'}
          </button>
        </div>
      )}

      {pending && (
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-bold">Payment pending verification.</span> Your receipt for <span className="font-bold">{pendingLabel}</span> was submitted.
            We'll verify it in GCash and unlock your modules within 24 hours.
          </div>
        </div>
      )}

      <PaymentInstructions order={order} onClose={() => setOrder(null)} onSubmitted={refresh} />
    </div>
  );
}
