// Reconciliation auto-match rules (Run 019 / T019): user-defined rules that suggest
// an account title for a bank transaction based on description keywords.
// Persisted per client in localStorage.

export interface ReconcileRule {
  id: string;
  contains: string; // keyword to match in description (case-insensitive)
  accountTitle: string; // suggested COA account title
  type: 'expense' | 'income';
}

const key = (clientId: string) => `capot.reconcileRules.${clientId}`;

export function loadReconcileRules(clientId: string): ReconcileRule[] {
  try { return JSON.parse(localStorage.getItem(key(clientId)) || '[]'); } catch { return []; }
}

export function saveReconcileRules(clientId: string, rules: ReconcileRule[]) {
  try { localStorage.setItem(key(clientId), JSON.stringify(rules)); } catch { /* ignore */ }
}

/** Default starter rules for PH businesses. */
export const DEFAULT_RECONCILE_RULES: ReconcileRule[] = [
  { id: 'r-meralco', contains: 'meralco', accountTitle: 'Utilities Expense', type: 'expense' },
  { id: 'r-maynilad', contains: 'maynilad', accountTitle: 'Utilities Expense', type: 'expense' },
  { id: 'r-salary', contains: 'salary', accountTitle: 'Salaries Expense', type: 'expense' },
  { id: 'r-rent', contains: 'rent', accountTitle: 'Rent Expense', type: 'expense' },
  { id: 'r-customer', contains: 'payment', accountTitle: 'Accounts Receivable', type: 'income' },
  { id: 'r-gcash', contains: 'gcash', accountTitle: 'Cash on Hand', type: 'income' },
];

/** Match a bank transaction against rules; returns the suggested account title (or null). */
export function matchTransaction(description: string, rules: ReconcileRule[]): ReconcileRule | null {
  const desc = (description || '').toLowerCase();
  for (const rule of rules) {
    if (rule.contains && desc.includes(rule.contains.toLowerCase())) return rule;
  }
  return null;
}
