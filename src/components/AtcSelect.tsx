import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { ATC_SCHEDULE } from '../lib/atcSchedule';
import { cn } from '../lib/utils';

interface AtcSelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Custom ATC / Nature of Income dropdown that always shows the withholding tax
 * rate prominently. The native <select> crammed `code — nature — rate` into a
 * single truncated line, so users could never see the rate at the end.
 *
 * Each option renders as a two-line row with a bold rate badge on the right
 * (always visible regardless of truncation), plus a search box to filter the
 * long BIR schedule by code, nature, or qualifier.
 */
export function AtcSelect({ value, onChange, className, placeholder = 'Select ATC code / nature of income…' }: AtcSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => ATC_SCHEDULE.find(e => e.code === value), [value]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus the search box right after opening so typing filters immediately.
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ATC_SCHEDULE;
    return ATC_SCHEDULE.filter(e =>
      e.code.toLowerCase().includes(q) ||
      e.nature.toLowerCase().includes(q) ||
      (e.qualifier || '').toLowerCase().includes(q) ||
      e.rateLabel.includes(q)
    );
  }, [query]);

  const select = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger — shows selected code + nature + a prominent rate badge. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="form-input w-full flex items-center justify-between gap-2 text-left hover:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <span className="shrink-0 font-mono text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">{selected.code}</span>
            <span className="truncate text-sm text-slate-700 dark:text-slate-200">{selected.nature}</span>
          </span>
        ) : (
          <span className="text-sm text-slate-400 truncate">{placeholder}</span>
        )}
        <span className="flex items-center gap-1.5 shrink-0">
          {selected && (
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md text-sm">{selected.rateLabel}</span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden flex flex-col">
          {/* Search box — sticky at top of the dropdown. */}
          <div className="relative shrink-0 border-b border-slate-100 dark:border-slate-700 p-2">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by code, nature, or rate…"
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Option list — rate badge is always visible on the right. */}
          <ul className="overflow-y-auto max-h-72 py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">No ATC code matches “{query}”.</li>
            )}
            {filtered.map(entry => {
              const isSelected = entry.code === value;
              return (
                <li key={entry.code}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => select(entry.code)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors',
                      isSelected && 'bg-indigo-50/60 dark:bg-indigo-900/20'
                    )}
                  >
                    <span className="shrink-0 font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded w-[52px] text-center">{entry.code}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.nature}</span>
                      {entry.qualifier && (
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">{entry.qualifier} · {entry.party}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-md text-sm min-w-[44px] text-center">{entry.rateLabel}</span>
                    {isSelected && <Check className="shrink-0 w-4 h-4 text-indigo-500" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
