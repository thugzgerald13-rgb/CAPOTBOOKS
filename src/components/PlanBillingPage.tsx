import { ArrowLeft, CreditCard, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlanAndModules } from './PlanAndModules';

/**
 * Dedicated full-page Plan & Billing view (route: #/plan-billing).
 *
 * Reached from the sidebar plan/upgrade button, the Header user-menu
 * "Upgrade" entry, and locked-module deep-links (#/plan-billing?buy=...).
 * A Back button (and a close X) returns the user to their Account Settings
 * page. The picker itself is unchanged — PlanAndModules still gates purchases
 * for team members and handles trial/paid/locked states.
 */
export function PlanBillingPage() {
  const navigate = useNavigate();
  const goBack = () => navigate('/account-settings');

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      {/* Top bar: back + close, so the page feels like a dedicated full-page
          view the user can always leave from either side. */}
      <div className="sticky-page-title flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0"
            title="Back to Account Settings"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">Plan &amp; Billing</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              Free trial, then pay only for the modules you use.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={goBack}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
          title="Close (back to Account Settings)"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-5">
        <PlanAndModules />
      </div>
    </div>
  );
}
