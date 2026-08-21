import { useEffect, useRef, useState } from 'react';

interface ComboboxOption {
  id: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * A type-or-pick combobox that works consistently on every device.
 *
 * We used to rely on a native `<input list="...">` + `<datalist>` for this.
 * That's unreliable across devices - iOS Safari in particular does not show
 * datalist suggestions at all (a long-standing WebKit limitation), so the
 * "choose from suggestions" half of the field silently didn't work on
 * iPhone/iPad. This component renders its own dropdown, so tapping/clicking
 * an option always works the same way everywhere, while still allowing free
 * typing for accounts that aren't in the list yet.
 */
export function Combobox({ value, onChange, options, placeholder, className, inputClassName }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the value changes from outside
  // (e.g. switching Expense Class clears the selection).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close the dropdown on outside click/tap (mouse and touch).
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  const filtered =
    query.trim() === ''
      ? options
      : options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  const selectOption = (label: string) => {
    setQuery(label);
    onChange(label);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {isOpen && filtered.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
          role="listbox"
        >
          {filtered.map(option => (
            <li key={option.id} role="option" aria-selected={option.label === value}>
              {/* onMouseDown (not onClick) fires before the input's onBlur/outside-click
                  handlers, so tapping an option selects it instead of being dismissed first
                  - this is what makes selection reliable on touch devices too. */}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectOption(option.label)}
                className="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/40"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
