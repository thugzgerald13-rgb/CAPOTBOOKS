import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, CornerDownLeft, FileText, Receipt, ShoppingCart, FileSignature, FolderUp, Home, BookOpen, CreditCard, History, Landmark, TrendingUp, Scale, Wrench, BookText, LineChart, Wallet, Boxes, Settings, Shield, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccounting } from '@/context/AccountingContext';
import { useAuth } from '@/context/AuthContext';
import { routeRequiresPermission, featureAllows } from '@/lib/pagePermissions';

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  keywords: string;
  action: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/** Global command palette (Cmd/Ctrl+K) — search pages and quick actions.
 *  Commercial-app parity: QuickBooks global search / Xero nav search. */
/** Command id -> route path, for permission filtering (Goal A). */
const COMMAND_ROUTE: Record<string, string> = {
  coa: '/coa', billing: '/billing', sales: '/sales', purchases: '/purchases',
  'journal-voucher': '/journal-voucher', 'expense-history': '/history', 'income-history': '/history',
  'compliance-tracker': '/compliance-tracker', 'bir-forms': '/bir-forms', cashflow: '/cashflow',
  trialbalance: '/trialbalance', balancesheet: '/balancesheet', pl: '/pl', assetlapsing: '/assetlapsing',
  files: '/files', inventory: '/inventory', clients: '/clients', business: '/business',
};

