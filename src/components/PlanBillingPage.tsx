import { CreditCard } from 'lucide-react';
import { PlanAndModules } from './PlanAndModules';

/**
 * Dedicated Plan & Billing page (its own route: #/plan-billing).
 *
 * Previously the plan/module picker was a section embedded inside Account
 * Settings. It was promoted to its own page so the sidebar "Upgrade" / plan
 * button (and ModuleLocked deep-links like #/plan-billing?buy=reports) land
 * directly on it, without scrolling past profile/security/notification
 * settings. PlanAndModules itself is unchanged — it still internally gates
 * purchases (team members see a "managed by the account owner" notice) and
 * handles trial/paid/locked states.
 */
export function PlanBillingPage() {
  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="sticky-page-title flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center">
          <CreditCard className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Plan &amp; Billing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Free trial, then pay only for the modules you use.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-5">
        <PlanAndModules />
      </div>
    </div>
  );
}
