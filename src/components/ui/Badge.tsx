import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-subtle text-text-secondary border border-border',
  brand:   'bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-800',
  success: 'bg-emerald-50 text-success-600 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  warning: 'bg-amber-50 text-warning-600 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  danger:  'bg-red-50 text-danger-600 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  info:    'bg-cyan-50 text-info-600 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
  outline: 'bg-transparent text-text-secondary border border-border-strong',
};

const dotColor: Record<BadgeVariant, string> = {
  neutral: 'bg-text-muted', brand: 'bg-brand-500', success: 'bg-success-500',
  warning: 'bg-warning-500', danger: 'bg-danger-500', info: 'bg-info-500', outline: 'bg-text-muted',
};

/** Status pill — invoice states, filing status, reconciliation state, etc. */
export function Badge({ variant = 'neutral', size = 'md', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold rounded-pill border whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[variant])} />}
      {children}
    </span>
  );
}
