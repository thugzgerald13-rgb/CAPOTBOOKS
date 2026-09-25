import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastOptions {
  message: string;
  description?: string;
  duration?: number; // ms; 0 = sticky
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
}

type Listener = (toasts: ToastItem[]) => void;
let toasts: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() { listeners.forEach(l => l([...toasts])); }

function push(type: ToastType, message: string, opts?: Partial<ToastOptions>): number {
  const id = nextId++;
  const duration = opts?.duration ?? (type === 'error' ? 6000 : 3500);
  toasts = [...toasts, { id, type, message, duration, description: opts?.description, action: opts?.action }];
  emit();
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

/** Imperative toast API — call from anywhere (no context needed):
 *  toast.success('Saved'), toast.error('Failed'), toast.warning, toast.info.
 *  toasts stack and auto-dismiss; returns id for manual dismiss(). */
export const toast = {
  success: (message: string, opts?: Partial<ToastOptions>) => push('success', message, opts),
  error: (message: string, opts?: Partial<ToastOptions>) => push('error', message, opts),
  warning: (message: string, opts?: Partial<ToastOptions>) => push('warning', message, opts),
  info: (message: string, opts?: Partial<ToastOptions>) => push('info', message, opts),
  loading: (message: string, opts?: Partial<ToastOptions>) => push('loading', message, { duration: 0, ...opts }),
  dismiss,
};

const typeConfig: Record<ToastType, { icon: typeof CheckCircle2; bar: string; ring: string; text: string }> = {
  success: { icon: CheckCircle2, bar: 'bg-success-500', ring: 'border-success-200 dark:border-success-800', text: 'text-success-600 dark:text-success-400' },
  error:   { icon: XCircle,     bar: 'bg-danger-500',  ring: 'border-danger-200 dark:border-danger-800',   text: 'text-danger-600 dark:text-danger-400' },
  warning: { icon: AlertTriangle, bar: 'bg-warning-500', ring: 'border-warning-200 dark:border-warning-800', text: 'text-warning-600 dark:text-warning-400' },
  info:    { icon: Info,        bar: 'bg-info-500',    ring: 'border-info-200 dark:border-info-800',       text: 'text-info-600 dark:text-info-400' },
  loading: { icon: Loader2,     bar: 'bg-brand-500',   ring: 'border-brand-200 dark:border-brand-800',     text: 'text-brand-600 dark:text-brand-400' },
};

/** Render once at the app root (App.tsx). Subscribes to the imperative store. */
export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l: Listener = t => setItems(t);
    listeners.push(l);
    setItems([...toasts]);
    return () => { listeners = listeners.filter(x => x !== l); };
  }, []);

  const close = useCallback((id: number) => dismiss(id), []);

  return (
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none" aria-live="polite">
      {items.map(t => {
        const cfg = typeConfig[t.type];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto relative overflow-hidden rounded-xl border bg-surface shadow-pop animate-scale-in',
              cfg.ring,
            )}
            role="status"
          >
            <div className={cn('absolute left-0 top-0 bottom-0 w-1', cfg.bar)} />
            <div className="flex items-start gap-3 pl-4 pr-3 py-3">
              <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', cfg.text, t.type === 'loading' && 'animate-spin')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary leading-snug">{t.message}</p>
                {t.description && <p className="text-xs text-text-muted mt-0.5">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => { t.action!.onClick(); close(t.id); }}
                    className="mt-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(t.id)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {t.duration && t.duration > 0 && (
              <div className="h-0.5 bg-surface-subtle w-full">
                <div
                  className={cn('h-full origin-left', cfg.bar)}
                  style={{ animation: `toast-shrink ${t.duration}ms linear forwards` }}
                />
              </div>
            )}
          </div>
        );
      })}
      <style>{`@keyframes toast-shrink { from { transform: scaleX(1) } to { transform: scaleX(0) } }`}</style>
    </div>
  );
}
