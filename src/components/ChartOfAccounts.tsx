import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BookOpen, Plus, Trash2, RefreshCcw, Edit2, ClipboardList, Check, X, Columns, ArrowUpDown, Upload, Eye, EyeOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { CoaAccount } from '../types';
import { cn } from '../lib/utils';

export const DEFAULT_ACCOUNTS: CoaAccount[] = [
  { id: '1000', name: 'Cash on Hand', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: '1200', name: 'Creditable Withholding Tax', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: '1300', name: 'Inventory', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: '2100', name: 'VAT Output Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: '2200', name: 'VAT Input Receivable', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: '2300', name: 'Withholding Tax Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: '3000', name: 'Capital Stock', type: 'Equity', normalSide: 'credit' },
  { id: '3100', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { id: '4000', name: 'Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { id: '5000', name: 'Cost of Goods Sold', type: 'Expense', subType: 'Costs', normalSide: 'debit' },
  { id: '5100', name: 'Operating Expenses', type: 'Expense', subType: 'Administrative expense', normalSide: 'debit' },
];

export const DEFAULT_ACCOUNTS_ALPHA: CoaAccount[] = [
  { id: 'COH-1000', name: 'Cash on Hand', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: 'ACR-1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: 'CWT-1200', name: 'Creditable Withholding Tax', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: 'INV-1300', name: 'Inventory', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: 'ACP-2000', name: 'Accounts Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: 'VOP-2100', name: 'VAT Output Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: 'VIR-2200', name: 'VAT Input Receivable', type: 'Asset', subType: 'Current Assets', normalSide: 'debit' },
  { id: 'WTP-2300', name: 'Withholding Tax Payable', type: 'Liability', subType: 'Current Liabilities', normalSide: 'credit' },
  { id: 'CAP-3000', name: 'Capital Stock', type: 'Equity', normalSide: 'credit' },
  { id: 'RET-3100', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { id: 'REV-4000', name: 'Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { id: 'CGS-5000', name: 'Cost of Goods Sold', type: 'Expense', subType: 'Costs', normalSide: 'debit' },
  { id: 'OPE-5100', name: 'Operating Expenses', type: 'Expense', subType: 'Administrative expense', normalSide: 'debit' },
];

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const SUBTYPES_BY_TYPE: Record<string, string[]> = {
  Asset: ['Current Assets', 'Noncurrent Assets'],
  Liability: ['Current Liabilities', 'Noncurrent Liabilities'],
  Expense: ['Costs', 'Selling expense', 'Administrative expense'],
  Equity: [],
  Revenue: []
};

export function getNormalSide(type: string): 'debit' | 'credit' {
  const t = type.toLowerCase();
  if (t === 'asset' || t === 'assets' || t === 'expense' || t === 'expenses' || t === 'costs' || t === 'cost') {
    return 'debit';
  }
  return 'credit';
}

// Maps a free-text account type (from an uploaded file) to a canonical CoA type + optional sub-type
function normalizeUploadedType(raw: string): { type: string; subType?: string } {
  const t = (raw || '').trim().toLowerCase();
  if (t === 'asset' || t === 'assets') return { type: 'Asset' };
  if (t === 'liability' || t === 'liabilities') return { type: 'Liability' };
  if (t === 'equity') return { type: 'Equity' };
  if (t === 'revenue' || t === 'income') return { type: 'Revenue' };
  if (t === 'cost' || t === 'costs') return { type: 'Expense', subType: 'Costs' };
  if (t === 'expense' || t === 'expenses') return { type: 'Expense' };
  // Fallback: keep whatever was typed, capitalized, so it isn't silently dropped
  return { type: raw.trim() ? raw.trim() : 'Asset' };
}

const TYPE_BASE_CODE: Record<string, number> = {
  Asset: 1000,
  Liability: 2000,
  Equity: 3000,
  Revenue: 4000,
  Expense: 5000,
};

// Generates a unique account code for an uploaded row, following the client's numeric/alphanumeric preference
function generateUploadedAccountId(name: string, type: string, usedIds: Set<string>, format: 'numeric' | 'alphanumeric'): string {
  const base = TYPE_BASE_CODE[type] ?? 9000;
  let num = base;
  while (usedIds.has(String(num))) num += 10;

  if (format === 'alphanumeric') {
    const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3) || 'GEN';
    let candidate = `${letters}-${num}`;
    while (usedIds.has(candidate)) {
      num += 10;
      candidate = `${letters}-${num}`;
    }
    return candidate;
  }

  return String(num);
}

// Finds a column key in an uploaded row object matching one of the given normalized aliases
function findColumnKey(row: Record<string, any>, aliases: string[]): string | undefined {
  return Object.keys(row).find(key => aliases.includes(key.toLowerCase().replace(/[^a-z]/g, '')));
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

export function ChartOfAccounts() {
  const { currentClient, currentClientId, saveClient, showToast } = useAccounting();
  const [isAdding, setIsAdding] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [showHidden, setShowHidden] = useState(false);
  
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Asset');
  const [newSubType, setNewSubType] = useState('Current Assets');
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

  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('Asset');
  const [editSubType, setEditSubType] = useState('');
  const [editNormalSide, setEditNormalSide] = useState<'debit' | 'credit'>('debit');
  const [editParentId, setEditParentId] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editModalTab, setEditModalTab] = useState<'details' | 'openingBalance'>('details');
  const [swappingId, setSwappingId] = useState<string | null>(null);

  // Multi-select state for bulk deletion
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());

  // Sub-Type filter (options depend on the selected Account Type filter)
  const [subTypeFilter, setSubTypeFilter] = useState('All');

  const coaColumns = useMemo(() => {
    const defaultColumns = [
      { id: 'id', name: 'Code', isSystem: true },
      { id: 'name', name: 'Account Title', isSystem: true },
      { id: 'type', name: 'Account Type', isSystem: true },
      { id: 'subType', name: 'Sub-Type', isSystem: false },
      { id: 'normalSide', name: 'Normal Entry', isSystem: false }
    ];
    return currentClient?.coaColumns || defaultColumns;
  }, [currentClient?.coaColumns]);

  const handleAddColumn = () => {
    if (!newColumnName.trim()) {
      alert("Please provide a name for the new column.");
      return;
    }
    const slug = 'col_' + Date.now();
    const updated = [
      ...coaColumns,
      { id: slug, name: newColumnName.trim(), isSystem: false }
    ];
    saveClient(currentClientId!, {
      ...currentClient!,
      coaColumns: updated
    });
    setNewColumnName('');
    showToast(`Added column "${newColumnName.trim()}"`);
  };

  const handleDeleteColumn = (id: string) => {
    const colToDelete = coaColumns.find(c => c.id === id);
    if (!colToDelete) return;
    
    if (confirm(`Are you sure you want to delete the column "${colToDelete.name}"? This column will be hidden and removed from all accounts.`)) {
      const updated = coaColumns.filter(c => c.id !== id);
      saveClient(currentClientId!, {
        ...currentClient!,
        coaColumns: updated
      });
      showToast(`Deleted column "${colToDelete.name}"`);
    }
  };

  const handleSaveColumnRename = (id: string) => {
    if (!editingColumnName.trim()) {
      alert("Name cannot be empty.");
      return;
    }
    const updated = coaColumns.map(c => 
      c.id === id ? { ...c, name: editingColumnName.trim() } : c
    );
    saveClient(currentClientId!, {
      ...currentClient!,
      coaColumns: updated
    });
    setEditingColumnId(null);
    setEditingColumnName('');
    showToast("Column renamed successfully");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(event.target as Node)) {
        setShowPresets(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [presetsRef]);

  // Adjust normal side and default sub-type automatically when type changes in adding form
  useEffect(() => {
    setNewNormalSide(getNormalSide(newType));
    const subTypes = SUBTYPES_BY_TYPE[newType] || [];
    setNewSubType(subTypes[0] || '');
    setNewParentId('');
  }, [newType]);

  // Adjust normal side and default sub-type automatically when type changes in editing form
  useEffect(() => {
    setEditNormalSide(getNormalSide(editType));
    const subTypes = SUBTYPES_BY_TYPE[editType] || [];
    if (subTypes.length > 0 && !subTypes.includes(editSubType)) {
      setEditSubType(subTypes[0]);
    } else if (subTypes.length === 0) {
      setEditSubType('');
    }
  }, [editType]);

  if (!currentClient || !currentClientId) return null;

  let accounts = currentClient.accounts || [];
  if (accounts.length === 0) {
    accounts = currentClient.coaFormat === 'alphanumeric' ? [...DEFAULT_ACCOUNTS_ALPHA] : [...DEFAULT_ACCOUNTS];
  }

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

  // Sub-type options available for the current Account Type filter.
  // When "All Account Types" is selected, offer every known sub-type across all types.
  const availableFilterSubTypes = useMemo(() => {
    if (typeFilter === 'All') {
      const all = Object.values(SUBTYPES_BY_TYPE).flat();
      return Array.from(new Set(all));
    }
    return SUBTYPES_BY_TYPE[typeFilter] || [];
  }, [typeFilter]);

  // Reset the sub-type filter whenever it's no longer valid for the selected Account Type
  useEffect(() => {
    if (subTypeFilter !== 'All' && !availableFilterSubTypes.includes(subTypeFilter)) {
      setSubTypeFilter('All');
    }
  }, [availableFilterSubTypes, subTypeFilter]);

  const filteredAccounts = (typeFilter === 'All'
    ? accounts
    : accounts.filter(a => a.type.toLowerCase() === typeFilter.toLowerCase())
  )
    .filter(a => subTypeFilter === 'All' || (a.subType || '') === subTypeFilter)
    .filter(a => showHidden || !a.hidden);

  const hiddenCount = accounts.filter(a => a.hidden).length;

  // Selection helpers for bulk deletion
  const allVisibleSelected = filteredAccounts.length > 0 && filteredAccounts.every(a => selectedIds.has(a.id));
  const someVisibleSelected = filteredAccounts.some(a => selectedIds.has(a.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) {
        // Deselect only the currently visible accounts
        const next = new Set(prev);
        filteredAccounts.forEach(a => next.delete(a.id));
        return next;
      }
      const next = new Set(prev);
      filteredAccounts.forEach(a => next.add(a.id));
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const willOrphanChildren = accounts.some(a => a.parentId && selectedIds.has(a.parentId) && !selectedIds.has(a.id));
    const question = willOrphanChildren
      ? `Are you sure you want to delete ${selectedIds.size} selected account(s)? Some have sub-accounts that will become top-level main accounts.`
      : `Are you sure you want to delete ${selectedIds.size} selected account(s)? This cannot be undone.`;
    if (confirm(question)) {
      const updatedAccounts = accounts
        .filter(a => !selectedIds.has(a.id))
        .map(a => (a.parentId && selectedIds.has(a.parentId)) ? { ...a, parentId: undefined } : a);
      handleSaveAccounts(updatedAccounts);
      showToast(`Deleted ${selectedIds.size} account(s).`);
      setSelectedIds(new Set());
    }
  };

  // Updates just the Sub-Type of a single account inline from the table row
  const handleInlineSubTypeChange = (accountId: string, subType: string) => {
    const updatedAccounts = accounts.map(a =>
      a.id === accountId ? { ...a, subType: subType || undefined } : a
    );
    handleSaveAccounts(updatedAccounts);
  };

  const handleSaveAccounts = (updatedAccounts: CoaAccount[], coaFormat?: 'numeric' | 'alphanumeric') => {
    const format = coaFormat || currentClient.coaFormat || 'numeric';
    const resequenced = resequenceAccounts(updatedAccounts, format);
    saveClient(currentClientId, { 
      ...currentClient, 
      accounts: resequenced,
      coaFormat: format
    });
  };

  const handleToggleHidden = (id: string) => {
    const updatedAccounts = accounts.map(a => a.id === id ? { ...a, hidden: !a.hidden } : a);
    handleSaveAccounts(updatedAccounts);
  };

  const applyPreset = (format: 'numeric' | 'alphanumeric') => {
    if (accounts.length > 0) {
      if (!confirm(`Are you sure you want to replace all your accounts with the ${format} preset? This will delete all custom accounts.`)) {
        return;
      }
    }
    const newDefaults = format === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS;
    handleSaveAccounts([...newDefaults], format);
    setShowPresets(false);
  };

  const handleAddAccount = () => {
    if (!newCode || !newName || !newType) {
      alert("Please fill out Account Code and Name.");
      return;
    }
    if (accounts.some(a => a.id === newCode)) {
      alert("An account with this code already exists!");
      return;
    }
    
    // Add custom fields
    const customFields: Record<string, any> = {};
    Object.keys(newCustomValues).forEach(key => {
      customFields[key] = newCustomValues[key];
    });

    const updatedAccounts = [...accounts, { 
      id: newCode, 
      name: newName, 
      type: newType, 
      subType: newSubType || undefined,
      normalSide: newNormalSide,
      parentId: newParentId || undefined,
      ...customFields
    }];
    handleSaveAccounts(updatedAccounts);
    setIsAdding(false);
    setNewCode('');
    setNewName('');
    setNewType('Asset');
    setNewNormalSide('debit');
    setNewParentId('');
    setNewCustomValues({});
  };

  // Parses an uploaded CSV/XLSX/XLS file for "Account Title" and "Account Type" columns
  // and appends any new accounts found to the Chart of Accounts.
  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (rows.length === 0) {
          alert("The uploaded file appears to be empty.");
          return;
        }

        const titleKey = findColumnKey(rows[0], ['accounttitle', 'accountname', 'title', 'name']);
        const typeKey = findColumnKey(rows[0], ['accounttype', 'type']);

        if (!titleKey || !typeKey) {
          alert('Could not find "Account Title" and "Account Type" columns in the uploaded file. Please check the header row and try again.');
          return;
        }

        const format = currentClient.coaFormat || 'numeric';
        const usedIds = new Set(accounts.map(a => a.id));
        const existingNames = new Set(accounts.map(a => a.name.trim().toLowerCase()));

        const newAccounts: CoaAccount[] = [];
        let skipped = 0;

        rows.forEach(row => {
          const name = String(row[titleKey] || '').trim();
          const rawType = String(row[typeKey] || '').trim();
          if (!name || !rawType) { skipped++; return; }
          if (existingNames.has(name.toLowerCase())) { skipped++; return; }

          const { type, subType } = normalizeUploadedType(rawType);
          const id = generateUploadedAccountId(name, type, usedIds, format);
          usedIds.add(id);
          existingNames.add(name.toLowerCase());

          newAccounts.push({
            id,
            name,
            type,
            subType,
            normalSide: getNormalSide(type),
          });
        });

        if (newAccounts.length === 0) {
          showToast(skipped > 0 ? "No new accounts added — all rows were duplicates or incomplete." : "No valid rows found in the file.");
          return;
        }

        handleSaveAccounts([...accounts, ...newAccounts]);
        showToast(`Uploaded ${newAccounts.length} account${newAccounts.length === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped)` : ''}.`);
      } catch (err) {
        alert("Couldn't read that file. Please upload a CSV, XLS, or XLSX file with 'Account Title' and 'Account Type' columns.");
      } finally {
        setIsUploading(false);
        if (uploadInputRef.current) uploadInputRef.current.value = '';
      }
    };
    setIsUploading(true);
    reader.readAsArrayBuffer(file);
  };

  const handleDelete = (id: string) => {
    const hasChildren = accounts.some(a => a.parentId === id);
    let question = "Are you sure you want to delete this account?";
    if (hasChildren) {
      question = "Warning: This account has sub-accounts! Deleting this main account will make its sub-accounts top-level main accounts. Are you sure you want to proceed?";
    }
    if (confirm(question)) {
      const updatedAccounts = accounts
        .filter(a => a.id !== id)
        .map(a => a.parentId === id ? { ...a, parentId: undefined } : a);
      handleSaveAccounts(updatedAccounts);
    }
  };

  const handleSaveEdit = (oldId: string) => {
    if (!editCode || !editName) {
      alert("Please fill out Account Code and Name.");
      return;
    }
    
    if (editCode !== oldId && accounts.some(a => a.id === editCode)) {
      alert("An account with this code already exists!");
      return;
    }

    const updatedAccounts = accounts.map(a => {
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
          subType: editSubType || undefined,
          normalSide: editNormalSide,
          parentId: editParentId || undefined,
          openingBalance: editOpeningBalance !== '' ? parseFloat(editOpeningBalance) || 0 : undefined,
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

    handleSaveAccounts(updatedAccounts);
    setEditingId(null);
    setEditParentId('');
    setEditCustomValues({});
    setEditOpeningBalance('');
    setEditModalTab('details');
  };

  const handleSwapConfirm = (idA: string, idB: string) => {
    if (idA === idB) return;
    
    const accountA = accounts.find(a => a.id === idA);
    const accountB = accounts.find(a => a.id === idB);
    if (!accountA || !accountB) return;

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
        const oldParentId = a.parentId!;
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
        const oldParentId = b.parentId!;
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
    setSwappingId(null);
    showToast(`Swapped "${accountA.name}" branch and "${accountB.name}" branch together with their subaccounts successfully!`);
  };

  // Dynamically calculate actual real-time balances from active journals / ledger
  const getAccountBalance = (account: CoaAccount) => {
    let balance = 0;

    // 1. Check General Ledger entries if they match this account name or id (case-insensitive)
    if (currentClient.glAccounts) {
      const glMatch = currentClient.glAccounts.find(g => 
        g.accountTitle.trim().toLowerCase() === account.name.trim().toLowerCase() ||
        g.accountTitle.trim().toLowerCase().includes(account.id.trim().toLowerCase())
      );
      if (glMatch && glMatch.entries) {
        glMatch.entries.forEach(e => {
          const d = parseFloat(e.debit.replace(/,/g, ''));
          const c = parseFloat(e.credit.replace(/,/g, ''));
          const drVal = isNaN(d) ? 0 : d;
          const crVal = isNaN(c) ? 0 : c;
          if (account.normalSide === 'debit') {
            balance += (drVal - crVal);
          } else {
            balance += (crVal - drVal);
          }
        });
        if (balance !== 0) return balance;
      }
    }

    // 2. Fallbacks: Check Purchases matching account name for Accounts Payable
    if (currentClient.purchases && (account.name.toLowerCase() === 'accounts payable' || account.id === '2000')) {
      const totalPurchases = currentClient.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
      return totalPurchases;
    }
    if (currentClient.purchases) {
      const expenseMatchTotal = currentClient.purchases
        .filter(p => p.accountTitle.trim().toLowerCase() === account.name.trim().toLowerCase())
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      if (expenseMatchTotal > 0) return expenseMatchTotal;
    }

    // 3. Check Sales matching account name for Sales Revenue
    if (currentClient.sales && (account.name.toLowerCase() === 'sales revenue' || account.id === '4000')) {
      const totalSales = currentClient.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
      return totalSales;
    }

    return 0;
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Chart of Accounts" icon={<BookOpen />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Manage your ledger accounts, normal sides, and current balances.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="relative" ref={presetsRef}>
                <button 
                  onClick={() => setShowPresets(!showPresets)}
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <RefreshCcw className="w-3 h-3" /> Reset / Choose Format
                </button>
                {showPresets && (
                  <div className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden z-20">
                    <button 
                      onClick={() => applyPreset('numeric')}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Numeric Code Format
                    </button>
                    <button 
                      onClick={() => applyPreset('alphanumeric')}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Alphanumeric Format
                    </button>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowColumnManager(!showColumnManager)}
                className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-750 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Columns className="w-3.5 h-3.5" /> Configure Columns
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end self-stretch sm:self-auto">
            <input
              ref={uploadInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleUploadFile}
              className="hidden"
            />
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Upload a CSV or Excel file with 'Account Title' and 'Account Type' columns"
            >
              <Upload className="w-3.5 h-3.5" /> {isUploading ? 'Uploading...' : 'Upload Chart of Accounts'}
            </button>
          </div>
        </div>

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
                                className="p-1 hover:bg-red-50 dark:hover:bg-slate-800 text-red-500 rounded transition-colors"
                                title="Delete column"
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
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

                {coaColumns.some(col => col.id === 'subType') && SUBTYPES_BY_TYPE[newType]?.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Sub-Type</label>
                    <select 
                      value={newSubType} 
                      onChange={e => setNewSubType(e.target.value)} 
                      className="w-full form-input"
                    >
                      {SUBTYPES_BY_TYPE[newType].map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                )}

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
                {coaColumns.filter(col => !col.isSystem && col.id !== 'subType' && col.id !== 'normalSide').map(col => (
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
                  Opening Balance
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
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

                {coaColumns.some(col => col.id === 'subType') && SUBTYPES_BY_TYPE[editType]?.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Sub-Type</label>
                    <select 
                      value={editSubType} 
                      onChange={e => setEditSubType(e.target.value)} 
                      className="w-full form-input"
                    >
                      {SUBTYPES_BY_TYPE[editType].map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                )}

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
                {coaColumns.filter(col => !col.isSystem && col.id !== 'subType' && col.id !== 'normalSide').map(col => (
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Opening Balance (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editOpeningBalance}
                    onChange={e => setEditOpeningBalance(e.target.value)}
                    className="w-full form-input font-mono"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    Sets the starting balance for this account as of the beginning of the accounting period. This value is stored with the account but is not shown on the Chart of Accounts page.
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

        {/* Swapping Active Banner */}
        {swappingId && (
          <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-4 rounded-xl mb-4 text-xs font-semibold text-indigo-800 dark:text-indigo-200 shadow-sm animate-pulse">
            <div className="flex items-center gap-2.5">
              <ArrowUpDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-bounce shrink-0" />
              <span>
                Swapping active: Select another account below to swap with <strong>{accounts.find(a => a.id === swappingId)?.name} ({swappingId})</strong> to change positions and trade corresponding Account Codes.
              </span>
            </div>
            <button 
              onClick={() => setSwappingId(null)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition-colors shadow-sm ml-4 shrink-0"
            >
              Cancel Swap Mode
            </button>
          </div>
        )}

        {/* Chart of Accounts card layout matching image exactly */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="text-slate-500 dark:text-slate-400 w-5 h-5" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Chart of Accounts
              </h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Account Type Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter:</span>
                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs font-semibold py-1.5 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="All">All Account Types</option>
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t} value={t}>{t}s</option>
                  ))}
                </select>
              </div>

              {/* Sub-Type Filter — options depend on the selected Account Type above */}
              {availableFilterSubTypes.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sub-Type:</span>
                  <select
                    id="subtype-filter"
                    value={subTypeFilter}
                    onChange={(e) => setSubTypeFilter(e.target.value)}
                    className="text-xs font-semibold py-1.5 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="All">All Sub-Types</option>
                    {availableFilterSubTypes.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors border bg-red-50 hover:bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400"
                  title="Delete all selected accounts"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIds.size})
                </button>
              )}

              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowHidden(!showHidden)}
                  className={cn(
                    "text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors border",
                    showHidden
                      ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  )}
                  title={showHidden ? "Hide hidden accounts from the list" : "Show hidden accounts"}
                >
                  {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {showHidden ? `Showing Hidden (${hiddenCount})` : `${hiddenCount} Hidden`}
                </button>
              )}


              <button 
                id="add-account-btn"
                onClick={() => setIsAdding(true)}
                className="bg-[#0a4a94] hover:bg-[#07366b] text-white font-bold text-[11px] px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 uppercase tracking-wide shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3px]" /> Add Account
              </button>
            </div>
          </div>

          {/* Table representing exact layout in screenshot */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-500 uppercase tracking-widest">
                  <th className="px-4 py-3 w-[36px]">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500 cursor-pointer"
                      title="Select all visible accounts"
                    />
                  </th>
                  {coaColumns.map(col => {
                    let widthClass = "";
                    if (col.id === 'id') widthClass = "w-[100px]";
                    if (col.id === 'type') widthClass = "w-[130px]";
                    if (col.id === 'subType') widthClass = "w-[160px]";
                    if (col.id === 'normalSide') widthClass = "w-[120px]";
                    return (
                      <th key={col.id} className={cn("px-4 py-3", widthClass)}>
                        {col.name}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right w-[150px]">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={coaColumns.length + 2} className="px-4 py-12 text-center text-slate-500 text-sm">
                      No accounts found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map(account => {
                    const balanceValue = getAccountBalance(account);

                    const parentAccount = account.parentId ? accounts.find(a => a.id === account.parentId) : null;

                    return (
                      <tr 
                        key={account.id} 
                        className={cn(
                          "group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors",
                          account.hidden && "opacity-50"
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(account.id)}
                            onChange={() => toggleSelectOne(account.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500 cursor-pointer"
                            title={`Select ${account.name}`}
                          />
                        </td>
                        {coaColumns.map(col => {
                          if (col.id === 'id') {
                            return (
                              <td key={col.id} className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-400 text-sm font-medium">
                                {account.id}
                              </td>
                            );
                          }
                          if (col.id === 'name') {
                            return (
                              <td key={col.id} className="px-4 py-3.5 font-sans font-medium text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                                <div className="flex items-start gap-2">
                                  {account.parentId && (
                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-base ml-2 select-none">↳</span>
                                  )}
                                  <div className="flex flex-col">
                                    <span>{account.name}</span>
                                    {parentAccount && (
                                      <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold tracking-wide mt-0.5">
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
                              <td key={col.id} className="px-4 py-3.5 text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                                {account.type}
                              </td>
                            );
                          }
                          if (col.id === 'subType') {
                            const subTypeOptions = SUBTYPES_BY_TYPE[account.type] || [];
                            return (
                              <td key={col.id} className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs sm:text-sm" onClick={e => e.stopPropagation()}>
                                {subTypeOptions.length > 0 ? (
                                  <select
                                    value={account.subType || ''}
                                    onChange={e => handleInlineSubTypeChange(account.id, e.target.value)}
                                    className="text-xs font-medium py-1 px-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                    title="Change Sub-Type"
                                  >
                                    <option value="">— No Sub-Type —</option>
                                    {subTypeOptions.map(st => (
                                      <option key={st} value={st}>{st}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-600">—</span>
                                )}
                              </td>
                            );
                          }
                          if (col.id === 'normalSide') {
                            return (
                              <td key={col.id} className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-sm capitalize">
                                {account.normalSide || getNormalSide(account.type)}
                              </td>
                            );
                          }
                          return (
                            <td key={col.id} className="px-4 py-3.5 text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                              {account[col.id] || <span className="text-slate-400 dark:text-slate-600">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3.5 text-right font-mono text-slate-800 dark:text-slate-100 text-sm font-semibold">
                          <div className="flex items-center justify-end gap-2.5">
                            <span>
                              ₱ {balanceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            
                            {swappingId ? (
                              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                {account.id === swappingId ? (
                                  <button
                                    onClick={() => setSwappingId(null)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950/20 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                                    title="Cancel swap mode"
                                  >
                                    <X className="w-3 h-3" /> Cancel
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSwapConfirm(swappingId, account.id)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/45 border border-indigo-200 dark:border-indigo-900/50 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                                    title={`Swap with ${accounts.find(a => a.id === swappingId)?.name}`}
                                  >
                                    <ArrowUpDown className="w-3 h-3" /> Swap Here
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                <button
                                  onClick={() => handleToggleHidden(account.id)}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 transition-colors"
                                  title={account.hidden ? "Unhide Account" : "Hide Account"}
                                >
                                  {account.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => setSwappingId(account.id)}
                                  className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded text-indigo-500 transition-colors"
                                  title="Swap/Switch Account Code and Order"
                                >
                                  <ArrowUpDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingId(account.id);
                                    setEditCode(account.id);
                                    setEditName(account.name);
                                    setEditType(account.type);
                                    setEditSubType(account.subType || '');
                                    setEditNormalSide(account.normalSide || getNormalSide(account.type));
                                    setEditParentId(account.parentId || '');
                                    setEditOpeningBalance(account.openingBalance !== undefined ? String(account.openingBalance) : '');
                                    setEditModalTab('details');

                                    // Collect custom fields
                                    const editingMap: Record<string, string> = {};
                                    coaColumns.forEach(c => {
                                      if (!c.isSystem && c.id !== 'subType' && c.id !== 'normalSide') {
                                        editingMap[c.id] = account[c.id] || '';
                                      }
                                    });
                                    setEditCustomValues(editingMap);
                                  }}
                                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded text-blue-500 transition-colors"
                                  title="Edit Account"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(account.id)}
                                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-red-500 transition-colors"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
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
