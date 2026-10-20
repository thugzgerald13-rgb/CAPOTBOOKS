// Chart of Accounts — CSV import/export + hierarchy flattening (Run 006 / T006).
// Parity: QuickBooks COA import / Xero chart of accounts CSV.
import Papa from 'papaparse';
import type { CoaAccount } from '../types';
import { isNominalAccountType } from './journalDefaults';

const pick = (row: Record<string, any>, ...keys: string[]): string => {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.trim().toLowerCase() === k.toLowerCase() && String(row[rk] ?? '').trim() !== '') {
        return String(row[rk]).trim();
      }
    }
  }
  return '';
};

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Cost', 'Expense', 'Other Income', 'Other Expense'];
const normalizeType = (t: string): string => {
  const v = t.trim().toLowerCase();
  // Non-operating lines take priority so "Interest Income" / "Interest Expense"
  // land in the dedicated Other Income / Other Expense sections (latest COA
  // format) instead of being collapsed into Revenue / Expense.
  if (v.includes('other income') || v.includes('interest income') || v.includes('gain on')) return 'Other Income';
  if (v.includes('other expense') || v.includes('interest expense') || v.includes('finance expense') || v.includes('loss on')) return 'Other Expense';
  const found = ACCOUNT_TYPES.find(x => x.toLowerCase() === v || x.toLowerCase().startsWith(v.slice(0, 4)));
  return found || (t.trim() || 'Asset');
};

export interface CoaImportResult {
  accounts: CoaAccount[];
  errors: string[];
}

/** Parse a CSV (with headers: Code, Name, Type, NormalSide, ParentCode, OpeningBalance, Hidden) into CoaAccount[] rows. Invalid rows are skipped and reported. */
export function parseCoaCsv(text: string): CoaImportResult {
  const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
  const accounts: CoaAccount[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  (result.data || []).forEach((row, i) => {
    const code = pick(row, 'Code', 'Account Code', 'ID', 'AccountID', 'Number');
    const name = pick(row, 'Name', 'Account Name', 'Title', 'Description');
    const type = normalizeType(pick(row, 'Type', 'Account Type', 'Category'));
    if (!code || !name) {
      errors.push(`Row ${i + 2}: missing Code or Name — skipped`);
      return;
    }
    if (seen.has(code)) { errors.push(`Row ${i + 2}: duplicate code ${code} — skipped`); return; }
    seen.add(code);
    const normalSideRaw = pick(row, 'NormalSide', 'Normal Side', 'Side').toLowerCase();
    const opening = parseFloat(pick(row, 'OpeningBalance', 'Opening Balance', 'PreviousYearBalance', 'Previous Year Balance', 'Balance').replace(/[₱,]/g, ''));
    const hiddenRaw = pick(row, 'Hidden', 'Inactive').toLowerCase();
    const parentId = pick(row, 'ParentCode', 'Parent Code', 'Parent', 'Subaccount Of');
    accounts.push({
      id: code,
      name,
      type,
      normalSide: normalSideRaw.startsWith('credit') ? 'credit' : 'debit',
      ...(parentId ? { parentId } : {}),
      ...(!Number.isNaN(opening) ? (isNominalAccountType(type) ? { previousYearBalance: opening } : { openingBalance: opening }) : {}),
      ...(hiddenRaw === 'true' || hiddenRaw === 'yes' || hiddenRaw === '1' ? { hidden: true } : {}),
    });
  });
  return { accounts, errors };
}

const esc = (v: string | number | undefined) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build CSV text for the given accounts. */
export function coaToCsv(accounts: CoaAccount[]): string {
  const header = ['Code', 'Name', 'Type', 'NormalSide', 'ParentCode', 'OpeningBalance', 'PreviousYearBalance', 'Hidden'];
  const rows = accounts.map(a => [
    a.id, a.name, a.type, a.normalSide || 'debit', a.parentId || '', isNominalAccountType(a.type) ? '' : (a.openingBalance ?? ''), isNominalAccountType(a.type) ? (a.previousYearBalance ?? '') : '', a.hidden ? 'TRUE' : 'FALSE',
  ].map(esc).join(','));
  return [header.join(','), ...rows].join('\n');
}

/** Trigger a browser download of the COA as CSV. */
export function downloadCoaCsv(accounts: CoaAccount[], filename = 'chart-of-accounts.csv') {
  const blob = new Blob([coaToCsv(accounts)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface HierarchyAccount extends CoaAccount {
  __depth: number;
}

/** Flatten accounts into parent-before-children order with a __depth field (for indented tree rendering). Orphans (parent not found) are treated as roots. */
export function flattenCoaHierarchy(accounts: CoaAccount[]): HierarchyAccount[] {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const childrenOf = new Map<string, CoaAccount[]>();
  const roots: CoaAccount[] = [];
  for (const a of accounts) {
    if (a.parentId && byId.has(a.parentId)) {
      const list = childrenOf.get(a.parentId) || [];
      list.push(a);
      childrenOf.set(a.parentId, list);
    } else {
      roots.push(a);
    }
  }
  roots.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  childrenOf.forEach(list => list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })));
  const out: HierarchyAccount[] = [];
  const walk = (list: CoaAccount[], depth: number) => {
    for (const a of list) {
      out.push({ ...a, __depth: depth });
      const kids = childrenOf.get(a.id);
      if (kids?.length) walk(kids, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}
