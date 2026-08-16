import { Menu, Moon, Sun } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { currentClient, isDarkMode, setDarkMode, isSyncing } = useAccounting();
  const { user, isAdmin, signOut } = useAuth();

  return (
    // sticky + top-0 + z-30 keeps this bar frozen at the top of the
    // scrollable <main> in App.tsx while the page content scrolls under it
    <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 -mx-4 md:-mx-8 px-4 md:px-8 mb-6">
      <div className="flex items-center justify-between gap-4 py-4">
        {/* Company name — pinned top-left */}
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-2 bg-slate-200/60 dark:bg-white/10 hover:bg-slate-300/60 dark:hover:bg-white/20 rounded-xl transition-colors"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-white" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold flex flex-wrap items-center gap-2 text-slate-800 dark:text-white">
              <span className="hidden sm:inline">📊</span>
              {currentClient ? (currentClient.registeredName || currentClient.tradeName || 'CAPO Accounting Setup') : 'CAPO Accounting Setup'}
            </h1>
            {isSyncing && (
              <span className="text-[10px] text-blue-500 dark:text-blue-300 animate-pulse flex items-center gap-1 font-bold uppercase tracking-widest">
                <span className="w-1 h-1 bg-blue-500 dark:bg-blue-300 rounded-full animate-ping"></span>
                Syncing with Cloud...
              </span>
            )}
          </div>
        </div>

        {/* Dark/Light toggle — pinned top-right */}
        <button
          onClick={() => setDarkMode(!isDarkMode)}
          className="flex items-center gap-2 bg-slate-200/60 dark:bg-white/10 hover:bg-slate-300/60 dark:hover:bg-white/20 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-slate-300 dark:border-white/10 text-slate-700 dark:text-white"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDarkMode ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>
  );
}
