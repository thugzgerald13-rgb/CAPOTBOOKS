import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FUNCTIONS, FUNCTION_GROUPS, saveEnabledFunctionIds, loadEnabledFunctionIds } from '../lib/functionRegistry';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen, CreditCard, Receipt, ShoppingCart, FileSignature, History as HistoryIcon,
  BookText, LineChart, Scale, Landmark, TrendingUp, Wallet, Wrench, ShieldCheck,
  FileText, FolderUp, Boxes, Check, CheckSquare, Square, Sparkles,
} from 'lucide-react';

const ICONS: Record<string, any> = {
  coa: BookOpen,
  billing: CreditCard,
  sales: Receipt,
  purchases: ShoppingCart,
  'journal-voucher': FileSignature,
  expenses: ShoppingCart,
  income: Receipt,
  journal: BookText,
  ledger: LineChart,
  'sales-journal': Receipt,
  'purchase-journal': ShoppingCart,
  'cash-disbursement': CreditCard,
  'cash-receipt': Wallet,
  trialbalance: Scale,
  balancesheet: Landmark,
  pl: TrendingUp,
  assetlapsing: Wrench,
  'compliance-tracker': ShieldCheck,
  'bir-forms': FileText,
  files: FolderUp,
  inventory: Boxes,
};

type Props = {
  userId?: string | null;
  onComplete?: () => void;
};

export function FunctionSelector({ userId, onComplete }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const resolvedUserId = userId ?? user?.id;
  const [selected, setSelected] = useState<Set<string>>(() => {
    const saved = loadEnabledFunctionIds(resolvedUserId);
    if (saved != null) return new Set(saved);
    return new Set(FUNCTIONS.map(f => f.id)); // first run: all pre-selected
  });
  const [savedMsg, setSavedMsg] = useState('');

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allIds = FUNCTIONS.map(f => f.id);
  const allSelected = allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));

  const handleSave = () => {
    if (selected.size === 0) {
      setSavedMsg('Please select at least one function.');
      return;
    }
    saveEnabledFunctionIds([...selected], resolvedUserId);
    setSavedMsg('Selection saved — only these functions will appear in the menu.');
    setTimeout(() => {
      if (onComplete) onComplete();
      else navigate('/');
    }, 600);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/40 flex items-start justify-center py-10 px-4 overflow-y-auto font-sans">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Welcome to CAPOT
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            Choose the functions you want to use
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto">
            Tick the modules you need below. Only selected functions will appear in the sidebar and navigation —
            everything else stays hidden. You can change this anytime from the sidebar.
          </p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
          >
            {allSelected ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {selected.size} of {FUNCTIONS.length} selected
          </span>
        </div>

        <div className="space-y-5">
          {FUNCTION_GROUPS.map(group => {
            const groupFns = FUNCTIONS.filter(f => f.group === group);
            if (groupFns.length === 0) return null;
            return (
              <div key={group} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</h2>
                  <span className="text-[10px] font-bold text-slate-400">
                    {groupFns.filter(f => selected.has(f.id)).length}/{groupFns.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {groupFns.map(fn => {
                    const Icon = ICONS[fn.id] || FileText;
                    const isChecked = selected.has(fn.id);
                    return (
                      <button
                        key={fn.id}
                        type="button"
                        onClick={() => toggle(fn.id)}
                        className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors ${isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                      >
                        <span className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'}`}>
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </span>
                        <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${isChecked ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-bold ${isChecked ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{fn.label}</span>
                          <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{fn.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-4 mt-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg p-4 flex flex-col sm:flex-row items-center gap-3">
            {savedMsg && (
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-1 text-center sm:text-left">{savedMsg}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={selected.size === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Check className="w-4 h-4" strokeWidth={3} />
              Save &amp; Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
