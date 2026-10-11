import { ReactNode, useEffect, useRef } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  centered?: boolean;
  actions?: ReactNode;
}

/** Standard header for a full page (icon + title). Each page renders this
 * directly rather than being wrapped by a shared page component -
 * navigation/mounting is handled by the router in App.tsx, and the sidebar
 * is always visible for navigating elsewhere (no back button needed).
 * Pass `centered` for report-style pages (Trial Balance, Balance Sheet,
 * Profit & Loss, Cash Flow, Asset Lapsing) where the title reads like a
 * document heading rather than app chrome. Pass `actions` for controls
 * (e.g. an "Add" button) that should sit at the far right of the header.
 *
 * The bar is frozen (sticky) directly beneath the global app Header while the
 * page scrolls. It publishes its own height as --page-header-h so table
 * headers (index.css) can freeze beneath it too. */
export function PageHeader({ title, icon, badge, centered = false, actions }: PageHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--page-header-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--page-header-h', '0px');
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`sticky top-[var(--app-header-h,56px)] flex items-center px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-20 shrink-0 ${centered ? 'justify-center' : 'justify-between'}`}
    >
      <div className="flex items-center gap-3">
        {icon && <span className="text-xl">{icon}</span>}
        <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {title}
          {badge}
        </h3>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
