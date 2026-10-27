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

const MIN_SELECTABLE_YEAR = 2020;
const EMPTY_PARTS: DateParts = { year: '', month: '', day: '' };

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

function effectiveMinDate(min?: string): string {
  const requestedMin = normalizeBound(min);
  const floor = `${MIN_SELECTABLE_YEAR}-01-01`;
  return requestedMin && requestedMin > floor ? requestedMin : floor;
}

function clampDate(isoDate: string, min?: string, max?: string): string {
  const minDate = effectiveMinDate(min);
  const maxDate = normalizeBound(max);
  if (isoDate < minDate) return minDate;
  if (maxDate && isoDate > maxDate) return maxDate;
  return isoDate;
}

function isValidDateParts(parts: DateParts): boolean {
  if (!parts.year || !parts.month || !parts.day) return false;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return (
    Number.isInteger(year) && year >= MIN_SELECTABLE_YEAR && year <= 9999 &&
    Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(day) && day >= 1 && day <= 31
  );
}

/**
 * Date control for entry screens. Only the year is a dropdown (four digits,
 * 2020 onward); month and day are editable numeric text fields. Emitted values
 * remain YYYY-MM-DD so existing form and database behavior is preserved.
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
      const selectedYear = Number(parts.year) >= MIN_SELECTABLE_YEAR ? Number(parts.year) : 0;
      const requestedMinYear = Number(normalizeBound(min)?.slice(0, 4)) || MIN_SELECTABLE_YEAR;
      const requestedMaxYear = Number(normalizeBound(max)?.slice(0, 4)) || currentYear + 10;
      const minYear = Math.max(MIN_SELECTABLE_YEAR, requestedMinYear);
      const lower = selectedYear > 0 ? Math.max(MIN_SELECTABLE_YEAR, Math.min(minYear, selectedYear)) : minYear;
      const upper = Math.max(requestedMaxYear, selectedYear);
      const options: number[] = [];

      for (let year = lower; year <= upper; year += 1) {
        if (year < minYear || year > requestedMaxYear) {
          if (year !== selectedYear) continue;
        }
        // The year dropdown must never offer a year earlier than 2020.
        if (year >= MIN_SELECTABLE_YEAR) options.push(year);
      }
      return options.sort((a, b) => a - b);
    }, [parts.year, min, max]);

    const updateTextPart = (key: 'month' | 'day', rawValue: string) => {
      const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 2);
      setParts(previous => ({ ...previous, [key]: digitsOnly }));
    };

    const commitParts = (nextParts: DateParts) => {
      // Partial values must remain editable while the user moves between fields.
      // The date is committed only when all three parts form a valid date.
      if (!isValidDateParts(nextParts)) return;

      const monthNumber = Number(nextParts.month);
      const adjustedDay = Math.min(Number(nextParts.day), daysInMonth(Number(nextParts.year), monthNumber));
      const candidate = buildIsoDate({
        year: nextParts.year,
        month: String(monthNumber).padStart(2, '0'),
        day: String(adjustedDay).padStart(2, '0'),
      });
      const minDate = effectiveMinDate(min);
      const maxDate = normalizeBound(max);
      if (maxDate && maxDate < minDate) return;

      const bounded = clampDate(candidate, min, max);
      if (Number(bounded.slice(0, 4)) < MIN_SELECTABLE_YEAR) return;
      const normalized = parseParts(bounded);
      setParts(normalized);
      onChange(bounded);
    };

    const handleYearChange = (nextYear: string) => {
      if (!nextYear) {
        setParts({ ...EMPTY_PARTS });
        onChange('');
        return;
      }
      const nextParts = { ...parts, year: nextYear };
      setParts(nextParts);
      // Allow users to select the year before completing month/day.
      commitParts(nextParts);
    };

    const handleTextBlur = () => {
      commitParts(parts);
    };

    const selectClassName = 'min-w-0 bg-transparent text-current text-xs font-semibold leading-5 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50';
    const inputClassName = 'min-w-0 bg-transparent text-current text-xs font-semibold leading-5 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-slate-400';
    const minYear = Math.max(MIN_SELECTABLE_YEAR, Number(normalizeBound(min)?.slice(0, 4)) || MIN_SELECTABLE_YEAR);
    const maxYear = Number(normalizeBound(max)?.slice(0, 4)) || new Date().getFullYear() + 10;

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
        <input
          aria-label={`${ariaLabel} month`}
          type="text"
          inputMode="numeric"
          pattern="(?:0?[1-9]|1[0-2])"
          maxLength={2}
          placeholder="MM"
          value={parts.month}
          onChange={event => updateTextPart('month', event.target.value)}
          onBlur={handleTextBlur}
          disabled={disabled}
          required={required}
          className={cn(inputClassName, 'w-8 flex-[1.05] text-center')}
        />
        <span aria-hidden="true" className="select-none text-current/50">/</span>
        <input
          aria-label={`${ariaLabel} day`}
          type="text"
          inputMode="numeric"
          pattern="(?:0?[1-9]|[12][0-9]|3[01])"
          maxLength={2}
          placeholder="DD"
          value={parts.day}
          onChange={event => updateTextPart('day', event.target.value)}
          onBlur={handleTextBlur}
          disabled={disabled}
          required={required}
          className={cn(inputClassName, 'w-8 flex-[0.85] text-center')}
        />
        <span aria-hidden="true" className="select-none text-current/50">/</span>
        <select
          ref={yearSelectRef}
          aria-label={`${ariaLabel} year`}
          name={name}
          value={Number(parts.year) >= MIN_SELECTABLE_YEAR ? parts.year : ''}
          onChange={event => handleYearChange(event.target.value)}
          disabled={disabled}
          required={required}
          className={cn(selectClassName, 'flex-[1.35]')}
        >
          <option value="">YYYY</option>
          {yearOptions.map(year => {
            const outOfBounds = year < minYear || year > maxYear;
            return <option key={year} value={String(year).padStart(4, '0')} disabled={outOfBounds}>{String(year).padStart(4, '0')}</option>;
          })}
        </select>
      </div>
    );
  },
);

YearDropdownDateInput.displayName = 'YearDropdownDateInput';
