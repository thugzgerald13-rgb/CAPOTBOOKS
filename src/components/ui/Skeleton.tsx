import { cn } from '@/lib/utils';

/** Shimmer placeholder — use while lazy routes / data load. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} aria-hidden="true" />;
}

/** A block of N text lines. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 w-full', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Card-shaped placeholder (KPI tiles, panels). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card-surface p-5 flex flex-col gap-3', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Table-shaped placeholder (rows × cols). */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="grid gap-3 px-5 py-3 bg-surface-muted border-b border-border" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 w-3/4" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3 px-5 py-3.5 border-b border-border" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className={cn('h-3.5', c === cols - 1 ? 'w-1/2' : 'w-full')} />)}
        </div>
      ))}
    </div>
  );
}

/** Full-page loading state — drop into Suspense fallback. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
