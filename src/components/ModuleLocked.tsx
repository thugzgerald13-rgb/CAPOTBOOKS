import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEntitlements, hasTrialEnded } from '../lib/subscription';
import { getModule, peso, type ModuleId } from '../lib/modules';

/**
 * Shown in place of a page whose module is not part of the user's trial or
 * paid modules. Data is never hidden or deleted — only new work in this module
 * is blocked, and the user is told exactly how to unlock it.
 */
export function ModuleLocked({ moduleId }: { moduleId: ModuleId }) {
  const { isSubuser } = useAuth();
  const ent = useEntitlements();
  const mod = getModule(moduleId);
  const trialEnded = hasTrialEnded(ent);

  const goToBilling = () => { window.location.hash = `#/plan-billing?buy=${moduleId}`; };
  const goHome = () => { window.location.hash = '#/'; };

  return (
    <div className="max-w-xl mx-auto mt-10 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-8 text-center shadow-sm">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{mod.label} is locked</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        {trialEnded
          ? 'Your free trial has ended. Chart of Accounts, transaction entry, and transaction history remain free.'
          : 'This module is not part of your current plan. Your free Core data remains available.'}
      </p>

      <ul className="mt-5 inline-flex flex-col gap-1.5 text-left">
        {mod.includes.map((item) => (
          <li key={item} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {item}
          </li>
        ))}
      </ul>

      {isSubuser ? (
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          Modules are managed by the account owner. Ask them to enable <strong>{mod.label}</strong>.
        </p>
      ) : (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={goToBilling}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            Unlock from {peso(mod.monthly)}/mo <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goHome}
            className="px-5 py-2.5 text-sm font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Back to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
