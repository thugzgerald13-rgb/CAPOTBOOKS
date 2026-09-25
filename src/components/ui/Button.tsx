import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/25',
  secondary: 'bg-surface-subtle text-text-primary border border-border hover:bg-border/50',
  outline:   'border border-border-strong bg-transparent text-text-primary hover:bg-surface-subtle',
  ghost:     'bg-transparent text-text-secondary hover:bg-surface-subtle hover:text-text-primary',
  danger:    'bg-danger-600 text-white hover:bg-danger-500 shadow-sm shadow-danger-600/25',
  success:   'bg-success-600 text-white hover:bg-success-500 shadow-sm shadow-success-600/25',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-xs rounded-md gap-1.5',
  md:   'h-10 px-4 text-sm rounded-lg gap-2',
  lg:   'h-12 px-6 text-base rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
};

/** Commercial-grade button with variants, sizes, loading state and icon slots.
 *  Drop-in replacement for the ad-hoc <button className="px-6 py-3 bg-blue-600 ...">
 *  strings used across the app. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth, className, children, disabled, type = 'button', ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 select-none whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : leftIcon}
      {size !== 'icon' && children}
      {!loading && rightIcon}
    </button>
  ),
);
Button.displayName = 'Button';
