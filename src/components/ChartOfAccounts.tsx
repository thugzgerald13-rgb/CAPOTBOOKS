import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Plus, Trash2, RefreshCcw, Edit2, ClipboardList, Check, X, Columns, ArrowUp, ArrowDown, Upload, MoreVertical } from 'lucide-react';
import { flattenCoaHierarchy } from '../lib/coaImport';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { useGranularPermissions } from '../lib/useGranularPermissions';
import { supabase } from '../lib/supabase';
import { CoaAccount } from '../types';
import { cn } from '../lib/utils';
import { balanceFor } from '../lib/accountingBalances';

import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide, isNominalAccountType, getDefaultAccountsForIndustry, sortAccountsChronologically } from '../lib/journalDefaults';
export { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide };

const ACCOUNT_TYPES = ['Asset', 'Liabilities', 'Equity', 'Capital', 'Revenue', 'Costs', 'Expense'];

// BIR taxpayer classification drives which ownership/equity account type is
// valid for the client's Chart of Accounts. Existing CAPOT profiles use
// `Individual` vs `Non-Individual`; sole-proprietor wording is also accepted
// so the rule continues to work if the profile value is expanded later.
function isIndividualTaxpayer(classification?: string): boolean {
  const value = String(classification || '').trim().toLowerCase();
  return value === 'individual' || value.includes('sole proprietor') || value.includes('sole proprietorship');
}

function ownershipAccountType(classification?: string): 'Equity' | 'Capital' {
  return isIndividualTaxpayer(classification) ? 'Capital' : 'Equity';
}

function defaultAccountsFor(
  classification: string | undefined,
  format: 'numeric' | 'alphanumeric',
  industry?: import('../types').ClientIndustry
): CoaAccount[] {
  const ownershipType = ownershipAccountType(classification);
  return getDefaultAccountsForIndustry(industry, format).map(account =>
    account.type === 'Equity' || account.type === 'Capital'
      ? { ...account, type: ownershipType, normalSide: getNormalSide(ownershipType) }
      : { ...account }
  );
}

// Smart Chart of Accounts import helpers.
// The uploader intentionally does not require headers. When headers are present,
// they are used; otherwise CAPOT infers the account title, account type, code and
// opening balance from the contents of each row.
function normalizeHeaderToken(value: any): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const IMPORT_TITLE_ALIASES = [
  'accounttitle', 'accountname', 'account', 'acctname', 'accttitle', 'ledgeraccount',
  'ledgername', 'particular', 'particulars', 'description', 'accountdescription',
  'ledger'
];
const IMPORT_TYPE_ALIASES = [
  'accounttype', 'type', 'category', 'classification', 'accountclassification',
  'class', 'group'
];
const IMPORT_CODE_ALIASES = [
  'accountcode', 'acctcode', 'code', 'accountno', 'accountnumber', 'acctno',
  'accountid', 'ledgercode', 'glcode', 'glaccount'
];
const IMPORT_OPENING_ALIASES = [
  'openingbalance', 'previousyearbalance', 'prevyearbalance', 'previousbalance', 'openbalance', 'beginningbalance', 'opening', 'balance',
  'openingamount', 'openingdebit', 'openingcredit', 'debitbalance', 'creditbalance'
];
const IMPORT_LEVEL_ALIASES = [
  'accountlevel', 'level', 'accountclass', 'hierarchylevel', 'subaccount'
];
const IMPORT_DEBIT_ALIASES = ['openingdebit', 'debitbalance'];
const IMPORT_CREDIT_ALIASES = ['openingcredit', 'creditbalance'];

const ACCOUNT_TYPE_LABELS: Array<{ label: string; type: string }> = [
  { label: 'asset', type: 'Asset' }, { label: 'assets', type: 'Asset' },
  { label: 'currentasset', type: 'Asset' }, { label: 'noncurrentasset', type: 'Asset' },
  { label: 'liability', type: 'Liabilities' }, { label: 'liabilities', type: 'Liabilities' },
  { label: 'currentliability', type: 'Liabilities' }, { label: 'noncurrentliability', type: 'Liabilities' },
  { label: 'equity', type: 'Equity' }, { label: 'ownersequity', type: 'Equity' },
  { label: 'capital', type: 'Capital' }, { label: 'income', type: 'Revenue' },
  { label: 'revenue', type: 'Revenue' }, { label: 'sales', type: 'Revenue' },
  { label: 'cost', type: 'Costs' }, { label: 'costs', type: 'Costs' },
  { label: 'costofsales', type: 'Costs' }, { label: 'cogs', type: 'Costs' },
  { label: 'expense', type: 'Expense' }, { label: 'expenses', type: 'Expense' },
];

const TYPE_BASE_CODE: Record<string, number> = {
  Asset: 100000,
  Liabilities: 200000,
  Equity: 300000,
  Capital: 300000,
  Revenue: 400000,
  Costs: 500000,
  Expense: 600000,
};

const TYPE_ALPHA_PREFIX: Record<string, string> = {
  Asset: 'AS', Liabilities: 'LI', Equity: 'EQ', Capital: 'EQ', Revenue: 'RE', Costs: 'CO', Expense: 'EX'
};

function normalizeUploadedType(raw: string): { type: string; inferred: boolean } {
  const t = normalizeHeaderToken(raw);
  if (!t) return { type: 'Expense', inferred: true };
  const exact = ACCOUNT_TYPE_LABELS.find(item => item.label === t);
  if (exact) return { type: exact.type, inferred: false };
  if (t.includes('liabil')) return { type: 'Liabilities', inferred: false };
  if (t.includes('equity')) return { type: 'Equity', inferred: false };
  if (t.includes('capital')) return { type: 'Capital', inferred: false };
  if (t.includes('asset')) return { type: 'Asset', inferred: false };
  if (t.includes('revenue') || t.includes('income') || t === 'sales') return { type: 'Revenue', inferred: false };
  if (t.includes('cogs') || t.includes('costofsales') || t === 'cost' || t === 'costs') return { type: 'Costs', inferred: false };
  if (t.includes('expense')) return { type: 'Expense', inferred: false };
  return { type: raw.trim() ? raw.trim() : 'Expense', inferred: true };
}

/** Keeps the imported figure in the right field when an account's type changes (Income/Costs/Expense -> previousYearBalance). */
function moveBalanceForType(account: CoaAccount): CoaAccount {
  const next: CoaAccount = { ...account };
  const value = next.openingBalance ?? next.previousYearBalance;
  delete next.openingBalance;
  delete next.previousYearBalance;
  if (value !== undefined) {
    if (isNominalAccountType(next.type)) next.previousYearBalance = value;
    else next.openingBalance = value;
  }
  return next;
}

function parseOpeningBalanceValue(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  const original = String(value).trim();
  if (!original) return undefined;
  const cleaned = original.replace(/[₱$€£¥]/g, '').replace(/\s/g, '').replace(/,/g, '');
  const negative = /^\(.*\)$/.test(cleaned);
  const numeric = cleaned.replace(/[()]/g, '').replace(/^\+/, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(numeric)) return undefined;
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

function looksLikeDate(value: any): boolean {
  const s = String(value ?? '').trim();
  return !!s && (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s) || /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(s));
}

function looksLikeAccountCode(value: any): boolean {
  const s = String(value ?? '').trim().replace(/[\s-]/g, '');
  if (!s || looksLikeDate(s)) return false;
  return /^\d{4,8}$/.test(s) || /^[A-Za-z]{1,4}\d{2,8}$/.test(s);
}

function inferAccountTypeFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/(payable|accrued|loan|note payable|mortgage|lease liability|withholding|vat payable|tax payable|sss payable|philhealth payable|pag[- ]?ibig payable|customer deposit|contract liabil)/i.test(t)) return 'Liabilities';
  if (/(capital|owner'?s? equity|share capital|retained earnings|partner'?s? capital|drawings?|owner'?s? withdrawal|dividend)/i.test(t)) return 'Equity';
  if (/(cost of (goods|sales)|cogs|direct (materials?|labor)|factory overhead|manufacturing overhead|subcontractor|project cost|job cost|purchases)/i.test(t)) return 'Costs';
  if (/(expense|salary|wages?|rent|utilities|electricity|water|telephone|internet|insurance|depreciation|amortization|repairs?|maintenance|advertising|marketing|professional fee|bank charge|interest expense|tax expense|office supplies)/i.test(t)) return 'Expense';
  if (/(revenue|sales|income|service fee|service income|professional fees|consulting fee|rental income|interest income|other income|gain on)/i.test(t)) return 'Revenue';
  if (/(cash|bank|receivable|inventory|inventories|supplies|prepaid|deposit|advance|equipment|property|plant|building|land|vehicle|computer|furniture|fixture|asset|input vat|creditable withholding)/i.test(t)) return 'Asset';
  return 'Expense';
}

function scoreAccountTitle(value: any): number {
  const s = String(value ?? '').trim();
  if (!s || s.length < 2 || s.length > 100 || looksLikeDate(s)) return -100;
  if (parseOpeningBalanceValue(s) !== undefined || looksLikeAccountCode(s)) return -80;
  const normalized = normalizeHeaderToken(s);
  if (ACCOUNT_TYPE_LABELS.some(x => x.label === normalized) || /^(debit|credit|dr|cr)$/i.test(s)) return -80;
  let score = 2 + (/[A-Za-z]/.test(s) ? 2 : 0) + (/\s/.test(s) ? 1 : 0);
  const hints = ['cash','bank','receivable','inventory','supplies','prepaid','equipment','property','building','land','vehicle','payable','loan','capital','equity','retained','sales','revenue','income','cost','cogs','salary','wage','rent','utilities','insurance','depreciation','repairs','maintenance','advertising','professional fee','tax'];
  if (hints.some(h => s.toLowerCase().includes(h))) score += 4;
  if (isSummaryAccountTitle(s)) score -= 20;
  return score;
}

function isSummaryAccountTitle(value: string): boolean {
  return /^(total|subtotal|grandtotal|netincome|netloss|grossprofit|grossloss|totalassets|totalliabilities|totalequity|totalrevenue|totalexpenses)/.test(normalizeHeaderToken(value));
}

function inferHeaderIndex(headers: any[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeaderToken);
  return normalized.findIndex(h => aliases.includes(h));
}

function detectHeaderRow(rawRows: any[][]): {
  headerRowIndex: number;
  headers: string[];
  titleIndex?: number;
  typeIndex?: number;
  codeIndex?: number;
  openingIndex?: number;
  levelIndex?: number;
  debitIndex?: number;
  creditIndex?: number;
} {
  const scanCount = Math.min(rawRows.length, 8);
  let best = { headerRowIndex: -1, headers: [] as string[], score: -1 };
  for (let i = 0; i < scanCount; i++) {
    const headers = (rawRows[i] || []).map(v => String(v ?? '').trim());
    let score = 0;
    if (inferHeaderIndex(headers, IMPORT_TITLE_ALIASES) >= 0) score += 4;
    if (inferHeaderIndex(headers, IMPORT_TYPE_ALIASES) >= 0) score += 3;
    if (inferHeaderIndex(headers, IMPORT_CODE_ALIASES) >= 0) score += 2;
    if (inferHeaderIndex(headers, IMPORT_OPENING_ALIASES) >= 0) score += 2;
    if (inferHeaderIndex(headers, IMPORT_DEBIT_ALIASES) >= 0) score += 1;
    if (inferHeaderIndex(headers, IMPORT_CREDIT_ALIASES) >= 0) score += 1;
    if (inferHeaderIndex(headers, IMPORT_LEVEL_ALIASES) >= 0) score += 1;
    if (score > best.score) best = { headerRowIndex: i, headers, score };
  }
  if (best.score < 2) return { headerRowIndex: -1, headers: [] };
  return {
    headerRowIndex: best.headerRowIndex, headers: best.headers,
    titleIndex: inferHeaderIndex(best.headers, IMPORT_TITLE_ALIASES),
    typeIndex: inferHeaderIndex(best.headers, IMPORT_TYPE_ALIASES),
    codeIndex: inferHeaderIndex(best.headers, IMPORT_CODE_ALIASES),
    openingIndex: inferHeaderIndex(best.headers, IMPORT_OPENING_ALIASES),
    levelIndex: inferHeaderIndex(best.headers, IMPORT_LEVEL_ALIASES),
    debitIndex: inferHeaderIndex(best.headers, IMPORT_DEBIT_ALIASES),
    creditIndex: inferHeaderIndex(best.headers, IMPORT_CREDIT_ALIASES),
  };
}

function recodeImportedReviewAccounts(
  reviewAccounts: CoaAccount[],
  format: 'numeric' | 'alphanumeric',
  occupiedAccounts: CoaAccount[] = []
): CoaAccount[] {
  const typeOrder = ['Asset', 'Liabilities', 'Equity', 'Capital', 'Revenue', 'Costs', 'Expense'];
  const rank = (type: string) => {
    const index = typeOrder.indexOf(type);
    return index >= 0 ? index : typeOrder.length;
  };

  // Normalize review types to the supported account classes before assigning
  // codes. This keeps imported/reviewed accounts compatible with the existing
  // COA while still allowing Equity/Capital to remain distinct labels.
  const normalized = reviewAccounts.map(account => {
    const typeInfo = normalizeUploadedType(account.type);
    return {
      ...account,
      type: typeInfo.type,
      normalSide: getNormalSide(typeInfo.type),
    };
  });

  // The review editor works in accounting order: Assets, Liabilities,
  // Equity/Capital, Revenue, Costs, then Expenses. Within each section, the
  // user's review order is preserved. Changing a type moves the account into
  // that section; the code is then regenerated automatically.
  const grouped = new Map<string, CoaAccount[]>();
  normalized.forEach(account => {
    const list = grouped.get(account.type) || [];
    list.push(account);
    grouped.set(account.type, list);
  });
  const ordered: CoaAccount[] = typeOrder
    .flatMap(type => grouped.get(type) || [])
    .concat(
      Array.from(grouped.entries())
        .filter(([type]) => !typeOrder.includes(type))
        .flatMap(([, list]) => list)
    );

  const usedIds = new Set<string>(occupiedAccounts.map(a => String(a.id).toUpperCase()));
  const nextByBase = new Map<number, number>();

  const takeNumericCode = (type: string): string => {
    const base = TYPE_BASE_CODE[type] ?? 900000;
    let next = nextByBase.get(base) ?? base;
    while (next <= base + 9900 && usedIds.has(String(next).padStart(6, '0'))) next += 100;
    const code = String(Math.min(next, 999999)).padStart(6, '0');
    nextByBase.set(base, next + 100);
    usedIds.add(code);
    return code;
  };

  const nextAlphaByPrefix = new Map<string, number>();
  const takeAlphaCode = (type: string): string => {
    const prefix = TYPE_ALPHA_PREFIX[type] || 'GN';
    let next = nextAlphaByPrefix.get(prefix) ?? 1;
    let code = `${prefix}${String(next).padStart(4, '0')}`;
    while (usedIds.has(code)) {
      next += 1;
      code = `${prefix}${String(next).padStart(4, '0')}`;
    }
    nextAlphaByPrefix.set(prefix, next + 1);
    usedIds.add(code);
    return code;
  };

  // Generate a source-id -> new-id map first so parentId references can be
  // updated in the same pass. Imported accounts do not have journal references
  // yet, so changing these temporary review codes is safe.
  const idMap = new Map<string, string>();
  const resultWithIds = ordered.map(account => {
    const newId = format === 'numeric'
      ? takeNumericCode(account.type)
      : takeAlphaCode(account.type);
    idMap.set(String(account.id), newId);
    return { ...account, id: newId };
  });

  return resultWithIds.map(account => ({
    ...account,
    parentId: account.parentId ? (idMap.get(String(account.parentId)) || account.parentId) : undefined,
  }));
}

function normalizeImportedAccountCode(raw: any, type: string, usedIds: Set<string>, format: 'numeric' | 'alphanumeric'): { id: string; generated: boolean } {
  const source = String(raw ?? '').trim();
  const compact = source.replace(/[\s_-]/g, '');
  const isNumeric = /^\d+$/.test(compact);
  if (source) {
    if (format === 'numeric' && isNumeric && compact.length === 6) {
      const candidate = compact;
      if (!usedIds.has(candidate)) return { id: candidate, generated: false };
    }
    if (/^[A-Za-z0-9]{6}$/.test(compact)) {
      const candidate = compact.toUpperCase();
      if (!usedIds.has(candidate)) return { id: candidate, generated: false };
    }
  }
  const base = TYPE_BASE_CODE[type] ?? 900000;
  if (format === 'numeric') {
    for (let i = 0; i < 1000; i++) {
      const candidate = String(base + i * 100).slice(-6).padStart(6, '0');
      if (!usedIds.has(candidate)) return { id: candidate, generated: true };
    }
  } else {
    const prefix = TYPE_ALPHA_PREFIX[type] || 'GN';
    for (let i = 1; i <= 9999; i++) {
      const candidate = `${prefix}${String(i).padStart(4, '0')}`;
      if (!usedIds.has(candidate)) return { id: candidate, generated: true };
    }
  }
  return { id: `GN${String(Date.now()).slice(-4)}`, generated: true };
}

type SmartCoaImportResult = {
  accounts: CoaAccount[];
  skipped: number;
  warnings: string[];
  detectedMode: 'headers' | 'headerless';
  detectedColumns: string[];
  generatedCodes: number;
  inferredTypes: number;
  detectedOpeningBalances: number;
};

function smartImportAccounts(
  rawRows: any[][],
  coaColumns: Array<{ id: string; name: string; isSystem: boolean }>,
  format: 'numeric' | 'alphanumeric',
  baseAccounts: CoaAccount[]
): SmartCoaImportResult {
  const headerInfo = detectHeaderRow(rawRows);
  const headered = headerInfo.headerRowIndex >= 0;
  const headers = headered ? headerInfo.headers : [];
  const rows = headered ? rawRows.slice(headerInfo.headerRowIndex + 1) : rawRows;
  const usedIds = new Set<string>(baseAccounts.map(a => String(a.id)));
  const newAccounts: CoaAccount[] = [];
  const warnings: string[] = [];
  let skipped = 0, generatedCodes = 0, inferredTypes = 0, detectedOpeningBalances = 0;
  let currentMainId: string | undefined;

  const customColumnIndexes = new Map<string, number>();
  if (headered) {
    coaColumns.filter(col => !['id', 'name', 'type'].includes(col.id)).forEach(col => {
      const aliases = new Set([normalizeHeaderToken(col.name), normalizeHeaderToken(col.id)]);
      if (col.id === 'normalSide') { aliases.add('normalentry'); aliases.add('normalside'); aliases.add('entry'); }
      const idx = headers.findIndex(h => aliases.has(normalizeHeaderToken(h)));
      if (idx >= 0) customColumnIndexes.set(col.id, idx);
    });
  }

  const extractCell = (row: any[], index?: number) => index === undefined || index < 0 ? '' : String(row[index] ?? '').trim();

  rows.forEach((row, rowOffset) => {
    const cells = Array.isArray(row) ? row : Object.values(row || {});
    if (!cells.some(cell => String(cell ?? '').trim() !== '')) return;

    let title = '', rawType = '', rawCode = '', openingRaw: any = undefined, levelRaw = '';
    let titleIndex = -1;

    if (headered) {
      titleIndex = headerInfo.titleIndex ?? -1;
      title = extractCell(cells, titleIndex);
      rawType = extractCell(cells, headerInfo.typeIndex);
      rawCode = extractCell(cells, headerInfo.codeIndex);
      levelRaw = extractCell(cells, headerInfo.levelIndex);
      if (headerInfo.openingIndex !== undefined && headerInfo.openingIndex >= 0) openingRaw = cells[headerInfo.openingIndex];
      if ((openingRaw === undefined || openingRaw === '') && headerInfo.debitIndex !== undefined && headerInfo.debitIndex >= 0) {
        const debit = parseOpeningBalanceValue(cells[headerInfo.debitIndex]) || 0;
        const credit = headerInfo.creditIndex !== undefined && headerInfo.creditIndex >= 0
          ? (parseOpeningBalanceValue(cells[headerInfo.creditIndex]) || 0)
          : 0;
        if (debit !== 0 || credit !== 0 || String(cells[headerInfo.debitIndex] ?? '').trim() === '0' || (headerInfo.creditIndex !== undefined && String(cells[headerInfo.creditIndex] ?? '').trim() === '0')) {
          openingRaw = String(debit - credit);
        }
      }
      if (titleIndex < 0) {
        let bestScore = -Infinity;
        cells.forEach((cell, idx) => {
          const score = scoreAccountTitle(cell);
          if (score > bestScore) { bestScore = score; titleIndex = idx; title = String(cell ?? '').trim(); }
        });
      }
    } else {
      let bestScore = -Infinity;
      cells.forEach((cell, idx) => {
        const score = scoreAccountTitle(cell);
        if (score > bestScore) { bestScore = score; titleIndex = idx; }
      });
      if (titleIndex >= 0) title = String(cells[titleIndex] ?? '').trim();
    }

    const decoratedRaw = String(title ?? '').replace(/\u00a0/g, ' ');
    const decoratedIndented = /^\s{2,}/.test(decoratedRaw) || /^\s*(?:↳|->|=>|›|»|└|├|─|•|·)/.test(decoratedRaw);
    title = decoratedRaw.trim().replace(/^(?:↳|->|=>|›|»|└|├|─|•|·)+\s*/, '').replace(/^\d+(?:\.\d+)*\s*[-.)]\s*/, '').trim();
    if (!title || isSummaryAccountTitle(title)) { skipped++; return; }

    if (!rawType) {
      for (let i = 0; i < cells.length; i++) {
        if (i === titleIndex) continue;
        const normalized = normalizeHeaderToken(cells[i]);
        const match = ACCOUNT_TYPE_LABELS.find(item => item.label === normalized);
        if (match) { rawType = String(cells[i]); break; }
      }
    }
    const typeInfo = rawType ? normalizeUploadedType(rawType) : { type: inferAccountTypeFromTitle(title), inferred: true };
    if (typeInfo.inferred) inferredTypes++;

    if (!rawCode) {
      for (let i = 0; i < cells.length; i++) {
        if (i === titleIndex) continue;
        const value = String(cells[i] ?? '').trim();
        if (value && looksLikeAccountCode(value) && parseOpeningBalanceValue(value) === undefined) { rawCode = value; break; }
      }
    }

    if (openingRaw === undefined || openingRaw === '') {
      const numericCandidates: Array<{ idx: number; value: number }> = [];
      cells.forEach((cell, idx) => {
        if (idx === titleIndex) return;
        const value = String(cell ?? '').trim();
        if (!value || (rawCode && value === rawCode) || looksLikeDate(value)) return;
        const parsed = parseOpeningBalanceValue(value);
        if (parsed !== undefined) numericCandidates.push({ idx, value: parsed });
      });
      if (numericCandidates.length > 0) {
        const selected = numericCandidates[numericCandidates.length - 1];
        openingRaw = cells[selected.idx];
      }
    }

    const openingBalance = parseOpeningBalanceValue(openingRaw);
    if (openingBalance !== undefined) detectedOpeningBalances++;
    const codeResult = normalizeImportedAccountCode(rawCode, typeInfo.type, usedIds, format);
    const id = codeResult.id;
    if (codeResult.generated) generatedCodes++;
    usedIds.add(id);

    const matchedValues: Record<string, any> = {};
    customColumnIndexes.forEach((idx, colId) => {
      const rawValue = String(cells[idx] ?? '').trim();
      if (!rawValue) return;
      if (colId === 'normalSide') {
        const normal = rawValue.toLowerCase();
        if (normal === 'debit' || normal === 'credit') matchedValues.normalSide = normal;
      } else matchedValues[colId] = rawValue;
    });

    const account: CoaAccount = {
      id, name: title, type: typeInfo.type, normalSide: getNormalSide(typeInfo.type),
      // Income / Costs / Expense accounts take a Previous Year Balance; it is never an opening balance.
      ...(openingBalance !== undefined
        ? (isNominalAccountType(typeInfo.type) ? { previousYearBalance: openingBalance } : { openingBalance })
        : {}),
      ...matchedValues,
    };

    const level = normalizeHeaderToken(levelRaw);
    const explicitSub = /subaccount|child|detail/.test(level);
    if ((decoratedIndented || explicitSub) && currentMainId) account.parentId = currentMainId;
    else currentMainId = id;

    newAccounts.push(account);
    if (typeInfo.inferred || codeResult.generated || openingBalance !== undefined) {
      warnings.push(`Row ${headered ? headerInfo.headerRowIndex + rowOffset + 2 : rowOffset + 1}: ${[
        typeInfo.inferred ? `type inferred as ${typeInfo.type}` : '',
        codeResult.generated ? 'code generated' : '',
        openingBalance !== undefined ? `${isNominalAccountType(typeInfo.type) ? 'previous year balance' : 'opening balance'} ${openingBalance.toLocaleString('en-PH')}` : '',
      ].filter(Boolean).join(', ')}`);
    }
  });

  const detectedColumns: string[] = [];
  if (headered) {
    if (headerInfo.titleIndex !== undefined && headerInfo.titleIndex >= 0) detectedColumns.push(`Account Title: ${headers[headerInfo.titleIndex]}`);
    if (headerInfo.typeIndex !== undefined && headerInfo.typeIndex >= 0) detectedColumns.push(`Account Type: ${headers[headerInfo.typeIndex]}`);
    if (headerInfo.codeIndex !== undefined && headerInfo.codeIndex >= 0) detectedColumns.push(`Account Code: ${headers[headerInfo.codeIndex]}`);
    if (headerInfo.openingIndex !== undefined && headerInfo.openingIndex >= 0) detectedColumns.push(`Opening Balance: ${headers[headerInfo.openingIndex]}`);
    if (headerInfo.openingIndex === undefined && headerInfo.debitIndex !== undefined && headerInfo.debitIndex >= 0) detectedColumns.push(`Opening Debit: ${headers[headerInfo.debitIndex]}`);
    if (headerInfo.openingIndex === undefined && headerInfo.creditIndex !== undefined && headerInfo.creditIndex >= 0) detectedColumns.push(`Opening Credit: ${headers[headerInfo.creditIndex]}`);
  } else detectedColumns.push('No headings required — fields inferred from row contents');

  return {
    accounts: newAccounts, skipped, warnings: warnings.slice(0, 25),
    detectedMode: headered ? 'headers' : 'headerless', detectedColumns,
    generatedCodes, inferredTypes, detectedOpeningBalances,
  };
}

