// Special-journal helpers (Run 016 / T016): cross-footing validation + Excel export.
// xlsx is dynamically imported inside exportJournalToExcel so it stays out of the main bundle.

export interface JournalColumnLike { id: string; name?: string; category?: 'Dr' | 'Cr' | string; type?: string; }
export interface JournalEntryLike { values?: Record<string, string | number>; [k: string]: any; }

const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};

/** Cross-foot a special journal: sum all Dr-category columns vs Cr-category columns. Returns totals + balance check. */
export function crossFootValidation(
  entries: JournalEntryLike[],
  columns: JournalColumnLike[],
): { debitTotal: number; creditTotal: number; balanced: boolean; difference: number; columnTotals: Record<string, number> } {
  const columnTotals: Record<string, number> = {};
  for (const c of columns) {
    columnTotals[c.id] = entries.reduce((s, e) => s + num(e.values?.[c.id] ?? (e as any)[c.id]), 0);
  }
  let debitTotal = 0, creditTotal = 0;
  for (const c of columns) {
    const cat = String(c.category || '').toLowerCase();
    if (cat === 'dr' || cat === 'debit') debitTotal += columnTotals[c.id] || 0;
    else if (cat === 'cr' || cat === 'credit') creditTotal += columnTotals[c.id] || 0;
  }
  const difference = debitTotal - creditTotal;
  return { debitTotal, creditTotal, balanced: Math.abs(difference) < 0.01, difference, columnTotals };
}

/** Export a special journal to a multi-column Excel file with column totals row. */
export async function exportJournalToExcel(
  entries: JournalEntryLike[],
  columns: JournalColumnLike[],
  filename: string,
) {
  const XLSX = await import('xlsx');
  const header = columns.map(c => c.name || c.id);
  const rows = entries.map(e => columns.map(c => {
    const v = e.values?.[c.id] ?? (e as any)[c.id] ?? '';
    return c.type === 'number' ? num(v) : v;
  }));
  const totals = columns.map(c => {
    if (c.type === 'number') return entries.reduce((s, e) => s + num(e.values?.[c.id] ?? (e as any)[c.id]), 0);
    return '';
  });
  const aoa = [header, ...rows, totals];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Journal');
  XLSX.writeFile(wb, filename);
}

/** Period-lock helper: a period is locked if its end date is in the past and the user has marked it closed. Stored per-client in localStorage. */
const lockKey = (clientId: string) => `capot.periodLocks.${clientId}`;
export function loadPeriodLocks(clientId: string): string[] {
  try { return JSON.parse(localStorage.getItem(lockKey(clientId)) || '[]'); } catch { return []; }
}
export function togglePeriodLock(clientId: string, periodKey: string): string[] {
  const cur = loadPeriodLocks(clientId);
  const next = cur.includes(periodKey) ? cur.filter(p => p !== periodKey) : [...cur, periodKey];
  try { localStorage.setItem(lockKey(clientId), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
export function isPeriodLocked(clientId: string, periodKey: string): boolean {
  return loadPeriodLocks(clientId).includes(periodKey);
}
