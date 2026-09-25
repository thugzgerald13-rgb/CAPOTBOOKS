import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/** Accessible modal dialog — Escape + backdrop close, body scroll lock.
 *  Replaces the ad-hoc fixed overlays scattered across transaction pages. */
export function Modal({
  open, onClose, title, description, children, footer,
  size = 'md', closeOnBackdrop = true, closeOnEscape = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (closeOnEscape && e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, closeOnEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
      />
      <div className={cn(
        'relative w-full card-surface shadow-modal animate-scale-in flex flex-col max-h-[90vh]',
        sizeClasses[size],
      )}>
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
            <div>
              {title && <h2 className="text-lg font-bold text-text-primary">{title}</h2>}
              {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-md text-text-muted hover:bg-surface-subtle hover:text-text-primary transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-surface-muted shrink-0 rounded-b-card">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
