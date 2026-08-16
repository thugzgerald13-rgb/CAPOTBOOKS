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
    <div className="bg-gradient-to-br from-blue-700 object-cover to-blue-900 text-white rounded-2xl p-5 md:p-6 mb-6 shadow-lg border-l-4 border-yellow-400 flex flex-col gap-3">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <button 
            className="md:hidden p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold flex flex-wrap items-center gap-3">
              <span className="hidden sm:inline">📊</span> 
              {currentClient ? (currentClient.registeredName || currentClient.tradeName || 'CAPO Accounting Setup') : 'CAPO Accounting Setup'}
            </h1>
            {isSyncing && (
              <span className="text-[10px] text-blue-200 animate-pulse flex items-center gap-1 mt-1 font-bold uppercase tracking-widest pl-9">
                <span className="w-1 h-1 bg-blue-200 rounded-full animate-ping"></span>
                Syncing with Cloud...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <button
            onClick={() => setDarkMode(!isDarkMode)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-white/10"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDarkMode ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    </div>
  );
}
