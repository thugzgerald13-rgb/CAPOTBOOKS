// Report customization helpers (Run 017 / T017): accrual/cash-basis preference +
// saved report layouts (visible sections, column set) — persisted per client.

export type ReportBasis = 'accrual' | 'cash';

export interface ReportLayout {
  basis: ReportBasis;
  showSections: Record<string, boolean>;
  columns: string[];
  updatedAt: string;
}

const key = (clientId: string, report: string) => `capot.reportLayout.${report}.${clientId}`;

export function loadReportLayout(clientId: string, report: string, fallback: ReportLayout): ReportLayout {
  try {
    const raw = localStorage.getItem(key(clientId, report));
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

export function saveReportLayout(clientId: string, report: string, layout: ReportLayout) {
  try { localStorage.setItem(key(clientId, report), JSON.stringify({ ...layout, updatedAt: new Date().toISOString() })); } catch { /* ignore quota */ }
}

/** Cash-basis adjustment note: under cash basis, non-cash adjusting entries (depreciation, accruals, deferrals) are excluded from the P&L. This is an estimate from ledger data. */
export const CASH_BASIS_NOTE = 'Cash-basis presentation excludes non-cash adjusting entries (depreciation, accruals, deferrals). Estimated from ledger data.';
