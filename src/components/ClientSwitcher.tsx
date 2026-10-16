import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import type { Client } from '../types';
import { cn } from '../lib/utils';

/**
 * Canonical display label for a client / business profile, matching the rule
 * used in the Header: Individual taxpayers show their trade name first,
 * corporate taxpayers show their registered name first.
 */
export function clientDisplayName(
  c: Pick<Client, 'taxpayerClassification' | 'tradeName' | 'registeredName' | 'name'> | null | undefined
): string {
  if (!c) return 'Unnamed Client';
  return c.taxpayerClassification === 'Individual'
    ? c.tradeName || c.registeredName || c.name || 'Unnamed Client'
    : c.registeredName || c.tradeName || c.name || 'Unnamed Client';
}

interface ClientSwitcherProps {
  /** Map of client id -> client. For team subusers this is already filtered
   *  server-side to only the clients the member is permitted to access. */
  clients: Record<string, Client>;
  currentClientId: string | null;
  onSwitch: (clientId: string) => void;
  className?: string;
  buttonClassName?: string;
}

/**
 * Dropdown that lets a user switch between client workspaces. Intended for the
 * global Header so that managed staff / team members — who cannot reach the
 * /clients management page (it requires the `manage_settings` permission) —
 * can still move between every client they were granted access to. The list
 * only ever contains clients the caller is permitted to see, so no extra
 * authorization check is needed here.
 */
export function ClientSwitcher({
  clients,
  currentClientId,
  onSwitch,
  className,
  buttonClassName,
}: ClientSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Clear the transient "switching…" spinner once the active client catches up
  // (or after a short backstop, in case the parent re-renders out of band).
  useEffect(() => {
    if (pendingId && pendingId === currentClientId) setPendingId(null);
  }, [currentClientId, pendingId]);
  useEffect(() => {
    if (!pendingId) return;
    const t = window.setTimeout(() => setPendingId(null), 2500);
    return () => window.clearTimeout(t);
  }, [pendingId]);

  const list = useMemo(
    () =>
      Object.values(clients).sort((a, b) =>
        clientDisplayName(a).localeCompare(clientDisplayName(b))
      ),
    [clients]
  );
  const current = currentClientId ? clients[currentClientId] ?? null : null;

  const handleSelect = (id: string) => {
    if (id === currentClientId) {
      setOpen(false);
      return;
    }
    setPendingId(id);
    setOpen(false);
    onSwitch(id);
  };

  return (
    <div className={cn('relative min-w-0', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'group flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 -mx-1.5 text-left transition-colors hover:bg-slate-200/50 dark:hover:bg-white/10',
          buttonClassName
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch client workspace"
      >
        <span className="truncate">{current ? clientDisplayName(current) : 'Select a client'}</span>
        {pendingId ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
        ) : (
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 dark:group-hover:text-slate-200',
              open && 'rotate-180'
            )}
          />
        )}
      </button>

      {open && (
        <div className="card-surface animate-scale-in absolute left-0 top-full z-40 mt-1.5 w-72 overflow-hidden shadow-pop">
          <div className="border-b border-border bg-surface-muted px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Switch client workspace
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {list.length} client{list.length === 1 ? '' : 's'} available
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
            {list.map((c) => {
              const active = c.id === currentClientId;
              const pending = c.id === pendingId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => handleSelect(c.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                      active
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-surface-subtle'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                      )}
                    >
                      {active ? <Check className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          active
                            ? 'font-bold text-blue-700 dark:text-blue-300'
                            : 'font-medium text-text-primary'
                        )}
                      >
                        {clientDisplayName(c)}
                      </span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {c.tin ? `TIN ${c.tin}` : 'No TIN on file'}
                        {pending && (
                          <span className="ml-2 font-semibold text-blue-500">switching…</span>
                        )}
                      </span>
                    </span>
                    {pending && (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-500" />
                    )}
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
