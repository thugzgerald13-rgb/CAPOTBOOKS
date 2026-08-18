import { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  centered?: boolean;
}

/** Standard header for a full page (icon + title). Each page renders this
 * directly rather than being wrapped by a shared page component -
 * navigation/mounting is handled by the router in App.tsx, and the sidebar
 * is always visible for navigating elsewhere (no back button needed).
 * Pass `centered` for report-style pages (Trial Balance, Balance Sheet,
 * Profit & Loss, Cash Flow, Asset Lapsing) where the title reads like a
 * document heading rather than app chrome. */
export function PageHeader({ title, icon, badge, centered = false }: PageHeaderProps) {
  return (
    <div className={`flex items-center px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-10 shrink-0 ${centered ? 'justify-center' : 'justify-between'}`}>
      <div className="flex items-center gap-3">
        {icon && <span className="text-xl">{icon}</span>}
        <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {title}
          {badge}
        </h3>
      </div>
    </div>
  );
}