// Shifts an entire account-code sequence forward by one position when a new
// account is inserted at an already-used code. For example, inserting at 2001
// changes 2001 -> 2002, 2002 -> 2003, 2003 -> 2004, and so on. Parent references
// are updated using the same old-code -> new-code mapping so the hierarchy stays intact.
// Legacy helper retained for edit-account collision handling. New-account insertion
// uses shiftAccountsForInsertion above so the entire following sequence moves together.
export function nextAvailableCode(code: string, usedIds: string[]): string {
  const used = new Set(usedIds);
  const match = code.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const digits = match[2];
    const width = digits.length;
    let num = parseInt(digits, 10);
    let candidate: string;
    do {
      num += 1;
      candidate = `${prefix}${String(num).padStart(width, '0')}`;
    } while (used.has(candidate));
    return candidate;
  }
  let n = 1;
  let candidate = `${code}-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${code}-${n}`;
  }
  return candidate;
}

export function shiftAccountsForInsertion(
  accountsList: CoaAccount[],
  insertCode: string,
  accountType?: string
): { accounts: CoaAccount[]; shiftedCount: number; mapping: Map<string, string> } {
  const match = String(insertCode).match(/^(.*?)(\d+)$/);
  if (!match) return { accounts: accountsList, shiftedCount: 0, mapping: new Map() };

  const prefix = match[1];
  const insertNumber = parseInt(match[2], 10);
  const codePattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);

  // IMPORTANT: insertion/resequencing is limited to the Account Type where the
  // new account belongs. Inserting a Liability account must never renumber
  // Assets, Equity, Revenue, Costs, or Expenses.
  const targetType = (accountType || '').trim().toLowerCase();
  const mapping = new Map<string, string>();
  let shiftedCount = 0;

  for (const account of accountsList) {
    if (targetType && String(account.type || '').trim().toLowerCase() !== targetType) continue;

    const accountCode = String(account.id);
    const accountMatch = accountCode.match(codePattern);
    if (!accountMatch) continue;

    const number = parseInt(accountMatch[1], 10);
    if (number < insertNumber) continue;

    const width = accountMatch[1].length;
    const newNumber = number + 1;
    const newCode = `${prefix}${String(newNumber).padStart(width, '0')}`;
    mapping.set(accountCode, newCode);
    shiftedCount += 1;
  }

  if (mapping.size === 0) return { accounts: accountsList, shiftedCount: 0, mapping };

  const shiftedAccounts = accountsList.map(account => ({
    ...account,
    id: mapping.get(account.id) || account.id,
    parentId: account.parentId ? (mapping.get(account.parentId) || account.parentId) : account.parentId,
  }));

  return { accounts: shiftedAccounts, shiftedCount, mapping };
}

export function resequenceAccounts(
  accountsList: CoaAccount[],
  coaFormat: 'numeric' | 'alphanumeric'
): CoaAccount[] {
  const baseSorted = [...accountsList].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  
  const arranged: CoaAccount[] = [];
  const visited = new Set<string>();
  
  const addAccountAndChildren = (account: CoaAccount) => {
    if (visited.has(account.id)) return;
    visited.add(account.id);
    arranged.push(account);
    
    // Find direct children
    const children = baseSorted.filter(a => a.parentId === account.id);
    children.forEach(addAccountAndChildren);
  };
  
  const parentIdsList = baseSorted.map(p => p.id);
  const mainAccounts = baseSorted.filter(a => !a.parentId || !parentIdsList.includes(a.parentId));
  mainAccounts.forEach(addAccountAndChildren);
  
  baseSorted.forEach(a => {
    if (!visited.has(a.id)) {
      arranged.push(a);
    }
  });
  
  return arranged;
}

// Closes gaps ("leaps") in numeric account codes after a deletion. Within each
// (account type, code-prefix) group — e.g. all pure-numeric Asset codes, or all
// "COH-..." codes — accounts are sorted by their numeric suffix and renumbered
// to anchor + i*step, where step is the smallest gap present in that group
// (preserves the user's chosen spacing: 1, 10, 100, ...). Accounts that are
// already contiguous are left untouched. Returns the remapped list plus an
// old->new code map (empty when there was nothing to close). Every rename here
// must also be cascaded to journal_voucher_lines.account_id by the caller.
export function closeCodeGaps(
  accountsList: CoaAccount[]
): { accounts: CoaAccount[]; renames: Map<string, string> } {
  const renames = new Map<string, string>();

  // Group by (account type, non-numeric code prefix) so we never renumber
  // across types or across different alphanumeric prefixes.
  const groups = new Map<string, Array<{ account: CoaAccount; prefix: string; num: number; width: number }>>();
  for (const account of accountsList) {
    const match = String(account.id).match(/^(.*?)(\d+)$/);
    if (!match) continue; // purely non-numeric codes can't be gap-closed
    const key = `${String(account.type || '').trim().toLowerCase()}||${match[1]}`;
    const entry = { account, prefix: match[1], num: parseInt(match[2], 10), width: match[2].length };
    const g = groups.get(key) || [];
    g.push(entry);
    groups.set(key, g);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((x, y) => x.num - y.num);

    // Natural spacing = smallest gap between any two consecutive codes.
    let step = Infinity;
    for (let i = 1; i < group.length; i++) {
      step = Math.min(step, group[i].num - group[i - 1].num);
    }
    if (!Number.isFinite(step) || step < 1) step = 1;

    const anchor = group[0].num;
    const prefix = group[0].prefix;
    const width = group[0].width;

    for (let i = 1; i < group.length; i++) {
      const expected = anchor + i * step;
      if (group[i].num !== expected) {
        const newCode = `${prefix}${String(expected).padStart(width, '0')}`;
        renames.set(group[i].account.id, newCode);
      }
    }
  }

  if (renames.size === 0) return { accounts: accountsList, renames };

  const remapped = accountsList.map(account => ({
    ...account,
    id: renames.get(account.id) || account.id,
    parentId: account.parentId ? (renames.get(account.parentId) || account.parentId) : account.parentId,
  }));
  return { accounts: remapped, renames };
}

