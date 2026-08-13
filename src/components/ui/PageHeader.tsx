import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { useAccounting } from '../../context/AccountingContext';

interface PageHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** Standard header for a full page (back button + icon + title). Each page
 * renders this directly rather than being wrapped by a shared page
 * component - navigation/mounting is handled by the router in App.tsx. */
export function PageHeader({ title, icon, badge }: PageHeaderProps) {
  const { navigateToPage } = useAccounting();

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-10 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateToPage(null)}
          className="p-2 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors shrink-0"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {icon && <span className="text-xl">{icon}</span>}
        <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {title}
          {badge}
        </h3>
      </div>
    </div>
  );
}
