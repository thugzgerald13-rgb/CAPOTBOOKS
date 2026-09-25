import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label + control + error/hint wrapper — matches the existing .form-label pattern. */
export function Field({ label, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="label-base">
          {label} {required && <span className="text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, leftIcon, rightIcon, className, ...props }, ref) => (
    <div className="relative">
      {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">{leftIcon}</span>}
      <input
        ref={ref}
        className={cn('input-base', leftIcon && 'pl-9', rightIcon && 'pr-9', error && 'input-error', className)}
        {...props}
      />
      {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">{rightIcon}</span>}
    </div>
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  ({ error = false, className, ...props }, ref) => (
    <textarea ref={ref} className={cn('input-base min-h-[88px] resize-y', error && 'input-error', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(
  ({ error = false, className, children, ...props }, ref) => (
    <select ref={ref} className={cn('input-base appearance-none pr-9 bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat', error && 'input-error', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
