import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Surface container — consistent border, radius and shadow across all pages. */
export function Card({ className, padded = false, ...props }: CardProps) {
  return <div className={cn('card-surface', padded && 'p-5', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b border-border', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-bold text-text-primary', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-text-muted mt-0.5', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 px-5 py-4 border-t border-border', className)} {...props} />;
}

/** KPI stat card used on dashboards — label, value, delta chip optional. */
export function StatCard({ label, value, delta, deltaLabel, icon, accent = 'brand' }: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaPositive?: boolean;
  deltaLabel?: string;
  icon?: ReactNode;
  accent?: 'brand' | 'success' | 'danger' | 'warning' | 'info';
}) {
  const accentRing: Record<string, string> = {
    brand: 'from-brand-500/10', success: 'from-success-500/10',
    danger: 'from-danger-500/10', warning: 'from-warning-500/10', info: 'from-info-500/10',
  };
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent pointer-events-none', accentRing[accent])} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
          {icon && <span className="text-text-muted">{icon}</span>}
        </div>
        <div className="mt-2 text-2xl font-extrabold tracking-tight text-text-primary tabular-nums">{value}</div>
        {delta && (
          <div className="mt-1.5 text-xs font-medium text-text-muted">
            <span className={delta?.startsWith('-') ? 'text-danger-600' : 'text-success-600'}>{delta}</span>
            {deltaLabel && <span className="ml-1">{deltaLabel}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