export function ChartOfAccounts() {
  const canDelete = usePermission('delete_transactions');
  const { canAction: canCoaAction, canDropdownOption: canCoaDropdown } = useGranularPermissions('coa');
  const coaTypeOptions = [
    { value: 'Asset', permission: 'asset' },
    { value: 'Liability', permission: 'liability' },
    { value: 'Equity', permission: 'equity' },
    { value: 'Revenue', permission: 'income' },
    { value: 'Cost of Sales', permission: 'expense' },
    { value: 'Expense', permission: 'expense' },
  ].filter((option) => canCoaDropdown('account_type', option.permission));

  const { currentClient, currentClientId, saveCoaAccounts, saveCoaColumns, showToast } = useAccounting();
  const [isAdding, setIsAdding] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [hierarchyMode, setHierarchyMode] = useState(false);
  
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Asset');
  const [newNormalSide, setNewNormalSide] = useState<'debit' | 'credit'>('debit');
  const [newParentId, setNewParentId] = useState('');

  // Custom Columns / Category States
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [newCustomValues, setNewCustomValues] = useState<Record<string, string>>({});
  const [editCustomValues, setEditCustomValues] = useState<Record<string, string>>({});

  const [showPresets, setShowPresets] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  const presetsMenuRef = useRef<HTMLDivElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Holds a smart-import source file while the user reviews the detected accounts.
  const [showUploadChoice, setShowUploadChoice] = useState(false);
  const [pendingUploadRows, setPendingUploadRows] = useState<any[][] | null>(null);
  const [pendingUploadFileName, setPendingUploadFileName] = useState('');
  const [pendingUploadAnalysis, setPendingUploadAnalysis] = useState<SmartCoaImportResult | null>(null);
  const [pendingReviewAccounts, setPendingReviewAccounts] = useState<CoaAccount[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('Asset');
  const [editNormalSide, setEditNormalSide] = useState<'debit' | 'credit'>('debit');
  const [editParentId, setEditParentId] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editModalTab, setEditModalTab] = useState<'details' | 'openingBalance'>('details');
  // Which row's actions dropdown (Edit/Delete/Move) is currently open.
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Close the actions dropdown when clicking anywhere outside of it.
  useEffect(() => {
    if (!openActionMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionMenuId]);


  const coaColumns = useMemo(() => {
    const defaultColumns = [
      { id: 'id', name: 'Code', isSystem: true },
      { id: 'name', name: 'Account Title', isSystem: true },
      { id: 'type', name: 'Account Type', isSystem: true },
      { id: 'normalSide', name: 'Normal Entry', isSystem: true }
    ];
    // Guard against an empty array here, not just `undefined`/`null` — an
    // empty array is truthy in JS, so `|| defaultColumns` alone would leave
    // the table with zero columns (blank headers, blank cells) if every
    // column has been deleted via "Configure Columns".
    return (currentClient?.coaColumns && currentClient.coaColumns.length > 0)
      ? currentClient.coaColumns
      : defaultColumns;
  }, [currentClient?.coaColumns]);

  const handleAddColumn = () => {
    if (!canCoaAction('manage')) { showToast('Your profile does not have permission to manage Chart of Accounts columns.'); return; }
    if (!newColumnName.trim()) {
      alert("Please provide a name for the new column.");
      return;
    }
    const slug = 'col_' + Date.now();
    const updated = [
      ...coaColumns,
      { id: slug, name: newColumnName.trim(), isSystem: false }
    ];
    saveCoaColumns(updated);
    setNewColumnName('');
    showToast(`Added column "${newColumnName.trim()}"`);
  };

  const handleDeleteColumn = (id: string) => {
    if (!canCoaAction('manage')) { showToast('Your profile does not have permission to manage Chart of Accounts columns.'); return; }
    const colToDelete = coaColumns.find(c => c.id === id);
    if (!colToDelete) return;

    if (coaColumns.length <= 1) {
      alert("You can't delete the last remaining column. Add another column first.");
      return;
    }

    if (confirm(`Are you sure you want to delete the column "${colToDelete.name}"? This column will be hidden and removed from all accounts.`)) {
      const updated = coaColumns.filter(c => c.id !== id);
      saveCoaColumns(updated);
      showToast(`Deleted column "${colToDelete.name}"`);
    }
  };

  const handleSaveColumnRename = (id: string) => {
    if (!canCoaAction('manage')) { showToast('Your profile does not have permission to manage Chart of Accounts columns.'); return; }
    if (!editingColumnName.trim()) {
      alert("Name cannot be empty.");
      return;
    }
    const updated = coaColumns.map(c => 
      c.id === id ? { ...c, name: editingColumnName.trim() } : c
    );
    saveCoaColumns(updated);
    setEditingColumnId(null);
    setEditingColumnName('');
    showToast("Column renamed successfully");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (presetsRef.current && !presetsRef.current.contains(target) && !presetsMenuRef.current?.contains(target)) {
        setShowPresets(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [presetsRef]);

  // Adjust normal side automatically when type changes in adding form
  useEffect(() => {
    setNewNormalSide(getNormalSide(newType));
    setNewParentId('');
  }, [newType]);

  // Adjust normal side automatically when type changes in editing form
  useEffect(() => {
    setEditNormalSide(getNormalSide(editType));
  }, [editType]);

  // NOTE: accounts/derived useMemo hooks below must run on every render (never
  // after an early `return`) or React throws "Rendered more/fewer hooks than
  // during the previous render" the moment currentClient toggles between
  // null/defined.
  const ownershipType = ownershipAccountType(currentClient?.taxpayerClassification);
  const allowedAccountTypes = useMemo(
    () => ACCOUNT_TYPES.filter(type => type !== (ownershipType === 'Capital' ? 'Equity' : 'Capital')),
    [ownershipType]
  );

  let accounts = currentClient?.accounts || [];
  if (accounts.length === 0) {
    accounts = defaultAccountsFor(
      currentClient?.taxpayerClassification,
      currentClient?.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric',
      currentClient?.industry
    );
  } else {
    // Database row order is not guaranteed after insert/refresh. Keep the
    // account table in stable chronological order without mutating stored data.
    accounts = sortAccountsChronologically(accounts);
  }

  // When taxpayer classification changes in Business Profile / Client Profile,
  // automatically convert existing Equity <-> Capital account types so the COA
  // follows the profile instead of relying on the user to repair it manually.
  const classificationMigrationRef = useRef('');
  useEffect(() => {
    if (!currentClientId || !currentClient?.accounts?.length) return;

    const rawAccounts = currentClient.accounts;
    const mismatched = rawAccounts.some(account =>
      (account.type === 'Equity' || account.type === 'Capital') && account.type !== ownershipType
    );
    if (!mismatched) {
      classificationMigrationRef.current = '';
      return;
    }

    const migrationKey = `${currentClientId}:${ownershipType}:${rawAccounts.map(a => `${a.id}:${a.type}`).join('|')}`;
    if (classificationMigrationRef.current === migrationKey) return;
    classificationMigrationRef.current = migrationKey;

    const converted = rawAccounts.map(account =>
      account.type === 'Equity' || account.type === 'Capital'
        ? { ...account, type: ownershipType }
        : account
    );

    void saveCoaAccounts(converted).catch(error => {
      classificationMigrationRef.current = '';
      console.error('Failed to synchronize Chart of Accounts with taxpayer classification:', error);
    });
  }, [currentClientId, currentClient?.accounts, ownershipType]);

  useEffect(() => {
    setNewType(prev => allowedAccountTypes.includes(prev) ? prev : ownershipType);
  }, [allowedAccountTypes, ownershipType]);

  useEffect(() => {
    setEditType(prev => allowedAccountTypes.includes(prev) ? prev : ownershipType);
  }, [allowedAccountTypes, ownershipType]);

  const parentCandidates = useMemo(() => {
    return accounts.filter(a => a.type === newType);
  }, [accounts, newType]);

  const editParentCandidates = useMemo(() => {
    if (!editingId) return [];
    
    // Find all descendants of current edited account to prevent circular links
    const getDescendants = (id: string): string[] => {
      const children = accounts.filter(a => a.parentId === id);
      return [...children.map(c => c.id), ...children.flatMap(c => getDescendants(c.id))];
    };
    
    const excludedIds = [editingId, ...getDescendants(editingId)];
    
    return accounts.filter(a => 
      a.type === editType && 
      !excludedIds.includes(a.id)
    );
  }, [accounts, editType, editingId]);

  // Account Type filter options — derived from the actual Account Type values
  // present in the Chart of Accounts data, so the filter always reflects what's
  // really in the table (including any custom/free-text types from an upload)
  // rather than a fixed, hardcoded list.
  const availableFilterTypes = useMemo(() => {
    const types: string[] = accounts.map(a => a.type).filter((t): t is string => !!t && t.trim() !== '');
    return Array.from(new Set<string>(types)).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  if (!currentClient || !currentClientId) return null;

  const filteredAccounts = typeFilter === 'All'
    ? accounts
    : accounts.filter(a => a.type.toLowerCase() === typeFilter.toLowerCase());

  const displayRows = hierarchyMode ? flattenCoaHierarchy(accounts) : filteredAccounts;
  const typeBadgeClass = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.startsWith('asset')) return 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20';
    if (t.startsWith('liab')) return 'bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20';
    if (t.startsWith('equity') || t.startsWith('capital')) return 'bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20';
    if (t.startsWith('rev') || t.startsWith('income')) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20';
    if (t.startsWith('cost')) return 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20';
    if (t.startsWith('exp')) return 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20';
    return 'bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-400/20';
  };

  const handleSaveAccounts = async (updatedAccounts: CoaAccount[], coaFormat?: 'numeric' | 'alphanumeric'): Promise<boolean> => {
    const format = coaFormat || currentClient.coaFormat || 'numeric';
    const resequenced = resequenceAccounts(updatedAccounts, format);
    try {
      await saveCoaAccounts(resequenced, format);
      return true;
    } catch (err: any) {
      console.error('Failed to save Chart of Accounts', err);
      alert(`Couldn't save the Chart of Accounts: ${err?.message || 'Please check your connection and try again.'}`);
      return false;
    }
  };

  // An account's code (id) is stored as `account_id` on every journal-voucher
  // line, and General Ledger posting is keyed by it. Renaming/swapping a code
  // without updating those references orphans the postings (they are silently
  // dropped by syncGeneralLedger). These helpers cascade the rename into the
  // voucher lines so running balances survive a code change. (CRJ/CDJ/SJ/PJ
  // journals match accounts by *name*, so they need no cascade; GL is derived
  // and recomputed on every sync.)
  const renameVoucherLinesAccountId = async (oldId: string, newId: string) => {
    if (oldId === newId || !currentClientId) return;
    const { error } = await supabase
      .from('journal_voucher_lines')
      .update({ account_id: newId })
      .eq('client_id', currentClientId)
      .eq('account_id', oldId);
    if (error) console.warn('Failed to cascade account-code rename to voucher lines:', error);
  };

  const swapVoucherLinesAccountId = async (idA: string, idB: string) => {
    if (idA === idB || !currentClientId) return;
    const tmp = `__swap_${Date.now().toString(36)}`;
    // A -> tmp, then B -> A, then tmp -> B (avoids a unique-constraint clash).
    for (const [from, to] of [[idA, tmp], [idB, idA], [tmp, idB]] as const) {
      const { error } = await supabase
        .from('journal_voucher_lines')
        .update({ account_id: to })
        .eq('client_id', currentClientId)
        .eq('account_id', from);
      if (error) { console.warn('Swap cascade step failed:', from, '->', to, error); break; }
    }
  };

  // True if `ancestorId` is anywhere above `descendantId` in the parent chain.
  // Used to refuse a Move Up/Down swap between an account and its own ancestor —
  // swapping overlapping families corrupts the ID mapping.
  const isAncestorOf = (ancestorId: string, descendantId: string): boolean => {
    let cur = accounts.find(a => a.id === descendantId);
    let guard = 0;
    while (cur && cur.parentId && guard++ <= accounts.length) {
      if (cur.parentId === ancestorId) return true;
      cur = accounts.find(a => a.id === cur.parentId);
    }
    return false;
  };

  // When an account is deleted, auto-close the gap in its code sequence: if the
  // deleted account sat exactly between two evenly-spaced neighbors, shift every
  // later account in the same code group down by one step. Only adjusts when it
  // is unambiguous (even spacing, same account type + code prefix); uneven
  // sequences or first/last deletions are left untouched. Returns the shifted
  // account list and a map of oldCode -> newCode (each rename must be cascaded
  // to journal_voucher_lines so GL postings stay linked).
  const shiftDownAfterDeletion = (
    accountsList: CoaAccount[],
    deletedId: string
  ): { accounts: CoaAccount[]; renames: Map<string, string> } => {
    const deleted = accountsList.find(a => a.id === deletedId);
    if (!deleted) return { accounts: accountsList, renames: new Map() };
    const match = String(deleted.id).match(/^(.*?)(\d+)$/);
    if (!match) return { accounts: accountsList, renames: new Map() };
    const prefix = match[1];
    const width = match[2].length;
    const deletedNum = parseInt(match[2], 10);

    // Same group = same account type + same code prefix, so a deletion in Assets
    // never renumbers Liabilities, and alphanumeric codes (COH-1000) stay within
    // their own prefix family.
    const deletedType = String(deleted.type || '').toLowerCase();
    const group = accountsList
      .filter(a =>
        String(a.type || '').toLowerCase() === deletedType &&
        String(a.id).startsWith(prefix) &&
        /\d+$/.test(String(a.id))
      )
      .map(a => ({ a, num: parseInt(String(a.id).match(/(\d+)$/)![1], 10) }))
      .sort((x, y) => x.num - y.num);

    const idx = group.findIndex(g => g.a.id === deletedId);
    // Nothing to shift if the deleted account is first or last in its group
    // (no interior gap to close below it).
    if (idx <= 0 || idx >= group.length - 1) return { accounts: accountsList, renames: new Map() };
    const step = deletedNum - group[idx - 1].num;
    if (step <= 0) return { accounts: accountsList, renames: new Map() };
    // NOTE: we deliberately do NOT require group[idx+1].num - deletedNum === step.
    // Previously that uneven-spacing check aborted the shift whenever the
    // following codes used a different spacing (a "leap"), leaving the gap
    // wide open. Shifting every following code down by `step` (the spacing
    // before the deleted account) closes the gap and preserves any larger
    // intentional gaps further down the sequence.

    const renames = new Map<string, string>();
    for (let i = idx + 1; i < group.length; i++) {
      const oldCode = group[i].a.id;
      const newCode = `${prefix}${String(group[i].num - step).padStart(width, '0')}`;
      if (newCode !== oldCode) renames.set(oldCode, newCode);
    }
    if (renames.size === 0) return { accounts: accountsList, renames: new Map() };

    // Safety: never create a duplicate code. Numeric codes share one space
    // across account types, so shifting an Asset code down could collide with a
    // Liabilities code (e.g. 2200 -> 2100). If any new code is occupied by an
    // account that is NOT itself being renamed away, abort the renumber.
    const beingRenamedAway = new Set(renames.keys());
    for (const newCode of renames.values()) {
      const occupant = accountsList.find(a => String(a.id) === newCode);
      if (occupant && !beingRenamedAway.has(String(occupant.id))) {
        return { accounts: accountsList, renames: new Map() };
      }
    }

    const shifted = accountsList
      .filter(a => a.id !== deletedId)
      .map(a => {
        const newId = renames.get(a.id) || a.id;
        let parentId = a.parentId;
        if (parentId && renames.has(parentId)) parentId = renames.get(parentId);
        // Children of the deleted account become top-level.
        if (parentId === deletedId) parentId = undefined;
        return { ...a, id: newId, parentId };
      });
    return { accounts: shifted, renames };
  };

  const applyPreset = (format: 'numeric' | 'alphanumeric') => {
    if (!canCoaAction('manage')) { showToast('Your profile does not have permission to reset or reformat the Chart of Accounts.'); return; }
    if (accounts.length > 0) {
      if (!confirm(`Are you sure you want to replace all your accounts with the ${format} preset? This will delete all custom accounts.`)) {
        return;
      }
    }
    const newDefaults = defaultAccountsFor(currentClient?.taxpayerClassification, format, currentClient?.industry);
    handleSaveAccounts(newDefaults, format);
    setShowPresets(false);
  };

  const handleAddAccount = async () => {
    if (!canCoaAction('add')) { showToast('Your profile does not have permission to add accounts.'); return; }
    const selectedTypePermission = coaTypeOptions.find((option) => option.value === newType)?.permission;
    if (!selectedTypePermission || !canCoaDropdown('account_type', selectedTypePermission)) { showToast('This account type is not permitted for your profile.'); return; }
    if (!newCode || !newName || !newType) {
      alert("Please fill out Account Code and Name.");
      return;
    }
    // If the requested code already exists, insert the new account at that exact
    // position and move every following account in the same code sequence forward
    // by one. This applies to any account code, not just 2001, and preserves all
    // parent/sub-account relationships while the codes move.
    let workingAccounts = accounts;
    let resolvedParentId = newParentId || undefined;
    const conflicting = accounts.find(a => a.id === newCode);
    if (conflicting) {
      const preview = shiftAccountsForInsertion(accounts, newCode, newType);
      const proceed = confirm(
        `Account code "${newCode}" is already used by "${conflicting.name}".\n\n` +
        `Insert the new account at "${newCode}" and move ${preview.shiftedCount} existing account${preview.shiftedCount === 1 ? '' : 's'} forward by one code?`
      );
      if (!proceed) return;

      workingAccounts = preview.accounts;
      if (resolvedParentId) resolvedParentId = preview.mapping.get(resolvedParentId) || resolvedParentId;
    }

    // Add custom fields
    const customFields: Record<string, any> = {};
    Object.keys(newCustomValues).forEach(key => {
      customFields[key] = newCustomValues[key];
    });

    const updatedAccounts = [...workingAccounts, { 
      id: newCode, 
      name: newName, 
      type: newType, 
      normalSide: newNormalSide,
      parentId: resolvedParentId,
      ...customFields
    }];
    // Only close the dialog and clear the form once the account has actually
    // been persisted — previously this happened unconditionally, so a failed
    // save (network issue, auth not ready, RLS, etc.) looked like the account
    // was added when nothing had actually been saved.
    const saved = await handleSaveAccounts(updatedAccounts);
    if (!saved) return;
    setIsAdding(false);
    setNewCode('');
    setNewName('');
    setNewType('Asset');
    setNewNormalSide('debit');
    setNewParentId('');
    setNewCustomValues({});
  };

  const clearPendingUploadReview = () => {
    setShowUploadChoice(false);
    setPendingUploadRows(null);
    setPendingUploadFileName('');
    setPendingUploadAnalysis(null);
    setPendingReviewAccounts([]);
  };

  const updatePendingReviewType = (accountId: string, type: string) => {
    setPendingReviewAccounts(prev => {
      const edited = prev.map(account =>
        account.id === accountId
          ? moveBalanceForType({ ...account, type, normalSide: getNormalSide(type) })
          : account
      );

      // Re-group the edited account under its new type and automatically issue
      // new six-character codes for the entire imported set. Moving the changed
      // account to the end of the source list makes it land at the end of its
      // new accounting section while preserving the order of the other rows.
      const changed = edited.find(account => account.id === accountId);
      const regrouped = changed
        ? [...edited.filter(account => account.id !== accountId), changed]
        : edited;
      return recodeImportedReviewAccounts(regrouped, currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    });
  };

  const movePendingReviewAccount = (accountId: string, direction: -1 | 1) => {
    setPendingReviewAccounts(prev => {
      const index = prev.findIndex(account => account.id === accountId);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      if (prev[target].type !== prev[index].type) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return recodeImportedReviewAccounts(next, currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    });
  };

  // Smart upload accepts CSV/XLS/XLSX files with or without headings. It identifies
  // an account title from row contents, infers its type when no type is supplied,
  // generates a six-character code when no usable code exists, and captures an
  // opening balance when a numeric balance appears on the same row.
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canCoaAction('import')) { showToast('Your profile does not have permission to import a Chart of Accounts.'); e.target.value = ''; return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
      }) as any[][];

      if (!rawRows.length) {
        alert('The uploaded file appears to be empty.');
        return;
      }

      const format = currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric';
      const analysis = smartImportAccounts(rawRows, coaColumns, format, accounts);
      if (analysis.accounts.length === 0) {
        alert('No account titles could be detected. Upload a CSV/Excel file containing account names, one account per row. Headings are optional.');
        return;
      }

      setPendingUploadRows(rawRows);
      setPendingUploadFileName(file.name);
      setPendingUploadAnalysis(analysis);
      setPendingReviewAccounts(recodeImportedReviewAccounts(analysis.accounts, format));
      setShowUploadChoice(true);
    } catch (err: any) {
      console.error('Failed to read Chart of Accounts upload:', err);
      alert("Couldn't read that file. Please upload a CSV, XLS, or XLSX file.");
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  // Applies the reviewed smart import once the user chooses Override or Merge.
  // The review edits (account type and ordering) are the source of truth; codes
  // are regenerated one final time against the existing COA for Merge mode.
  const applyPendingUpload = async (overwrite: boolean) => {
    const reviewAccounts = pendingReviewAccounts.length
      ? pendingReviewAccounts
      : (pendingUploadAnalysis?.accounts || []);
    if (!reviewAccounts.length) return;

    const format = currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric';
    const baseAccounts = overwrite ? [] : accounts;
    const finalAccounts = recodeImportedReviewAccounts(reviewAccounts, format, baseAccounts);
    const analysis = pendingUploadAnalysis;

    clearPendingUploadReview();

    if (!finalAccounts.length) {
      showToast('No valid account titles were found in the uploaded file.');
      return;
    }

    const saved = await handleSaveAccounts([...baseAccounts, ...finalAccounts]);
    if (!saved) return;

    const notes = [
      analysis?.generatedCodes ? `${analysis.generatedCodes} detected/generated code${analysis.generatedCodes === 1 ? '' : 's'}` : '',
      analysis?.inferredTypes ? `${analysis.inferredTypes} type${analysis.inferredTypes === 1 ? '' : 's'} inferred` : '',
      analysis?.detectedOpeningBalances ? `${analysis.detectedOpeningBalances} opening balance${analysis.detectedOpeningBalances === 1 ? '' : 's'} detected` : '',
      analysis?.skipped ? `${analysis.skipped} row${analysis.skipped === 1 ? '' : 's'} skipped` : '',
    ].filter(Boolean).join(' • ');

    showToast(`${overwrite ? 'Chart of Accounts replaced with' : 'Uploaded'} ${finalAccounts.length} account${finalAccounts.length === 1 ? '' : 's'}${notes ? ` • ${notes}` : ''}.`);
  };

  const handleDelete = async (id: string) => {
    if (!canCoaAction('delete')) { showToast('Your profile does not have permission to delete accounts.'); return; }
    const hasChildren = accounts.some(a => a.parentId === id);
    // Auto-close the gap: if this account sat evenly between two neighbors, shift
    // every later code in its group down by one step (safe — collisions abort).
    const { accounts: shiftedAccounts, renames } = shiftDownAfterDeletion(accounts, id);

    let question = "Are you sure you want to delete this account?";
    if (hasChildren) {
      question = "Warning: This account has sub-accounts! Deleting this main account will make its sub-accounts top-level main accounts. Are you sure you want to proceed?";
    }
    if (renames.size > 0) {
      question += `\n\nDeleting it will also renumber ${renames.size} following account code(s) to close the gap — linked journal voucher lines will be updated automatically.`;
    }
    if (!confirm(question)) return;

    const saved = await handleSaveAccounts(shiftedAccounts);
    if (!saved) return;

    // Cascade every renumbered code into the journal voucher lines so GL
    // postings stay linked to the right account.
    for (const [from, to] of renames) {
      await renameVoucherLinesAccountId(from, to);
    }
    if (renames.size > 0) {
      showToast(`Deleted account and renumbered ${renames.size} code(s) to close the gap.`);
    }
  };

  const handleSaveEdit = async (oldId: string) => {
    if (!canCoaAction('edit')) { showToast('Your profile does not have permission to edit accounts.'); return; }
    const selectedTypePermission = coaTypeOptions.find((option) => option.value === editType)?.permission;
    if (!selectedTypePermission || !canCoaDropdown('account_type', selectedTypePermission)) { showToast('This account type is not permitted for your profile.'); return; }
    if (!editCode || !editName) {
      alert("Please fill out Account Code and Name.");
      return;
    }

    // As with adding a new account, a taken code doesn't have to block the save —
    // offer to bump the existing occupant to the next free code instead.
    let workingAccounts = accounts;
    let resolvedParentId = editParentId || undefined;
    // Every code that changes during this edit must be cascaded to
    // journal_voucher_lines.account_id or those postings get orphaned.
    const renames: Array<[string, string]> = [];
    if (editCode !== oldId) {
      const codeChangeOk = confirm(
        `Changing the account code from "${oldId}" to "${editCode}" will also update every journal voucher line that references "${oldId}".\n\nProceed?`
      );
      if (!codeChangeOk) return;
      renames.push([oldId, editCode]);

      const conflicting = accounts.find(a => a.id === editCode && a.id !== oldId);
      if (conflicting) {
        const shiftedCode = nextAvailableCode(editCode, accounts.map(a => a.id));
        const proceed = confirm(
          `Account code "${editCode}" is already used by "${conflicting.name}".\n\n` +
          `Move this account to "${editCode}" and shift "${conflicting.name}" to "${shiftedCode}"?`
        );
        if (!proceed) return;
        renames.push([conflicting.id, shiftedCode]);
        workingAccounts = accounts.map(a => {
          if (a.id === conflicting.id) return { ...a, id: shiftedCode };
          if (a.parentId === conflicting.id) return { ...a, parentId: shiftedCode };
          return a;
        });
        if (resolvedParentId === conflicting.id) resolvedParentId = shiftedCode;
      }
    }

    const parsedOpening = parseFloat(editOpeningBalance);
    const openingBalance = editOpeningBalance !== ''
      ? (Number.isFinite(parsedOpening) ? parsedOpening : 0)
      : undefined;

    const updatedAccounts = workingAccounts.map(a => {
      if (a.id === oldId) {
        // Collect custom fields
        const customFields: Record<string, any> = {};
        Object.keys(editCustomValues).forEach(key => {
          customFields[key] = editCustomValues[key];
        });

        return {
          ...a,
          id: editCode,
          name: editName,
          type: editType,
          normalSide: editNormalSide,
          parentId: resolvedParentId,
          // Income / Costs / Expense keep a Previous Year Balance only; never an opening balance.
          ...(isNominalAccountType(editType)
            ? { openingBalance: undefined, previousYearBalance: openingBalance ?? a.previousYearBalance ?? a.openingBalance }
            : { openingBalance: openingBalance ?? undefined, previousYearBalance: undefined }),
          ...customFields
        };
      } else if (a.parentId === oldId) {
        return {
          ...a,
          parentId: editCode
        };
      }
      return a;
    });

    const saved = await handleSaveAccounts(updatedAccounts);
    if (!saved) return;

    // Cascade every code rename into the journal voucher lines so GL postings
    // stay linked. Done after a successful save; failures are logged (non-fatal).
    for (const [from, to] of renames) {
      await renameVoucherLinesAccountId(from, to);
    }

    setEditingId(null);
    setEditParentId('');
    setEditCustomValues({});
    setEditOpeningBalance('');
    setEditModalTab('details');
  };

  // Swaps two accounts' codes (and their sub-account branches) so they trade positions in the CoA order.
  // Returns the swapped account names on success, or null if the swap couldn't be performed.
  const performAccountSwap = (idA: string, idB: string): { nameA: string; nameB: string } | null => {
    if (idA === idB) return null;

    // Swapping an account with its own ancestor makes the two families overlap
    // and corrupts the ID mapping (duplicate / lost codes). Refuse it.
    if (isAncestorOf(idA, idB) || isAncestorOf(idB, idA)) {
      showToast("Cannot move: one account is an ancestor of the other.");
      return null;
    }

    const accountA = accounts.find(a => a.id === idA);
    const accountB = accounts.find(a => a.id === idB);
    if (!accountA || !accountB) return null;

    // Helper to find common prefix and construct a swapped code
    const getSwappedCode = (oldId: string, oldParentId: string, newParentId: string): string => {
      let commonPrefixLen = 0;
      while (
        commonPrefixLen < oldId.length && 
        commonPrefixLen < oldParentId.length && 
        oldId[commonPrefixLen] === oldParentId[commonPrefixLen]
      ) {
        commonPrefixLen++;
      }
      
      if (commonPrefixLen > 0) {
        const newPrefix = newParentId.slice(0, commonPrefixLen);
        const suffix = oldId.slice(commonPrefixLen);
        return newPrefix + suffix;
      }
      
      return `${newParentId}-${oldId}`;
    };

    // Helper to ensure generated codes are unique
    const makeUniqueCode = (candidate: string, existingIds: Set<string>): string => {
      if (!existingIds.has(candidate)) return candidate;
      const numMatch = candidate.match(/^(.*?)(\d+)$/);
      if (numMatch) {
        const prefix = numMatch[1];
        let num = parseInt(numMatch[2], 10);
        let attempts = 0;
        while (attempts < 100) {
          num++;
          const test = `${prefix}${num}`;
          if (!existingIds.has(test)) return test;
          attempts++;
        }
      }
      let suffix = 1;
      while (existingIds.has(`${candidate}_${suffix}`)) {
        suffix++;
      }
      return `${candidate}_${suffix}`;
    };

    // Recursive helper to get all descendants in stable sorted order
    const getDescendantsRecursive = (id: string): CoaAccount[] => {
      const children = accounts.filter(a => a.parentId === id);
      const sortedChildren = [...children].sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
      const list: CoaAccount[] = [];
      sortedChildren.forEach(c => {
        list.push(c);
        list.push(...getDescendantsRecursive(c.id));
      });
      return list;
    };

    const descA = getDescendantsRecursive(idA);
    const descB = getDescendantsRecursive(idB);

    const familyA = [accountA, ...descA];
    const familyB = [accountB, ...descB];

    // IDs outside of both families
    const outerIds = new Set<string>(
      accounts
        .filter(a => !familyA.some(x => x.id === a.id) && !familyB.some(x => x.id === a.id))
        .map(a => a.id)
    );

    const newIdsMapA: Record<string, string> = {};
    const newIdsMapB: Record<string, string> = {};
    const occupiedInThisSwap = new Set<string>(outerIds);

    // Roots mapped
    newIdsMapA[idA] = idB;
    occupiedInThisSwap.add(idB);

    newIdsMapB[idB] = idA;
    occupiedInThisSwap.add(idA);

    // Map descendants of A
    descA.forEach((a, index) => {
      if (index < descB.length) {
        newIdsMapA[a.id] = descB[index].id;
      } else {
        const oldParentId = a.parentId || idA;
        const newParentId = newIdsMapA[oldParentId] || idB;
        let candidate = getSwappedCode(a.id, oldParentId, newParentId);
        candidate = makeUniqueCode(candidate, occupiedInThisSwap);
        newIdsMapA[a.id] = candidate;
      }
      occupiedInThisSwap.add(newIdsMapA[a.id]);
    });

    // Map descendants of B
    descB.forEach((b, index) => {
      if (index < descA.length) {
        newIdsMapB[b.id] = descA[index].id;
      } else {
        const oldParentId = b.parentId || idB;
        const newParentId = newIdsMapB[oldParentId] || idA;
        let candidate = getSwappedCode(b.id, oldParentId, newParentId);
        candidate = makeUniqueCode(candidate, occupiedInThisSwap);
        newIdsMapB[b.id] = candidate;
      }
      occupiedInThisSwap.add(newIdsMapB[b.id]);
    });

    // Build the updated accounts list
    const swappedAccounts: CoaAccount[] = [];

    // All outer accounts
    accounts.forEach(a => {
      if (!familyA.some(x => x.id === a.id) && !familyB.some(x => x.id === a.id)) {
        let pId = a.parentId;
        if (pId) {
          if (newIdsMapA[pId]) pId = newIdsMapA[pId];
          else if (newIdsMapB[pId]) pId = newIdsMapB[pId];
        }
        swappedAccounts.push({
          ...a,
          parentId: pId
        });
      }
    });

    // Add updated family A elements (placed in tree B's slot/IDs)
    familyA.forEach(a => {
      const newId = newIdsMapA[a.id];
      let pId = a.parentId;
      if (pId) {
        pId = newIdsMapA[pId] || pId;
      }
      
      swappedAccounts.push({
        ...a,
        id: newId,
        parentId: pId
      });
    });

    // Add updated family B elements (placed in tree A's slot/IDs)
    familyB.forEach(b => {
      const newId = newIdsMapB[b.id];
      let pId = b.parentId;
      if (pId) {
        pId = newIdsMapB[pId] || pId;
      }
      
      swappedAccounts.push({
        ...b,
        id: newId,
        parentId: pId
      });
    });

    handleSaveAccounts(swappedAccounts);
    return { nameA: accountA.name, nameB: accountB.name };
  };

  // Moves an account up one position by swapping codes with the account directly above it
  // in the currently displayed (filtered) list.
  const handleMoveUp = (id: string) => {
    const idx = filteredAccounts.findIndex(a => a.id === id);
    if (idx <= 0) return; // already at the top or not found
    const neighbor = filteredAccounts[idx - 1];
    const result = performAccountSwap(id, neighbor.id);
    if (result) {
      showToast(`Moved "${result.nameA}" up.`);
      // The swap trades two account codes; mirror it on the voucher lines.
      void swapVoucherLinesAccountId(id, neighbor.id);
    }
  };

  // Moves an account down one position by swapping codes with the account directly below it
  // in the currently displayed (filtered) list.
  const handleMoveDown = (id: string) => {
    const idx = filteredAccounts.findIndex(a => a.id === id);
    if (idx === -1 || idx >= filteredAccounts.length - 1) return; // already at the bottom or not found
    const neighbor = filteredAccounts[idx + 1];
    const result = performAccountSwap(id, neighbor.id);
    if (result) {
      showToast(`Moved "${result.nameA}" down.`);
      void swapVoucherLinesAccountId(id, neighbor.id);
    }
  };

  // Single source of truth: opening balance + all General Ledger activity.
  // The same balance calculation is consumed by the financial statements and Trial Balance.
  const getAccountBalance = (account: CoaAccount) => balanceFor(currentClient, account.id)?.balance || 0;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Chart of Accounts" icon={<BookOpen />} actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleUploadFile}
          />
          {canCoaAction('manage') && <div ref={presetsRef}>
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              aria-haspopup="menu"
              aria-label="Reset / Choose Format"
              title="Reset / Choose Format"
              aria-expanded={showPresets}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-surface text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" /> <span className="hidden md:inline">Reset / Choose Format</span>
            </button>
            {showPresets && presetsRef.current && createPortal(
              <div
                ref={presetsMenuRef}
                role="menu"
                style={{ position: 'fixed', top: presetsRef.current.getBoundingClientRect().bottom + 8, left: Math.max(8, presetsRef.current.getBoundingClientRect().right - 208) }}
                className="w-52 bg-surface border border-border rounded-xl shadow-pop overflow-hidden z-[60] py-1"
              >
                <button role="menuitem" onClick={() => applyPreset('numeric')} className="w-full text-left px-4 py-2.5 hover:bg-surface-subtle text-xs font-medium text-text-primary">
                  Numeric Code Format
                </button>
                <button role="menuitem" onClick={() => applyPreset('alphanumeric')} className="w-full text-left px-4 py-2.5 hover:bg-surface-subtle text-xs font-medium text-text-primary">
                  Alphanumeric Format
                </button>
              </div>,
              document.body
            )}
          </div>}
          {canCoaAction('manage') && <button
            type="button"
            onClick={() => setShowColumnManager(!showColumnManager)}
            aria-pressed={showColumnManager}
            aria-label="Configure Columns"
            title="Configure Columns"
            className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors',
              showColumnManager
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                : 'border-border bg-surface text-text-secondary hover:bg-surface-subtle')}
          >
            <Columns className="w-3.5 h-3.5" /> <span className="hidden md:inline">Configure Columns</span>
          </button>}
          {canCoaAction('import') && <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isUploading}
            aria-label="Upload Chart of Accounts"
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-subtle disabled:opacity-50 transition-colors"
            title="Upload a Chart of Accounts. Headings are optional; CAPOT can infer account titles, types, codes and balances (Opening Balance for balance sheet accounts, Previous Year Balance for Income, Costs and Expenses)."
          >
            <Upload className="w-3.5 h-3.5" /> <span className="hidden md:inline">{isUploading ? 'Reading…' : 'Upload Chart of Accounts'}</span>
          </button>}
          {canCoaAction('add') && <button
            id="add-account-btn"
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> <span className="whitespace-nowrap">Add Account</span>
          </button>}
        </div>
      } />
      <div className="p-4 md:p-6 flex-1">
      <div>
        {/* Dynamic Column/Category Manager Section */}
        {showColumnManager && (
          <div className="mb-6 p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Columns className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Configure Table Columns (Categories)
              </h3>
              <button 
                onClick={() => setShowColumnManager(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Add, edit, or remove custom account categories. Code, Account Title, and Account Type columns are system-locked and cannot be modified or deleted. Added categories will automatically show as fillable input fields when adding and editing accounts.
            </p>

            {/* List of current columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              {coaColumns.map((col) => {
                const isEditingThis = editingColumnId === col.id;
                return (
                  <div 
                    key={col.id} 
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input 
                          type="text" 
                          value={editingColumnName} 
                          onChange={e => setEditingColumnName(e.target.value)} 
                          className="form-input text-xs py-1 px-2 flex-1"
                        />
                        <button 
                          onClick={() => handleSaveColumnRename(col.id)}
                          className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            setEditingColumnId(null);
                            setEditingColumnName('');
                          }}
                          className="p-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {col.name}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                            {col.isSystem ? 'Locked Column' : 'Custom Category'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {(!col.isSystem && col.id !== 'id' && col.id !== 'name' && col.id !== 'type') ? (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingColumnId(col.id);
                                  setEditingColumnName(col.name);
                                }}
                                className="p-1 hover:bg-blue-50 dark:hover:bg-slate-800 text-blue-500 rounded transition-colors"
                                title="Rename column"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteColumn(col.id)}
                                disabled={!canDelete}
                                title={canDelete ? 'Delete column' : 'Delete Transactions permission not granted'}
                                className="p-1 hover:bg-red-50 dark:hover:bg-slate-800 text-red-500 rounded transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold px-2 py-0.5 rounded select-none uppercase tracking-wide">
                              Locked
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new Column Form */}
            <div className="flex items-end gap-3 max-w-sm pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">New Category Name</label>
                <input 
                  type="text" 
                  value={newColumnName} 
                  onChange={e => setNewColumnName(e.target.value)} 
                  placeholder="e.g. Department, Location, Tax Key" 
                  className="w-full form-input text-xs py-1.5 px-3"
                />
              </div>
              <button 
                onClick={handleAddColumn}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 uppercase tracking-wide shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Column
              </button>
            </div>
          </div>
        )}

        {showUploadChoice && pendingUploadAnalysis && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Review Uploaded Chart of Accounts</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{pendingUploadFileName || 'Uploaded file'}</p>
                </div>
                <button
                  onClick={clearPendingUploadReview}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
                  aria-label="Close upload review"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"><div className="text-[10px] uppercase font-bold text-slate-400">Accounts found</div><div className="text-lg font-bold text-slate-800 dark:text-slate-100">{pendingUploadAnalysis.accounts.length}</div></div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"><div className="text-[10px] uppercase font-bold text-slate-400">Types inferred</div><div className="text-lg font-bold text-amber-600">{pendingUploadAnalysis.inferredTypes}</div></div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"><div className="text-[10px] uppercase font-bold text-slate-400">Codes generated</div><div className="text-lg font-bold text-indigo-600">{pendingUploadAnalysis.generatedCodes}</div></div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"><div className="text-[10px] uppercase font-bold text-slate-400">Opening balances</div><div className="text-lg font-bold text-emerald-600">{pendingUploadAnalysis.detectedOpeningBalances}</div></div>
              </div>

              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-200">
                <div className="font-bold mb-1">Smart import</div>
                <div>{pendingUploadAnalysis.detectedColumns.join(' • ')}</div>
                <div className="mt-1">Account code, account type, and opening-balance headings are optional. Missing information is inferred and generated automatically.</div>
              </div>

              {pendingReviewAccounts.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-5">
                  <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Edit before applying</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Change an account type or move it within its section. Codes are regenerated automatically and stay 6 characters.</div>
                  </div>
                  <div className="grid grid-cols-[44px_105px_minmax(0,1fr)_150px_145px_86px] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase font-bold tracking-wide text-slate-500">
                    <div>#</div><div>Code</div><div>Account Title</div><div>Type</div><div className="text-right">Opening / Prev. Year Bal.</div><div className="text-center">Move</div>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingReviewAccounts.map((account, index) => {
                      const sameTypeIndexes = pendingReviewAccounts
                        .map((item, itemIndex) => item.type === account.type ? itemIndex : -1)
                        .filter(itemIndex => itemIndex >= 0);
                      const positionInType = sameTypeIndexes.indexOf(index);
                      const canMoveUp = positionInType > 0;
                      const canMoveDown = positionInType >= 0 && positionInType < sameTypeIndexes.length - 1;
                      return (
                        <div key={`${account.id}-${index}`} className="grid grid-cols-[44px_105px_minmax(0,1fr)_150px_145px_86px] gap-2 px-3 py-2 items-center text-xs">
                          <div className="text-[10px] text-slate-400 font-mono">{index + 1}</div>
                          <div className="font-mono font-bold text-indigo-700 dark:text-indigo-300" title="Automatically assigned">{account.id}</div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{account.name}</div>
                          <div>
                            <select
                              value={account.type}
                              onChange={e => updatePendingReviewType(account.id, e.target.value)}
                              className="w-full form-input text-xs py-1.5 px-2 bg-white dark:bg-slate-800"
                            >
                              {ACCOUNT_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>
                          <div className="text-right font-mono text-slate-700 dark:text-slate-200">
                            {(() => {
                              const v = isNominalAccountType(account.type) ? account.previousYearBalance : account.openingBalance;
                              return v !== undefined ? (
                                <>
                                  {v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                  {isNominalAccountType(account.type) && <div className="text-[9px] uppercase font-sans text-slate-400">Prev. year</div>}
                                </>
                              ) : '—';
                            })()}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePendingReviewAccount(account.id, -1)}
                              disabled={!canMoveUp}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={canMoveUp ? 'Move up within account type' : 'Already first in this section'}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => movePendingReviewAccount(account.id, 1)}
                              disabled={!canMoveDown}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={canMoveDown ? 'Move down within account type' : 'Already last in this section'}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {pendingUploadAnalysis.warnings.length > 0 && (
                <details className="mb-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <summary className="cursor-pointer text-xs font-bold text-amber-800 dark:text-amber-200">Show detection notes ({pendingUploadAnalysis.warnings.length})</summary>
                  <div className="mt-2 space-y-1 text-[11px] text-amber-700 dark:text-amber-300">{pendingUploadAnalysis.warnings.map((warning, idx) => <div key={idx}>• {warning}</div>)}</div>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button onClick={() => applyPendingUpload(true)} className="sm:flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
                  Override — Replace Current COA
                </button>
                <button onClick={() => applyPendingUpload(false)} className="sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
                  Merge — Keep Existing + Add
                </button>
                <button onClick={clearPendingUploadReview} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Add New Account
                </h3>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex flex-col gap-4 mb-6 max-h-[50vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Code</label>
                  <input 
                    type="text" 
                    value={newCode} 
                    onChange={e => setNewCode(e.target.value.replace(/[^0-9A-Za-z_-]/g, ''))} 
                    className="w-full form-input font-mono"
                    placeholder="e.g. 1000 or COH-1000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Name</label>
                  <input 
                    type="text" 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    className="w-full form-input"
                    placeholder="e.g. Cash in Bank"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Type</label>
                  <select 
                    value={newType} 
                    onChange={e => setNewType(e.target.value)} 
                    className="w-full form-input"
                  >
                    {allowedAccountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Parent Account (Optional)</label>
                  <select
                    value={newParentId}
                    onChange={e => setNewParentId(e.target.value)}
                    className="w-full form-input"
                  >
                    <option value="">None (Top-Level Account)</option>
                    {parentCandidates.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>

                {coaColumns.some(col => col.id === 'normalSide') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Normal Entry</label>
                    <select 
                      value={newNormalSide} 
                      onChange={e => setNewNormalSide(e.target.value as 'debit' | 'credit')} 
                      className="w-full form-input capitalize"
                    >
                      <option value="debit">debit</option>
                      <option value="credit">credit</option>
                    </select>
                  </div>
                )}

                {/* Dynamically Render Custom Columns / Categories */}
                {coaColumns.filter(col => !col.isSystem && col.id !== 'normalSide').map(col => (
                  <div key={col.id}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">{col.name}</label>
                    <input 
                      type="text" 
                      value={newCustomValues[col.id] || ''} 
                      onChange={e => setNewCustomValues({
                        ...newCustomValues,
                        [col.id]: e.target.value
                      })} 
                      placeholder={`Enter ${col.name}`}
                      className="w-full form-input text-xs"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddAccount}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                >
                  Save Account
                </button>
              </div>
            </div>
          </div>
        )}

        {editingId !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Edit Account Details
                </h3>
                <button 
                  onClick={() => setEditingId(null)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setEditModalTab('details')}
                  className={cn(
                    "px-3 py-2 text-xs font-bold uppercase tracking-wide border-b-2 -mb-px transition-colors",
                    editModalTab === 'details'
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  Details
                </button>
                <button
                  onClick={() => setEditModalTab('openingBalance')}
                  className={cn(
                    "px-3 py-2 text-xs font-bold uppercase tracking-wide border-b-2 -mb-px transition-colors",
                    editModalTab === 'openingBalance'
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  {isNominalAccountType(editType) ? 'Previous Year Balance' : 'Opening Balance'}
                </button>
              </div>
              
              {editModalTab === 'details' ? (
              <div className="flex flex-col gap-4 mb-6 max-h-[50vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Code</label>
                  <input 
                    type="text" 
                    value={editCode} 
                    onChange={e => setEditCode(e.target.value.replace(/[^0-9A-Za-z_-]/g, ''))} 
                    className="w-full form-input font-mono"
                    placeholder="e.g. 1000 or COH-1000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Name</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full form-input"
                    placeholder="e.g. Cash in Bank"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Account Type</label>
                  <select 
                    value={editType} 
                    onChange={e => setEditType(e.target.value)} 
                    className="w-full form-input"
                  >
                    {allowedAccountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Parent Account (Optional)</label>
                  <select
                    value={editParentId}
                    onChange={e => setEditParentId(e.target.value)}
                    className="w-full form-input"
                  >
                    <option value="">None (Top-Level Account)</option>
                    {editParentCandidates.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>

                {coaColumns.some(col => col.id === 'normalSide') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Normal Entry</label>
                    <select 
                      value={editNormalSide} 
                      onChange={e => setEditNormalSide(e.target.value as 'debit' | 'credit')} 
                      className="w-full form-input capitalize"
                    >
                      <option value="debit">debit</option>
                      <option value="credit">credit</option>
                    </select>
                  </div>
                )}

                {/* Dynamically Render Custom Columns / Categories */}
                {coaColumns.filter(col => !col.isSystem && col.id !== 'normalSide').map(col => (
                  <div key={col.id}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">{col.name}</label>
                    <input 
                      type="text" 
                      value={editCustomValues[col.id] || ''} 
                      onChange={e => setEditCustomValues({
                        ...editCustomValues,
                        [col.id]: e.target.value
                      })} 
                      placeholder={`Enter ${col.name}`}
                      className="w-full form-input text-xs"
                    />
                  </div>
                ))}
              </div>
              ) : (
              <div className="flex flex-col gap-4 mb-6 max-h-[50vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">{isNominalAccountType(editType) ? 'Previous Year Balance (₱)' : 'Opening Balance (₱)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editOpeningBalance}
                    onChange={e => setEditOpeningBalance(e.target.value)}
                    className="w-full form-input font-mono"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    {isNominalAccountType(editType)
                      ? 'Income, Costs and Expense accounts start each year at zero. This is the prior year\'s balance, kept for reference only — it is not populated in the General Ledger.'
                      : 'Sets the starting balance for this account as of the beginning of the accounting period. This value is stored with the account but is not shown on the Chart of Accounts page.'}
                  </p>
                </div>
              </div>
              )}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleSaveEdit(editingId)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                  {coaColumns.map(col => {
                    let widthClass = "";
                    if (col.id === 'id') widthClass = "w-[110px]";
                    if (col.id === 'type') widthClass = "w-[140px]";
                    if (col.id === 'normalSide') widthClass = "w-[130px]";
                    return (
                      <th key={col.id} className={cn("px-4 py-3 leading-5 whitespace-nowrap", widthClass)}>
                        {col.name}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right w-[200px]">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={coaColumns.length + 1} className="px-4 py-16 text-center">
                      <ClipboardList className="w-8 h-8 mx-auto text-text-muted mb-2" />
                      <p className="text-sm font-semibold text-text-secondary">No accounts found</p>
                      <p className="text-xs text-text-muted mt-1">Add an account to get started.</p>
                    </td>
                  </tr>
                ) : (
                  displayRows.map((account, index) => {
                    const balanceValue = getAccountBalance(account);

                    const parentAccount = account.parentId ? accounts.find(a => a.id === account.parentId) : null;

                    return (
                      <tr 
                        key={account.id} 
                        className={cn(
                          "group hover:bg-surface-muted transition-colors",
                        )}
                      >
                        {coaColumns.map(col => {
                          if (col.id === 'id') {
                            return (
                              <td key={col.id} className="px-4 py-3 font-mono text-text-secondary text-[13px] font-medium tabular-nums">
                                {account.id}
                              </td>
                            );
                          }
                          if (col.id === 'name') {
                            return (
                              <td key={col.id} className="px-4 py-3 font-sans font-semibold text-text-primary text-sm leading-6">
                                <div className="flex items-start gap-2">
                                  {account.parentId && (
                                    <span className="text-text-muted font-mono text-base ml-2 select-none">↳</span>
                                  )}
                                  <div className="flex flex-col">
                                    <span>{account.name}</span>
                                    {parentAccount && (
                                      <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-semibold tracking-wide mt-0.5">
                                        Parent: {parentAccount.name} ({account.parentId})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }
                          if (col.id === 'type') {
                            return (
                              <td key={col.id} className="px-4 py-3">
                                <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', typeBadgeClass(account.type))}>{account.type}</span>
                              </td>
                            );
                          }
                          if (col.id === 'normalSide') {
                            return (
                              <td key={col.id} className="px-4 py-3 text-sm text-text-secondary font-medium capitalize">
                                {account.normalSide || getNormalSide(account.type)}
                              </td>
                            );
                          }
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm text-text-primary">
                              {account[col.id] != null && account[col.id] !== ''
                                ? account[col.id]
                                : <span className="text-slate-400 dark:text-slate-600">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-mono text-text-primary text-sm font-semibold tabular-nums">
                          <div className="flex items-center justify-end gap-2.5">
                            <span className={cn(balanceValue < 0 && 'text-danger-600 dark:text-rose-400')}>
                              {balanceValue < 0 ? '−' : ''}₱{Math.abs(balanceValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            
                            <div
                              className="relative ml-2 shrink-0"
                              ref={openActionMenuId === account.id ? actionMenuRef : undefined}
                            >
                              <button
                                onClick={() => setOpenActionMenuId(openActionMenuId === account.id ? null : account.id)}
                                className={cn(
                                  "p-1.5 rounded-md transition-colors focus-visible:opacity-100",
                                  openActionMenuId === account.id
                                    ? "bg-surface-subtle text-text-primary"
                                    : "md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-subtle text-text-muted hover:text-text-primary"
                                )}
                                title="Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {openActionMenuId === account.id && (
                                <div className={cn("absolute right-0 w-44 bg-surface border border-border rounded-lg shadow-pop py-1 z-30 text-left font-sans", index >= displayRows.length - 2 && displayRows.length > 3 ? "bottom-full mb-1" : "top-full mt-1")}>
                                  {canCoaAction('edit') && <button
                                    onClick={() => {
                                      setEditingId(account.id);
                                      setEditCode(account.id);
                                      setEditName(account.name);
                                      setEditType(account.type);
                                      setEditNormalSide(account.normalSide || getNormalSide(account.type));
                                      setEditParentId(account.parentId || '');
                                      {
                                        const v = isNominalAccountType(account.type) ? (account.previousYearBalance ?? account.openingBalance) : account.openingBalance;
                                        setEditOpeningBalance(v !== undefined ? String(v) : '');
                                      }
                                      setEditModalTab('details');

                                      // Collect custom fields
                                      const editingMap: Record<string, string> = {};
                                      coaColumns.forEach(c => {
                                        if (!c.isSystem && c.id !== 'normalSide') {
                                          editingMap[c.id] = account[c.id] || '';
                                        }
                                      });
                                      setEditCustomValues(editingMap);
                                      setOpenActionMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Edit Account
                                  </button>}
                                  <button
                                    onClick={() => {
                                      handleMoveUp(account.id);
                                      setOpenActionMenuId(null);
                                    }}
                                    disabled={index === 0}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                                      index === 0
                                        ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                                        : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                    )}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                    Move Up
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleMoveDown(account.id);
                                      setOpenActionMenuId(null);
                                    }}
                                    disabled={index === displayRows.length - 1}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                                      index === displayRows.length - 1
                                        ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                                        : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                    )}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                    Move Down
                                  </button>
                                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                  {canCoaAction('delete') && <button
                                    onClick={() => {
                                      handleDelete(account.id);
                                      setOpenActionMenuId(null);
                                    }}
                                    disabled={!canDelete}
                                    title={canDelete ? 'Delete Account' : 'Delete Transactions permission not granted'}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Account
                                  </button>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
          </div>
    </div>
  );
}
