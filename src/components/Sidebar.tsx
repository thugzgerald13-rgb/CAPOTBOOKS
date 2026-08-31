import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Building2, BookText, BookOpen, 
  LineChart, Scale, Receipt, ShoppingCart, 
  TrendingUp, FileText, Library, FolderClock, History,
  ChevronDown, ChevronLeft, ChevronRight, Settings, Key, Banknote, Wallet, CreditCard, ShieldAlert, RefreshCw, LogOut, Shield, FolderUp,
  Boxes, CheckCircle2, FileSignature, Home, Landmark, ArrowLeftRight, Wrench, UserCircle
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const {
    navigateToPage,
    setCurrentDat,
    setHistoryTab,
    setBirFormTab,
    syncData,
    isSyncing,
    isSidebarCollapsed: isCollapsed,
    setSidebarCollapsed: setIsCollapsed,
  } = useAccounting();
  const { user, isAdmin, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [isTransactionsOpen, setIsTransactionsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isAfsDraftOpen, setIsAfsDraftOpen] = useState(false);
  const [isFormsOpen, setIsFormsOpen] = useState(false);
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
    if (historyType) {
      setHistoryTab(historyType);
    }

    navigateToPage(pageId);

    if (!historyType) {
      setIsOpen(false);
    }
  };

  const navItems = [
    { id: 'files', label: 'Upload Files', icon: FolderUp },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
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
                isTransactionsOpen ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
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
                    onClick={() => {
                      handleNavClick('coa');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
                  >
                    <BookOpen className="w-4 h-4" />
                    Chart of Accounts
                  </button>
                  <button
                    onClick={() => {
                      navigateToPage('billing');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing
                  </button>
                  <button
                    onClick={() => {
                      handleNavClick('sales');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
                  >
                    <Receipt className="w-4 h-4" />
                    Income
                  </button>
                  <button
                    onClick={() => {
                        setCurrentDat(null);
                        navigateToPage('purchases');
                        setIsOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Purchases
                  </button>
                  <button
                    onClick={() => {
                      navigateToPage('journal-voucher');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
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
                        onClick={() => {
                          handleNavClick('history', subItem.id);
                          setIsOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
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
                isFormsOpen ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
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
                  onClick={() => {
                    navigateToPage('compliance-tracker');
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition-all w-full text-left"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  Compliance Tracker
                </button>
                <button
                  onClick={() => {
                    setBirFormTab('2550Q');
                    navigateToPage('bir-forms');
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all w-full text-left"
                >
                  <FileText className="w-4 h-4" />
                  Forms
                </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-400 transition-all w-full text-left group",
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
              onClick={() => toggleDropdown('reports')}
              title={isCollapsed ? "Reports" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                isReportsOpen ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
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
                        onClick={() => handleNavClick(subItem.id)}
                        className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left"
                      >
                        <SubIcon className="w-4 h-4" />
                        {subItem.label}
                      </button>
                    );
                  })}

                  {/* AFS Draft - separate financial statement drafts */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => setIsAfsDraftOpen(!isAfsDraftOpen)}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left"
                    >
                      <span className="flex items-center gap-3">
                        <FileText className="w-4 h-4" />
                        AFS Draft
                      </span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isAfsDraftOpen ? "rotate-180" : "")} />
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
                          <button onClick={() => handleNavClick('afs-financial-position')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left">
                            <Landmark className="w-3.5 h-3.5" /> Financial Position
                          </button>
                          <button onClick={() => handleNavClick('afs-income-statements')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left">
                            <TrendingUp className="w-3.5 h-3.5" /> Income Statements
                          </button>
                          <button onClick={() => handleNavClick('cashflow')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left">
                            <ArrowLeftRight className="w-3.5 h-3.5" /> Cash Flow
                          </button>
                          <button onClick={() => handleNavClick('afs-equity-retained-earnings')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left">
                            <Scale className="w-3.5 h-3.5" /> Equity & Retained Earnings
                          </button>
                          <button onClick={() => handleNavClick('afs-ppe')} className="flex items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all w-full text-left">
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

          {/* Books Collapsible Dropdown */}
          <div className="flex flex-col">
            <button
              onClick={() => toggleDropdown('books')}
              title={isCollapsed ? "Books" : undefined}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl transition-all w-full text-left group",
                isBooksOpen ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
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
                        onClick={() => handleNavClick(subItem.id)}
                        className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400 transition-all w-full text-left"
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
                isSettingsOpen ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-800",
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
                      onClick={() => handleNavClick('business')}
                      className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left"
                    >
                      <Building2 className="w-4 h-4" />
                      Business Profiles
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleNavClick('clients')}
                        className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left"
                      >
                        <Users className="w-4 h-4" />
                        Client Profiles
                      </button>
                      <button
                        onClick={() => handleNavClick('business')}
                        className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left"
                      >
                        <Building2 className="w-4 h-4" />
                        Business Profiles
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleNavClick('tinlibrary')}
                    className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-all w-full text-left"
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
                      System Config
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
