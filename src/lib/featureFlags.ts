// Feature flags + data backup helpers (Run 025 / T025). Flags persisted in localStorage.

export interface FeatureFlag { key: string; label: string; description: string; default: boolean; }

export const FEATURE_FLAGS: FeatureFlag[] = [
  { key: 'ai_ocr', label: 'AI OCR Auto-Coding', description: 'Auto-suggest account coding from uploaded receipts', default: true },
  { key: 'bank_reconcile', label: 'Bank Reconciliation', description: 'Import bank statements and auto-match', default: true },
  { key: 'multi_currency', label: 'Multi-Currency', description: 'Transactions in foreign currencies', default: false },
  { key: 'approval_workflow', label: 'Approval Workflow', description: 'Journal vouchers require approval', default: false },
  { key: 'recurring_jv', label: 'Recurring Journal Vouchers', description: 'Schedule repeating journal entries', default: true },
  { key: 'inventory_module', label: 'Inventory Module', description: 'Stock tracking and COGS', default: true },
];

const FLAG_KEY = 'capot.featureFlags';

export function getFlags(): Record<string, boolean> {
  try { return { ...Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, f.default])), ...JSON.parse(localStorage.getItem(FLAG_KEY) || '{}') }; }
  catch { return Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, f.default])); }
}
export function isFeatureEnabled(key: string): boolean { return !!getFlags()[key]; }
export function setFeatureFlag(key: string, value: boolean) {
  const cur = getFlags(); cur[key] = value;
  try { localStorage.setItem(FLAG_KEY, JSON.stringify(cur)); } catch { /* ignore */ }
}

/** Full data backup: serialize current client data to JSON. */
export function buildBackup(data: Record<string, any>): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}
export function parseBackup(text: string): Record<string, any> | null {
  try { const d = JSON.parse(text); return d && typeof d === 'object' ? d : null; } catch { return null; }
}
