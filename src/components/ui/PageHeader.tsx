import React from 'react';

export interface PageHeaderProps {
  title: string;
  icon?: React.ReactNode;
  centered?: boolean;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, icon, centered, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={`flex items-center gap-3 px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur ${centered ? 'justify-center' : 'justify-between'}`}>
      <div className={`flex items-center gap-3 ${centered ? 'text-center' : ''}`}>
        {icon && <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800">{icon}</div>}
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