/** Commands visible only to the developer account (isAdmin) until built out. */
const ADMIN_ONLY_COMMANDS = new Set(['compliance-tracker', 'inventory']);

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { navigateToPage, setHistoryTab } = useAccounting();
  // Goal A: hide commands for pages the current subuser is not allowed to open.
  // The route guard in App.tsx still blocks the destination if anything slips through.
  const { isSubuser, hasPermission, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', hint: 'Home', icon: <Home className="w-4 h-4" />, keywords: 'home overview kpi', action: () => navigateToPage(null) },
    { id: 'coa', label: 'Chart of Accounts', hint: 'Transactions', icon: <BookOpen className="w-4 h-4" />, keywords: 'accounts ledger coa', action: () => navigateToPage('coa') },
    { id: 'billing', label: 'New Invoice / Billing', hint: 'Transactions', icon: <FileText className="w-4 h-4" />, keywords: 'invoice billing invoicing receivable', action: () => navigateToPage('billing') },
    { id: 'sales', label: 'Income / Sales', hint: 'Transactions', icon: <Receipt className="w-4 h-4" />, keywords: 'income sales revenue', action: () => navigateToPage('sales') },
    { id: 'purchases', label: 'Purchases / Bills', hint: 'Transactions', icon: <ShoppingCart className="w-4 h-4" />, keywords: 'purchases bills expenses payable ap', action: () => navigateToPage('purchases') },
    { id: 'journal-voucher', label: 'Journal Voucher', hint: 'Transactions', icon: <FileSignature className="w-4 h-4" />, keywords: 'journal entry je voucher adjustment', action: () => navigateToPage('journal-voucher') },
    { id: 'expense-history', label: 'Expense History', hint: 'Transactions', icon: <ShoppingCart className="w-4 h-4" />, keywords: 'expense history', action: () => { setHistoryTab('expenses'); navigateToPage('history'); } },
    { id: 'income-history', label: 'Income History', hint: 'Transactions', icon: <Receipt className="w-4 h-4" />, keywords: 'income history', action: () => { setHistoryTab('income'); navigateToPage('history'); } },
    { id: 'compliance-tracker', label: 'Compliance Tracker', hint: 'Compliance', icon: <Shield className="w-4 h-4" />, keywords: 'compliance bir filing calendar deadline', action: () => navigateToPage('compliance-tracker') },
    { id: 'bir-forms', label: 'BIR Forms', hint: 'Compliance', icon: <FileSpreadsheet className="w-4 h-4" />, keywords: 'bir forms 1701 2550 1601 tax', action: () => navigateToPage('bir-forms') },
    { id: 'cashflow', label: 'Cash Flow Statement', hint: 'Compliance / Reports', icon: <Wallet className="w-4 h-4" />, keywords: 'cash flow statement', action: () => navigateToPage('cashflow') },
    { id: 'journal', label: 'General Journal', hint: 'Books', icon: <BookText className="w-4 h-4" />, keywords: 'general journal gj book', action: () => navigateToPage('journal') },
    { id: 'ledger', label: 'General Ledger', hint: 'Books', icon: <LineChart className="w-4 h-4" />, keywords: 'general ledger gl book', action: () => navigateToPage('ledger') },
    { id: 'sales-journal', label: 'Sales Journal', hint: 'Books', icon: <Receipt className="w-4 h-4" />, keywords: 'sales journal book', action: () => navigateToPage('sales-journal') },
    { id: 'purchase-journal', label: 'Purchase Journal', hint: 'Books', icon: <ShoppingCart className="w-4 h-4" />, keywords: 'purchase journal book', action: () => navigateToPage('purchase-journal') },
    { id: 'cash-disbursement', label: 'Cash Disbursement Book', hint: 'Books', icon: <CreditCard className="w-4 h-4" />, keywords: 'cash disbursement cdb book', action: () => navigateToPage('cash-disbursement') },
    { id: 'cash-receipt', label: 'Cash Receipt Journal', hint: 'Books', icon: <Wallet className="w-4 h-4" />, keywords: 'cash receipt crj book', action: () => navigateToPage('cash-receipt') },
    { id: 'trialbalance', label: 'Trial Balance', hint: 'Reports', icon: <Scale className="w-4 h-4" />, keywords: 'trial balance tb report', action: () => navigateToPage('trialbalance') },
    { id: 'balancesheet', label: 'Balance Sheet', hint: 'Reports', icon: <Landmark className="w-4 h-4" />, keywords: 'balance sheet bs statement financial position', action: () => navigateToPage('balancesheet') },
    { id: 'pl', label: 'Profit & Loss', hint: 'Reports', icon: <TrendingUp className="w-4 h-4" />, keywords: 'profit loss pnl income statement report', action: () => navigateToPage('pl') },
    { id: 'assetlapsing', label: 'Asset Lapsing / Fixed Assets', hint: 'Reports', icon: <Wrench className="w-4 h-4" />, keywords: 'asset lapsing fixed depreciation', action: () => navigateToPage('assetlapsing') },
    { id: 'files', label: 'Upload Files / File Manager', hint: 'Files', icon: <FolderUp className="w-4 h-4" />, keywords: 'upload files receipts documents attachments', action: () => navigateToPage('files') },
    { id: 'inventory', label: 'Inventory', hint: 'Inventory', icon: <Boxes className="w-4 h-4" />, keywords: 'inventory stock items sku', action: () => navigateToPage('inventory') },
    { id: 'clients', label: 'Clients (Multi-entity)', hint: 'Settings', icon: <History className="w-4 h-4" />, keywords: 'clients entities switch', action: () => navigateToPage('clients') },
    { id: 'business', label: 'Business Profile', hint: 'Settings', icon: <FileText className="w-4 h-4" />, keywords: 'business profile tin rdo setup', action: () => navigateToPage('business') },
    { id: 'account-settings', label: 'Account Settings', hint: 'Settings', icon: <Settings className="w-4 h-4" />, keywords: 'account settings profile password', action: () => navigateToPage('account-settings') },
  ].filter((item) => {
    const route = COMMAND_ROUTE[item.id];
    const required = route ? routeRequiresPermission(route) : null;
    return (!isSubuser || !required || hasPermission(required))
      && (!ADMIN_ONLY_COMMANDS.has(item.id) || isAdmin)
      && (isAdmin || featureAllows(item.id));
  }), [navigateToPage, setHistoryTab, isSubuser, hasPermission, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.label.toLowerCase().includes(q) || i.keywords.includes(q) || i.hint.toLowerCase().includes(q));
  }, [query, items]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[selected]; if (it) { it.action(); onClose(); } }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] px-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl card-surface shadow-modal overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages or actions… (↑↓ navigate, Enter to open)"
            className="w-full py-3.5 text-sm bg-transparent outline-none placeholder:text-text-muted text-text-primary"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border bg-surface-subtle text-text-muted">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-muted">No results for “{query}”</div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setSelected(i)}
              onClick={() => { item.action(); onClose(); }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                i === selected ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-surface-subtle',
              )}
            >
              <span className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', i === selected ? 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'bg-surface-subtle text-text-muted')}>
                {item.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-text-primary truncate">{item.label}</span>
                <span className="block text-[11px] text-text-muted truncate">{item.hint}</span>
              </span>
              {i === selected && <CornerDownLeft className="w-3.5 h-3.5 text-text-muted shrink-0" />}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border bg-surface-muted text-[11px] text-text-muted flex items-center gap-4">
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">↵</kbd> open</span>
          <span><kbd className="font-semibold">esc</kbd> close</span>
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
