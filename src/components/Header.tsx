import { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Sun, Search, Plus, Bell, ChevronDown, LogOut, UserCircle, RefreshCw, CheckCircle2, FileText, Receipt, ShoppingCart, FileSignature, FolderUp, X } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { CommandPalette } from './ui/CommandPalette';
import { Badge } from './ui/Badge';
import { cn } from '../lib/utils';

interface HeaderProps {
  onMenuClick: () => void;
}

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { currentClient, isDarkMode, setDarkMode, isSyncing, navigateToPage } = useAccounting();
  const { user, isAdmin, userRole, signOut, isSubuser, hasPermission } = useAuth();
  const canUse = (permission: string) => !isSubuser || hasPermission(permission);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const quickAddRef = useClickOutside<HTMLDivElement>(() => setQuickAddOpen(false));
  const notifRef = useClickOutside<HTMLDivElement>(() => setNotifOpen(false));
  const userMenuRef = useClickOutside<HTMLDivElement>(() => setUserMenuOpen(false));

  // Publish the live height of this sticky bar as --app-header-h so page title
  // bars and table headers can freeze directly beneath it (see index.css).
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Global Cmd/Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const quickAddItems = [
    { label: 'New Invoice', icon: FileText, page: 'billing' },
    { label: 'New Bill / Expense', icon: ShoppingCart, page: 'purchases' },
    { label: 'New Income / Sale', icon: Receipt, page: 'sales' },
    { label: 'Journal Voucher', icon: FileSignature, page: 'journal-voucher' },
    { label: 'Upload Receipt / File', icon: FolderUp, page: 'files' },
  ];

  const initial = (user?.email || 'U').charAt(0).toUpperCase();

  return (
    <div ref={headerRef} className="sticky top-0 z-30 w-full bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 px-4 md:px-8 py-2.5">
        {/* Left: menu + company name + sync status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="md:hidden p-2 bg-slate-200/60 dark:bg-white/10 hover:bg-slate-300/60 dark:hover:bg-white/20 rounded-xl transition-colors"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-white" />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="text-lg md:text-xl font-bold flex flex-wrap items-center gap-2 text-slate-800 dark:text-white truncate">
              {currentClient
                ? (currentClient.taxpayerClassification === 'Individual'
                    ? (currentClient.tradeName || currentClient.registeredName || 'CAPO Accounting Setup')
                    : (currentClient.registeredName || currentClient.tradeName || 'CAPO Accounting Setup'))
                : 'CAPO Accounting Setup'}
            </h1>
            <span className={cn(
              "text-[10px] flex items-center gap-1 font-semibold uppercase tracking-widest",
              isSyncing ? "text-blue-500 dark:text-blue-300 animate-pulse" : "text-emerald-600 dark:text-emerald-400",
            )}>
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" /> Syncing with Cloud…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  All changes saved
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right: search + quick-add + notifications + dark toggle + user menu */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {/* Search / command palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:border-blue-400 dark:hover:border-blue-500 transition-colors text-sm w-44 lg:w-56"
            aria-label="Search (Ctrl+K)"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">Search…</span>
            <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">⌘K</kbd>
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="sm:hidden p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Quick-add (+) menu — hidden entirely for team members without edit_transactions */}
          <div className="relative" ref={quickAddRef} style={canUse('edit_transactions') ? undefined : { display: 'none' }}>
            <button
              onClick={() => { setQuickAddOpen(o => !o); setNotifOpen(false); setUserMenuOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm shadow-blue-600/30 transition-colors"
              aria-label="Quick add"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">New</span>
            </button>
            {quickAddOpen && (
              <div className="absolute right-0 mt-2 w-60 card-surface shadow-pop py-1.5 animate-scale-in z-40">
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Create new</p>
                {quickAddItems.map(item => (
                  <button
                    key={item.page}
                    onClick={() => { navigateToPage(item.page); setQuickAddOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-surface-subtle transition-colors text-left"
                  >
                    <item.icon className="w-4 h-4 text-text-muted" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(o => !o); setQuickAddOpen(false); setUserMenuOpen(false); }}
              className="relative p-2 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-50 dark:ring-slate-900" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 card-surface shadow-pop animate-scale-in z-40 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-sm font-bold text-text-primary">Notifications</span>
                  <button onClick={() => setNotifOpen(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-72 overflow-y-auto py-2">
                  <div className="px-4 py-3 flex gap-3 hover:bg-surface-subtle">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">All changes saved to cloud</p>
                      <p className="text-xs text-text-muted">Your data is up to date.</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 flex gap-3 hover:bg-surface-subtle">
                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">Compliance reminders appear here</p>
                      <p className="text-xs text-text-muted">Filing deadlines and BIR alerts will show in this panel.</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <Badge variant="success" dot>You're all caught up</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dark/Light toggle */}
          <button
            onClick={() => setDarkMode(!isDarkMode)}
            className="flex items-center gap-2 bg-slate-200/60 dark:bg-white/10 hover:bg-slate-300/60 dark:hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300 dark:border-white/10 text-slate-700 dark:text-white"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => { setUserMenuOpen(o => !o); setQuickAddOpen(false); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
              aria-label="Account menu"
            >
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                {initial}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hidden sm:block" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 card-surface shadow-pop animate-scale-in z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-surface-muted">
                  <p className="text-sm font-bold text-text-primary truncate">{user?.email || 'User'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="brand" size="sm">{userRole || 'User'}</Badge>
                    {isAdmin && <Badge variant="warning" size="sm">Admin</Badge>}
                  </div>
                </div>
                <div className="py-1.5">
                  <button
                    onClick={() => { navigateToPage('account-settings'); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-text-primary hover:bg-surface-subtle transition-colors text-left"
                  >
                    <UserCircle className="w-4 h-4 text-text-muted" /> Account Settings
                  </button>
                  <button
                    onClick={() => { signOut(); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-danger-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
