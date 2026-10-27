import { forwardRef, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface DateParts {
  year: string;
  month: string;
  day: string;
}

export interface YearDropdownDateInputProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  title?: string;
  ariaLabel?: string;
}

const EMPTY_PARTS: DateParts = { year: '', month: '', day: '' };
const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: String(index + 1).padStart(2, '0'),
}));

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function normalizeBound(value?: string): string | undefined {
  if (!value) return undefined;
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[0] : undefined;
}

function parseParts(value?: string): DateParts {
  const normalized = normalizeBound(value);
  if (!normalized) return { ...EMPTY_PARTS };

  const [year, month, day] = normalized.split('-');
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (
    yearNumber < 1 || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 ||
    dayNumber > daysInMonth(yearNumber, monthNumber)
  ) return { ...EMPTY_PARTS };

  return { year, month, day };
}

function buildIsoDate(parts: DateParts): string {
  return `${parts.year.padStart(4, '0')}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`;
}

function clampDate(isoDate: string, min?: string, max?: string): string {
  const minDate = normalizeBound(min);
  const maxDate = normalizeBound(max);
  if (minDate && isoDate < minDate) return minDate;
  if (maxDate && isoDate > maxDate) return maxDate;
  return isoDate;
}

/**
 * Date control for entry screens. Month/day remain dropdowns and the year is
 * always selected from a four-digit dropdown; values emitted remain YYYY-MM-DD.
 */
export const YearDropdownDateInput = forwardRef<HTMLSelectElement, YearDropdownDateInputProps>(
  function YearDropdownDateInput(
    {
      value = '',
      onChange,
      className,
      min,
      max,
      disabled = false,
      required = false,
      name,
      title,
      ariaLabel = 'Date',
    },
    yearSelectRef,
  ) {
    const [parts, setParts] = useState<DateParts>(() => parseParts(value));

    useEffect(() => {
      setParts(parseParts(value));
    }, [value]);

    const yearOptions = useMemo(() => {
      const currentYear = new Date().getFullYear();
      const selectedYear = Number(parts.year) || 0;
      const minYear = Number(normalizeBound(min)?.slice(0, 4)) || 1900;
      const maxYear = Number(normalizeBound(max)?.slice(0, 4)) || Math.max(currentYear + 10, selectedYear);
      const lower = Math.max(1, Math.min(minYear, selectedYear || minYear));
      const upper = Math.min(9999, Math.max(maxYear, selectedYear || maxYear));
      const options: number[] = [];

      for (let year = lower; year <= upper; year += 1) {
        // Keep the selected legacy year visible even when it is outside min/max;
        // it is disabled and cannot be chosen as a new value.
        if ((year < minYear || year > maxYear) && year !== selectedYear) continue;
        options.push(year);
      }
      if (selectedYear > 0 && !options.includes(selectedYear)) options.push(selectedYear);
      return options.sort((a, b) => a - b);
    }, [parts.year, min, max]);

    const maxDay = parts.month
      ? daysInMonth(Number(parts.year) || new Date().getFullYear(), Number(parts.month))
      : 31;
    const dayOptions = Array.from({ length: maxDay }, (_, index) => String(index + 1).padStart(2, '0'));

    const updatePart = (key: keyof DateParts, nextValue: string) => {
      if (!nextValue) {
        setParts({ ...EMPTY_PARTS });
        onChange('');
        return;
      }

      const nextParts = { ...parts, [key]: nextValue };
      if (!nextParts.year || !nextParts.month || !nextParts.day) {
        setParts(nextParts);
        return;
      }

      const yearNumber = Number(nextParts.year);
      const monthNumber = Number(nextParts.month);
      const dayNumber = Math.min(Number(nextParts.day), daysInMonth(yearNumber, monthNumber));
      const candidate = buildIsoDate({ ...nextParts, day: String(dayNumber).padStart(2, '0') });
      const bounded = clampDate(candidate, min, max);
      const normalized = parseParts(bounded);
      setParts(normalized);
      onChange(bounded);
    };

    const selectClassName = 'min-w-0 bg-transparent text-current text-xs font-semibold leading-5 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50';
    const minYear = Number(normalizeBound(min)?.slice(0, 4)) || 0;
    const maxYear = Number(normalizeBound(max)?.slice(0, 4)) || 0;

    return (
      <div
        className={cn(
          'flex min-w-0 items-center gap-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20',
          className || 'min-w-[8rem] rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white',
        )}
        title={title}
        role="group"
        aria-label={ariaLabel}
      >
        <select
          aria-label={`${ariaLabel} month`}
          value={parts.month}
          onChange={event => updatePart('month', event.target.value)}
          disabled={disabled}
          required={required}
          className={cn(selectClassName, 'flex-[1.05]')}
        >
          <option value="">MM</option>
          {MONTHS.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
        </select>
        <select
          aria-label={`${ariaLabel} day`}
          value={parts.day}
          onChange={event => updatePart('day', event.target.value)}
          disabled={disabled}
          required={required}
          className={cn(selectClassName, 'flex-[0.85]')}
        >
          <option value="">DD</option>
          {dayOptions.map(day => <option key={day} value={day}>{day}</option>)}
        </select>
        <select
          ref={yearSelectRef}
          aria-label={`${ariaLabel} year`}
          name={name}
          value={parts.year}
          onChange={event => updatePart('year', event.target.value)}
          disabled={disabled}
          required={required}
          className={cn(selectClassName, 'flex-[1.35]')}
        >
          <option value="">YYYY</option>
          {yearOptions.map(year => {
            const outOfBounds = (minYear > 0 && year < minYear) || (maxYear > 0 && year > maxYear);
            return <option key={year} value={String(year).padStart(4, '0')} disabled={outOfBounds}>{String(year).padStart(4, '0')}</option>;
          })}
        </select>
      </div>
    );
  },
);

YearDropdownDateInput.displayName = 'YearDropdownDateInput';
