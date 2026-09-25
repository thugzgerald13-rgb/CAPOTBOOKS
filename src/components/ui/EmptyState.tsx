import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Branded empty state with a primary CTA — replaces blank tables and
 *  "no data" placeholders across list pages. */
export function EmptyState({ icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center w-full',
      compact ? 'py-10 px-4' : 'py-16 px-6',
      className,
    )}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-subtle border border-border flex items-center justify-center text-text-muted mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-text-primary">{title}</h3>
      {description && <p className="text-sm text-text-muted mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
