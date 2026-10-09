import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { useEntitlements, isTrialActive, trialDaysLeft, hasTrialEnded } from '../lib/subscription';
import type { Permission } from '../lib/accessControl';
import { supabase } from '../lib/supabase';
import { 
  Users, Building2, BookText, BookOpen, 
  LineChart, Scale, Receipt, ShoppingCart, 
  TrendingUp, FileText, Library, FolderClock, History,
  ChevronDown, ChevronLeft, ChevronRight, Settings, Key, Banknote, Wallet, CreditCard, ShieldAlert, RefreshCw, LogOut, Shield, FolderUp,
  Boxes, CheckCircle2, FileSignature, Home, Landmark, ArrowLeftRight, Wrench, UserCircle, Search, X
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

/** Pages hidden from everyone except the developer account (isAdmin) until built out. */
const ADMIN_ONLY_PAGES = new Set(['compliance-tracker', 'inventory']);

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const {
    navigateToPage,
    setHistoryTab,
    setBirFormTab,
    syncData,
    isSyncing,
    isSidebarCollapsed: isCollapsed,
    setSidebarCollapsed: setIsCollapsed,
    activePage,
    historyTab,
  } = useAccounting();
  const { user, isAdmin, userRole, isSubuser, hasPermission, signOut } = useAuth();
  const ent = useEntitlements();
  const trialOn = isTrialActive(ent);
  const trialOver = hasTrialEnded(ent) && Object.keys(ent.paid).length === 0;
  const planButtonLabel = trialOn
    ? `Trial · ${trialDaysLeft(ent)} day${trialDaysLeft(ent) === 1 ? '' : 's'} left`
    : trialOver ? 'Trial ended · Upgrade' : 'Plan & Modules';
  const canUse = (permission: Permission) => !isSubuser || hasPermission(permission);
  const canAny = (...permissions: Permission[]) => !isSubuser || permissions.some((permission) => hasPermission(permission));
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Pending-approval badge (developer only): count users waiting for approval,
  // refreshed every 60s so the developer notices new signups at a glance.
  useEffect(() => {
    if (!isAdmin) { setPendingApprovals(0); return; }
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('approved', false);
        if (!error && !cancelled) setPendingApprovals(count ?? 0);
      } catch { /* ignore — badge is best-effort */ }
    };
    fetchCount();
    const id = setInterval(fetchCount, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isAdmin]);
  const navigate = useNavigate();
  const [isTransactionsOpen, setIsTransactionsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isAfsDraftOpen, setIsAfsDraftOpen] = useState(false);
  const [isFormsOpen, setIsFormsOpen] = useState(false);
  const [isBirOpen, setIsBirOpen] = useState(false);
  const [isSecOpen, setIsSecOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBooksOpen, setIsBooksOpen] = useState(false);
  const [isDevOpen, setIsDevOpen] = useState(false);

  // Desktop-only collapse (icon rail). Mobile keeps the existing slide-in drawer
  // behavior. Collapse state itself now lives in AccountingContext, synced to
  // the Supabase `profiles` table — this effect just reacts to it locally.
  useEffect(() => {
    // Close any open dropdowns when the rail collapses so submenus don't
    // linger, disconnected from their (now icon-only) parent.
    if (isCollapsed) {
      setIsTransactionsOpen(false);
      setIsReportsOpen(false);
      setIsAfsDraftOpen(false);
      setIsFormsOpen(false);
      setIsBirOpen(false);
      setIsSecOpen(false);
      setIsSettingsOpen(false);
      setIsBooksOpen(false);
      setIsDevOpen(false);
    }
  }, [isCollapsed]);

  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsTransactionsOpen(false);
        setIsReportsOpen(false);
        setIsAfsDraftOpen(false);
        setIsFormsOpen(false);
        setIsBirOpen(false);
        setIsSecOpen(false);
        setIsSettingsOpen(false);
        setIsBooksOpen(false);
        setIsDevOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleDropdown = (dropdown: string) => {
    // If the rail is collapsed, expand it first and open the requested section
    // rather than toggling a submenu the user can't see.
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsTransactionsOpen(dropdown === 'transactions');
      setIsBooksOpen(dropdown === 'books');
      setIsReportsOpen(dropdown === 'reports');
      setIsFormsOpen(dropdown === 'forms');
      setIsSettingsOpen(dropdown === 'settings');
      setIsDevOpen(dropdown === 'dev');
      return;
    }
    setIsTransactionsOpen(dropdown === 'transactions' ? !isTransactionsOpen : false);
    setIsBooksOpen(dropdown === 'books' ? !isBooksOpen : false);
    setIsReportsOpen(dropdown === 'reports' ? !isReportsOpen : false);
    setIsFormsOpen(dropdown === 'forms' ? !isFormsOpen : false);
    setIsSettingsOpen(dropdown === 'settings' ? !isSettingsOpen : false);
    setIsDevOpen(dropdown === 'dev' ? !isDevOpen : false);
  };

  const handleNavClick = (pageId: string, historyType?: string) => {
    const permission = pagePermission(pageId);
    if (permission && !canUse(permission)) return;

    if (historyType) {
      setHistoryTab(historyType);
    }

    navigateToPage(pageId);

    if (!historyType) {
      setIsOpen(false);
    }
  };

  const navItems = [
    { id: 'files', label: 'Upload Files', icon: FolderUp, permission: 'edit_transactions' as Permission },
    { id: 'inventory', label: 'Inventory', icon: Boxes, permission: 'edit_transactions' as Permission },
  ];

  const historyItems = [
    { id: 'expenses', label: 'Expense History', icon: ShoppingCart },
    { id: 'income', label: 'Income History', icon: Receipt },
  ];

  const reportItems = [
    { id: 'trialbalance', label: 'Trial Balance', icon: Scale },
    { id: 'balancesheet', label: 'Balance Sheet', icon: Landmark },
    { id: 'pl', label: 'Profit & Loss', icon: TrendingUp },
    { id: 'assetlapsing', label: 'Asset Lapsing', icon: Wrench },
  ];

  const bookItems = [
    { id: 'journal', label: 'General Journal', icon: BookText },
    { id: 'ledger', label: 'General Ledger', icon: LineChart },
    { id: 'sales-journal', label: 'Sales Journal', icon: Receipt },
    { id: 'purchase-journal', label: 'Purchase Journal', icon: ShoppingCart },
    { id: 'cash-disbursement', label: 'Cash Disbursement Book', icon: CreditCard },
    { id: 'cash-receipt', label: 'Cash Receipt Journal', icon: Wallet },
  ];

  // Sidebar inline search (Run 002 / T002): flat index of every navigable
  // page; typing filters it in an overlay below the search box.
  const [sidebarQuery, setSidebarQuery] = useState('');
  const SIDEBAR_NAV_INDEX: { label: string; pageId: string | null; icon: any; historyTab?: string; keywords: string }[] = [
    { label: 'Dashboard', pageId: null, icon: Home, keywords: 'home overview kpi' },
    { label: 'Chart of Accounts', pageId: 'coa', icon: BookOpen, keywords: 'accounts coa ledger' },
    { label: 'Billing / Invoices', pageId: 'billing', icon: CreditCard, keywords: 'invoice billing invoicing' },
    { label: 'Income / Sales', pageId: 'sales', icon: Receipt, keywords: 'income sales revenue' },
    { label: 'Purchases / Bills', pageId: 'purchases', icon: ShoppingCart, keywords: 'purchases bills expenses payable' },
    { label: 'Journal Voucher', pageId: 'journal-voucher', icon: FileSignature, keywords: 'journal entry je voucher' },
    { label: 'Expense History', pageId: 'history', historyTab: 'expenses', icon: ShoppingCart, keywords: 'expense history' },
    { label: 'Income History', pageId: 'history', historyTab: 'income', icon: Receipt, keywords: 'income history' },
    { label: 'Compliance Tracker', pageId: 'compliance-tracker', icon: Shield, keywords: 'compliance filing deadline bir' },
    { label: 'BIR Forms', pageId: 'bir-forms', icon: FileText, keywords: 'bir forms tax 1701 2550 1601' },
    { label: 'BIR E-Invoicing (EIS)', pageId: 'eis-center', icon: FileSignature, keywords: 'eis einvoice e-invoicing bir invoice json pti certification transmit' },
    { label: 'Cash Flow', pageId: 'cashflow', icon: Wallet, keywords: 'cash flow statement' },
    { label: 'General Journal', pageId: 'journal', icon: BookText, keywords: 'general journal gj book' },
    { label: 'General Ledger', pageId: 'ledger', icon: LineChart, keywords: 'general ledger gl book' },
    { label: 'Sales Journal', pageId: 'sales-journal', icon: Receipt, keywords: 'sales journal book' },
    { label: 'Purchase Journal', pageId: 'purchase-journal', icon: ShoppingCart, keywords: 'purchase journal book' },
    { label: 'Cash Disbursement Book', pageId: 'cash-disbursement', icon: CreditCard, keywords: 'cash disbursement cdb book' },
    { label: 'Cash Receipt Journal', pageId: 'cash-receipt', icon: Wallet, keywords: 'cash receipt crj book' },
    { label: 'Trial Balance', pageId: 'trialbalance', icon: Scale, keywords: 'trial balance tb report' },
    { label: 'Balance Sheet', pageId: 'balancesheet', icon: Landmark, keywords: 'balance sheet bs financial position' },
    { label: 'Profit & Loss', pageId: 'pl', icon: TrendingUp, keywords: 'profit loss pnl income statement' },
    { label: 'Asset Lapsing', pageId: 'assetlapsing', icon: Wrench, keywords: 'asset lapsing fixed depreciation' },
    { label: 'Upload Files', pageId: 'files', icon: FolderUp, keywords: 'upload files receipts documents' },
    { label: 'Inventory', pageId: 'inventory', icon: Boxes, keywords: 'inventory stock items' },
    { label: 'Clients', pageId: 'clients', icon: Users, keywords: 'clients entities' },
    { label: 'Business Profile', pageId: 'business', icon: Building2, keywords: 'business profile tin rdo setup' },
    { label: 'Account Settings', pageId: 'account-settings', icon: UserCircle, keywords: 'account settings profile' },
  ];
  const pagePermission = (pageId: string | null): Permission | null => {
    switch (pageId) {
      case 'team': return 'manage_users';
      case 'business': return 'manage_settings';
      case 'clients': return isSubuser ? 'manage_settings' : null;
      case 'tinlibrary':
      case 'coa': return 'manage_settings';
      case 'account-settings': return null;
      case 'files':
      case 'inventory':
      case 'sales':
      case 'billing':
      case 'purchases':
      case 'journal-voucher': return 'edit_transactions';
      case 'history':
      case 'trialbalance':
      case 'balancesheet':
      case 'pl':
      case 'assetlapsing':
      case 'cashflow':
      case 'compliance-tracker':
      case 'eis-center': return 'edit_transactions';
      case 'bir-forms':
      case 'afs-financial-position':
      case 'afs-income-statements':
      case 'afs-equity-retained-earnings':
      case 'afs-ppe': return 'view_reports';
      case 'journal':
      case 'ledger':
      case 'sales-journal':
      case 'purchase-journal':
      case 'cash-disbursement':
      case 'cash-receipt': return null;
      default: return null;
    }
  };

  const sidebarFiltered = sidebarQuery.trim()
    ? SIDEBAR_NAV_INDEX.filter(i =>
        i.label.toLowerCase().includes(sidebarQuery.trim().toLowerCase()) ||
        i.keywords.includes(sidebarQuery.trim().toLowerCase())).filter(i => {
        const p = pagePermission(i.pageId);
        return !p || canUse(p);
      }).filter(i => !ADMIN_ONLY_PAGES.has(String(i.pageId)) || isAdmin)
    : [];

  // Persistent "selected" highlight — applied to the nav button whose page
  // matches the current route, so the active selection stays highlighted.
  const activeIndigo = "bg-indigo-100/70 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
  const activeBlue = "bg-blue-100/70 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  const activeAmber = "bg-amber-100/70 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  const activeCyan = "bg-cyan-100/70 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
  const activeEmerald = "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <div ref={sidebarRef} className={cn(
        "fixed md:static inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50 transform transition-all duration-300 md:translate-x-0 h-screen",
        isCollapsed ? "md:w-20" : "md:w-64",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="relative p-6 border-b border-slate-200 dark:border-slate-800 text-center shrink-0 overflow-hidden">
          <h2 className="text-2xl font-black tracking-tighter text-blue-900 dark:text-blue-400 flex items-center justify-center whitespace-nowrap">
            <span className={cn(isCollapsed && "md:hidden")}>
              CAPOT<span className="text-amber-500 italic">BOOKS</span>
            </span>
            <span className={cn("hidden", isCollapsed && "md:inline")}>
              C<span className="text-amber-500 italic">B</span>
            </span>
          </h2>

          {/* Desktop-only collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-all z-10"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className={cn("flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1 custom-scrollbar", isCollapsed && "md:px-2")}>
          {/* Inline nav search (Run 002 / T002) — filters every page by label/keyword */}
          <div className={cn("relative mb-2", isCollapsed && "md:hidden")}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                value={sidebarQuery}
                onChange={e => setSidebarQuery(e.target.value)}
                placeholder="Search pages…"
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {sidebarQuery && (
                <button
                  onClick={() => setSidebarQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {sidebarFiltered.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl max-h-[55vh] overflow-y-auto py-1 animate-scale-in">
                {sidebarFiltered.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      disabled={!!pagePermission(item.pageId) && !canUse(pagePermission(item.pageId)!)}
                      onClick={() => {
                        if (item.historyTab) setHistoryTab(item.historyTab);
                        navigateToPage(item.pageId);
                        setSidebarQuery('');
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-left",
                        !!pagePermission(item.pageId) && !canUse(pagePermission(item.pageId)!) && "opacity-40 grayscale cursor-not-allowed pointer-events-none"
                      )}
                    >
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {sidebarQuery.trim() && sidebarFiltered.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl px-3 py-4 text-center text-xs text-slate-400">
                No pages match “{sidebarQuery}”
              </div>
            )}
          </div>
          <button
            onClick={() => {
              navigateToPage(null);
              setIsOpen(false);
            }}
            title={isCollapsed ? "Dashboard" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-sm font-bold text-blue-700 dark:text-blue-400 rounded-xl bg-blue-50/60 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all w-full text-left group mb-1",
              isCollapsed && "md:justify-center md:px-2"
            )}
          >
            <Home className="w-5 h-5 opacity-80 group-hover:opacity-100 transition-opacity shrink-0" />
            <span className={cn(isCollapsed && "md:hidden")}>Dashboard</span>
          </button>

          {/* Transactions Collapsible Dropdown (Income + Expenses + Transaction History, merged) */}
          <div className="flex flex-col">
            <button
              onClick={() => toggleDropdown('transactions')}
              title={isCollapsed ? "Transactions" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                (isTransactionsOpen || ['coa','billing','sales','journal-voucher','history'].includes(activePage) || activePage?.startsWith('purchases')) ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
                isCollapsed && "md:justify-center md:px-2"
              )}
            >
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>Transactions</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isTransactionsOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
            </button>

            <AnimatePresence>
              {isTransactionsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
                >
                  <button
                    disabled={!canUse('manage_settings')}
                    onClick={() => {
                      handleNavClick('coa');
                      setIsOpen(false);
                    }}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'coa' && activeIndigo, !canUse('manage_settings') && 'hidden')}
                  >
                    <BookOpen className="w-4 h-4" />
                    Chart of Accounts
                  </button>
                  <button
                    disabled={!canUse('edit_transactions')}
                    onClick={() => {
                      navigateToPage('billing');
                      setIsOpen(false);
                    }}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'billing' && activeIndigo, !canUse('edit_transactions') && 'hidden')}
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing
                  </button>
                  <button
                    disabled={!canUse('edit_transactions')}
                    onClick={() => {
                      handleNavClick('sales');
                      setIsOpen(false);
                    }}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'sales' && activeIndigo, !canUse('edit_transactions') && 'hidden')}
                  >
                    <Receipt className="w-4 h-4" />
                    Income
                  </button>
                  <button
                    disabled={!canUse('edit_transactions')}
                    onClick={() => {
                        navigateToPage('purchases');
                        setIsOpen(false);
                    }}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage?.startsWith('purchases') && activeIndigo, !canUse('edit_transactions') && 'hidden')}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Purchases
                  </button>
                  <button
                    disabled={!canUse('edit_transactions')}
                    onClick={() => {
                      navigateToPage('journal-voucher');
                      setIsOpen(false);
                    }}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'journal-voucher' && activeIndigo, !canUse('edit_transactions') && 'hidden')}
                  >
                    <FileSignature className="w-4 h-4" />
                    Journal Voucher
                  </button>

                  <hr className="border-slate-100 dark:border-slate-800 my-1" />

                  {historyItems.map((subItem) => {
                    const SubIcon = subItem.icon;
                    return (
                      <button
                        key={subItem.id}
                        disabled={!canUse('view_reports')}
                        onClick={() => {
                          handleNavClick('history', subItem.id);
                          setIsOpen(false);
                        }}
                        className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'history' && historyTab === subItem.id && activeIndigo)}
                      >
                        <SubIcon className="w-4 h-4" />
                        {subItem.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Compliance Collapsible Dropdown */}
          <div className="flex flex-col">
            <button
              onClick={() => toggleDropdown('forms')}
              title={isCollapsed ? "Compliance" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                (isFormsOpen || activePage === 'compliance-tracker' || activePage === 'bir-forms' || ['afs-financial-position','afs-income-statements','afs-equity-retained-earnings','afs-ppe','cashflow'].includes(activePage)) ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
                isCollapsed && "md:justify-center md:px-2"
              )}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>Compliance</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isFormsOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
            </button>

            <AnimatePresence>
            {isFormsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
              >
                <button
                  disabled={!canUse('view_reports')}
                  onClick={() => {
                    navigateToPage('compliance-tracker');
                    setIsOpen(false);
                  }}
                  className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition-all w-full text-left", activePage === 'compliance-tracker' && activeEmerald, !isAdmin && 'hidden')}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  Compliance Tracker
                </button>
                {/* BIR — nested collapsible; Forms lives under it */}
                <div className="flex flex-col">
                  <button
                    onClick={() => setIsBirOpen(!isBirOpen)}
                    className={cn("flex items-center justify-between gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", (activePage === 'bir-forms' || activePage === 'eis-center') && activeIndigo)}
                  >
                    <span className="flex items-center gap-3">
                      <Landmark className="w-4 h-4" />
                      BIR
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isBirOpen ? "rotate-180" : "")} />
                  </button>
                  <AnimatePresence>
                    {isBirOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden flex flex-col gap-1 pl-4"
                      >
                        <button
                          disabled={!canUse('view_reports')}
                          onClick={() => {
                            setBirFormTab('2550Q');
                            navigateToPage('bir-forms');
                            setIsOpen(false);
                          }}
                          className={cn("flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'bir-forms' && activeIndigo)}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Forms
                        </button>
                        <button
                          disabled={!canUse('edit_transactions')}
                          onClick={() => {
                            navigateToPage('eis-center');
                            setIsOpen(false);
                          }}
                          className={cn("flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", activePage === 'eis-center' && activeIndigo)}
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          E-Invoicing (EIS)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* SEC — nested collapsible; AFS Draft lives under it */}
                <div className="flex flex-col">
                  <button
                    disabled={!canUse('view_reports')}
                    onClick={() => setIsSecOpen(!isSecOpen)}
                    className={cn("flex items-center justify-between gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", ['afs-financial-position','afs-income-statements','afs-equity-retained-earnings','afs-ppe','cashflow'].includes(activePage) && activeIndigo)}
                  >
                    <span className="flex items-center gap-3">
                      <Building2 className="w-4 h-4" />
                      SEC
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isSecOpen ? "rotate-180" : "")} />
                  </button>
                  <AnimatePresence>
                    {isSecOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden flex flex-col gap-1 pl-4"
                      >
                        {/* AFS Draft - separate financial statement drafts */}
                        <div className="flex flex-col">
                          <button
                            disabled={!canUse('view_reports')}
                            onClick={() => setIsAfsDraftOpen(!isAfsDraftOpen)}
                            className={cn("flex items-center justify-between gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left", ['afs-financial-position','afs-income-statements','afs-equity-retained-earnings','afs-ppe','cashflow'].includes(activePage) && activeIndigo)}
                          >
                            <span className="flex items-center gap-3">
                              <FileText className="w-3.5 h-3.5" />
                              AFS Draft
                            </span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform", isAfsDraftOpen ? "rotate-180" : "")} />
                          </button>
                          <AnimatePresence>
                            {isAfsDraftOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden flex flex-col gap-1 pl-4"
                              >
                                <button disabled={!canUse('view_reports')} onClick={() => handleNavClick('afs-financial-position')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left">
                                  <Landmark className="w-3.5 h-3.5" /> Financial Position
                                </button>
                                <button disabled={!canUse('view_reports')} onClick={() => handleNavClick('afs-income-statements')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left">
                                  <TrendingUp className="w-3.5 h-3.5" /> Income Statements
                                </button>
                                <button disabled={!canUse('view_reports')} onClick={() => handleNavClick('cashflow')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left">
                                  <ArrowLeftRight className="w-3.5 h-3.5" /> Cash Flow
                                </button>
                                <button disabled={!canUse('view_reports')} onClick={() => handleNavClick('afs-equity-retained-earnings')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left">
                                  <Scale className="w-3.5 h-3.5" /> Equity & Retained Earnings
                                </button>
                                <button disabled={!canUse('view_reports')} onClick={() => handleNavClick('afs-ppe')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left">
                                  <Wrench className="w-3.5 h-3.5" /> PPE
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {navItems.filter((i) => (!ADMIN_ONLY_PAGES.has(i.id) || isAdmin)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                disabled={!canUse(item.permission)}
                title={isCollapsed ? item.label : (!canUse(item.permission) ? `${item.label} is not enabled for your role` : undefined)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-400 transition-all w-full text-left group",
                  activePage === item.id && activeBlue,
                  !canUse(item.permission) && 'hidden',
                  isCollapsed && "md:justify-center md:px-2"
                )}
              >
                <Icon className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>{item.label}</span>
              </button>
            );
          })}

          {/* Reports Collapsible Dropdown */}
          <div className="flex flex-col">
            <button
              disabled={!canUse('view_reports')}
              onClick={() => toggleDropdown('reports')}
              title={isCollapsed ? "Reports" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                (isReportsOpen || ['trialbalance','balancesheet','pl','assetlapsing'].includes(activePage)) ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
                isCollapsed && "md:justify-center md:px-2"
              )}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>Reports</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isReportsOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
            </button>

            <AnimatePresence>
              {isReportsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
                >
                  {reportItems.map((subItem) => {
                    const SubIcon = subItem.icon;
                    return (
                      <button
                        key={subItem.id}
                        disabled={!canUse('view_reports')}
                        onClick={() => handleNavClick(subItem.id)}
                        className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left", activePage === subItem.id && activeAmber, !canUse('view_reports') && "opacity-40 grayscale cursor-not-allowed pointer-events-none")}
                      >
                        <SubIcon className="w-4 h-4" />
                        {subItem.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Books Collapsible Dropdown */}
          <div className="flex flex-col">
            <button
              disabled={!canAny('view_reports', 'edit_transactions')}
              onClick={() => toggleDropdown('books')}
              title={isCollapsed ? "Books" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                (isBooksOpen || ['journal','ledger','sales-journal','purchase-journal','cash-disbursement','cash-receipt'].includes(activePage)) ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
                isCollapsed && "md:justify-center md:px-2"
              )}
            >
              <div className="flex items-center gap-3">
                <Library className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>Books</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isBooksOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
            </button>

            <AnimatePresence>
              {isBooksOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
                >
                  {bookItems.map((subItem) => {
                    const SubIcon = subItem.icon;
                    return (
                      <button
                        key={subItem.id}
                        disabled={!canAny('view_reports', 'edit_transactions')}
                        onClick={() => handleNavClick(subItem.id)}
                        className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400 transition-all w-full text-left", activePage === subItem.id && activeCyan, !canAny('view_reports', 'edit_transactions') && "opacity-40 grayscale cursor-not-allowed pointer-events-none")}
                      >
                        <SubIcon className="w-4 h-4" />
                        {subItem.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Settings Collapsible Dropdown */}
          <div className="flex flex-col">
            <button
              onClick={() => toggleDropdown('settings')}
              title={isCollapsed ? "Settings" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                (isSettingsOpen || ['business','clients','tinlibrary','account-settings','team'].includes(activePage)) ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
                isCollapsed && "md:justify-center md:px-2"
              )}
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                <span className={cn(isCollapsed && "md:hidden")}>Settings</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isSettingsOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
            </button>

            <AnimatePresence>
              {isSettingsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
                >
                  {userRole === 'owner' ? (
                    <button
                      disabled={!canUse('manage_settings')}
                      onClick={() => handleNavClick('business')}
                      className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left", !canUse('manage_settings') && 'hidden')}
                    >
                      <Building2 className="w-4 h-4" />
                      Business Profiles
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={!canUse('manage_settings')}
                        onClick={() => handleNavClick('clients')}
                        className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left", !canUse('manage_settings') && 'hidden')}
                      >
                        <Users className="w-4 h-4" />
                        Client Profiles
                      </button>
                      <button
                        disabled={!canUse('manage_settings')}
                        onClick={() => handleNavClick('business')}
                        className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left", !canUse('manage_settings') && 'hidden')}
                      >
                        <Building2 className="w-4 h-4" />
                        Business Profiles
                      </button>
                    </>
                  )}
                  <button
                    disabled={!canUse('manage_settings')}
                    onClick={() => handleNavClick('tinlibrary')}
                    className={cn("flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left", !canUse('manage_settings') && 'hidden')}
                  >
                    <Building2 className="w-4 h-4" />
                    TIN Library
                  </button>
                  <button
                    onClick={() => handleNavClick('account-settings')}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left"
                  >
                    <UserCircle className="w-4 h-4" />
                    Account Settings
                  </button>
                  <button
                    disabled={!canUse('manage_users')}
                    onClick={() => handleNavClick('team')}
                    className={`flex items-center gap-3 px-4 py-2 text-xs font-bold rounded-lg transition-all w-full text-left ${!canUse('manage_users') ? 'hidden ' : ''}${activePage === 'team' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
                  >
                    <Users className="w-4 h-4" />
                    Team &amp; Subusers
                  </button>
                  <button
                    onClick={() => {
                       syncData();
                       setIsOpen(false);
                    }}
                    disabled={isSyncing}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all w-full text-left disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    {isSyncing ? 'Syncing...' : 'Sync Data Now'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Developer Tools Dropdown for Admin */}
          {isAdmin && (
            <div className="flex flex-col mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => toggleDropdown('dev')}
                title={isCollapsed ? "Developer Tools" : undefined}
                className={cn(
                  "flex items-center justify-between px-4 py-3 text-sm font-medium rounded-xl transition-all w-full text-left group",
                  isDevOpen ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10",
                  isCollapsed && "md:justify-center md:px-2"
                )}
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                  <span className={cn(isCollapsed && "md:hidden")}>Developer Tools</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isDevOpen ? "rotate-180" : "", isCollapsed && "md:hidden")} />
              </button>

              <AnimatePresence>
                {isDevOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden flex flex-col gap-1 mt-1 pl-4"
                  >
                    <button
                      onClick={() => {
                        navigate('/developertools/systemconfig');
                        setIsOpen(false);
                        setIsDevOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-all w-full text-left"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="flex items-center gap-2">
                        System Config
                        {pendingApprovals > 0 && (
                          <span
                            title={`${pendingApprovals} user(s) pending approval`}
                            className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center animate-pulse"
                          >
                            {pendingApprovals}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/developertools/diagnostics');
                        setIsOpen(false);
                        setIsDevOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-all w-full text-left"
                    >
                      <LineChart className="w-4 h-4" />
                      Diagnostics
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        </div>

        {user && (
          <div className={cn("p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 flex flex-col gap-2 bg-slate-50 dark:bg-slate-900/50", isCollapsed && "md:px-2")}>
            <div
              className={cn(
                "text-xs text-slate-500 dark:text-slate-400 truncate text-center font-medium bg-slate-100 dark:bg-slate-800 py-2 px-3 rounded-lg mx-1 flex items-center justify-center gap-2",
                isCollapsed && "md:px-2 md:mx-0"
              )}
              title={user.email || ''}
            >
               <span className={cn("truncate", isCollapsed && "md:hidden")}>{user.email}</span>
               {isAdmin && (
                 <Shield className="w-3 h-3 text-emerald-500 shrink-0" title="Developer" />
               )}
            </div>
            <button
              onClick={() => { window.location.hash = '#/account-settings'; setIsOpen(false); }}
              title={isCollapsed ? planButtonLabel : undefined}
              className={cn(
                "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm mb-2",
                trialOver
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/10 dark:text-amber-400 dark:hover:bg-amber-900/30"
                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/10 dark:text-indigo-400 dark:hover:bg-indigo-900/30",
                isCollapsed && "md:px-2"
              )}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span className={cn(isCollapsed && "md:hidden")}>{planButtonLabel}</span>
            </button>
            <button
              onClick={signOut}
              title={isCollapsed ? "Logout" : undefined}
              className={cn(
                "flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/30 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm",
                isCollapsed && "md:px-2"
              )}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className={cn(isCollapsed && "md:hidden")}>Logout</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
