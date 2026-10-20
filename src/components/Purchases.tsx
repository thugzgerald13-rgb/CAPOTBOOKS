import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from './ui/PageHeader';
import { computeApAging, formatMoney } from '../lib/apAging';
import { Combobox } from './ui/Combobox';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, generateCSV, MONTHS, getMonthName } from '../lib/utils';
import { ShoppingCart, Plus, Trash2, X, Paperclip, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { DEFAULT_ACCOUNTS, getNormalSide, resequenceAccounts } from './ChartOfAccounts';
import { getDefaultAccountsForIndustry } from '../lib/journalDefaults';
import { ATC_SCHEDULE } from '../lib/atcSchedule';
import { useGranularPermissions } from '../lib/useGranularPermissions';
import { useAuth } from '../context/AuthContext';
import { modulePermissionKey, actionPermissionKey } from '../lib/granularPermissions';


// Embedded mode lets the Expense History page open the Invoiced / Other
// Payments form in a modal (without routing), pre-filled with a record, and
// auto-close after Update Entry so the user sees the changes in the list.
export type PurchasesEmbeddedProps = {
  embedded?: boolean;
  mode?: 'invoiced' | 'other-payments';
  editPurchase?: any | null;
  onSaved?: () => void;
  onClose?: () => void;
};

type PurchaseAttachment = {
  name: string;
  type: string;
  size: number;
  compressedSize: number;
  encoding: 'optimized-image' | 'gzip' | 'raw';
  data: string;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const gzipBytes = async (bytes: Uint8Array) => {
  if (!('CompressionStream' in window)) return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const optimizeImage = async (file: File): Promise<Blob | null> => {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    const mime = file.type.toLowerCase();
    const quality = mime === 'image/png' ? undefined : 0.82;
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
};

const prepareAttachment = async (file: File): Promise<PurchaseAttachment> => {
  const originalBytes = new Uint8Array(await file.arrayBuffer());

  // Photos are re-encoded to a compact, visually faithful representation.
  const optimized = await optimizeImage(file);
  if (optimized && optimized.size < file.size) {
    return {
      name: file.name,
      type: file.type,
      size: file.size,
      compressedSize: optimized.size,
      encoding: 'optimized-image',
      data: await blobToDataUrl(optimized),
    };
  }

  // PDFs and unsupported images are gzip-compressed only when it actually saves space.
  const gzipped = await gzipBytes(originalBytes);
  if (gzipped && gzipped.length < originalBytes.length) {
    return {
      name: file.name,
      type: file.type,
      size: file.size,
      compressedSize: gzipped.length,
      encoding: 'gzip',
      data: bytesToBase64(gzipped),
    };
  }

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    compressedSize: file.size,
    encoding: 'raw',
    data: await blobToDataUrl(file),
  };
};

const attachmentFromStored = (value: unknown): PurchaseAttachment | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PurchaseAttachment>;
  if (!v.name || !v.type || !v.data || !v.encoding) return null;
  return v as PurchaseAttachment;
};

export function Purchases({ embedded = false, mode = 'invoiced', editPurchase = null, onSaved, onClose }: PurchasesEmbeddedProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isOtherPayments = embedded ? mode === 'other-payments' : location.pathname === '/purchases/other-payments';
  const isAP = embedded ? false : location.pathname === '/purchases/ap';
  const activePermissionModule = isAP ? 'purchases_ap' : isOtherPayments ? 'purchases_other_payments' : 'purchases_invoiced';
  const { canAction: canPurchaseSubmoduleAction } = useGranularPermissions(activePermissionModule);
  const { canAction: canParentPurchaseAction } = useGranularPermissions('purchases');
  // Root Purchases grants stay authoritative for the shared purchases table;
  // the active subpage grant narrows access further.
  const canPurchaseAction = (actionId: string) => canParentPurchaseAction(actionId) && canPurchaseSubmoduleAction(actionId);
  const { canDropdownOption: canPurchaseDropdown } = useGranularPermissions('purchases');
  const { hasPermission } = useAuth();
  const canViewOtherPayments = hasPermission(modulePermissionKey('purchases')) && hasPermission(modulePermissionKey('purchases_other_payments')) && hasPermission(actionPermissionKey('purchases_other_payments', 'view'));
  const canViewAp = hasPermission(modulePermissionKey('purchases')) && hasPermission(modulePermissionKey('purchases_ap')) && hasPermission(actionPermissionKey('purchases_ap', 'view'));
  const paymentMethodOptions = [
    { value: 'Cash', label: '💵 Cash', permission: 'cash' },
    { value: 'Check', label: '📝 Check', permission: 'check' },
    { value: 'E-payments', label: '💳 E-payments', permission: 'bank_transfer' },
    { value: 'On Account', label: '📋 On Account', permission: 'credit' },
  ].filter((option) => canPurchaseDropdown('payment_method', option.permission));
  const vatTypeOptions = [
    { value: 'vat', label: 'VAT', permission: 'vat' },
    { value: 'non-vat', label: 'Non-VAT', permission: 'non_vat' },
    { value: 'vat-nonvat', label: 'VAT + Non-VAT', permission: 'vat_nonvat' },
    { value: 'zero-rated', label: 'Zero-rated', permission: 'zero_rated' },
  ].filter((option) => canPurchaseDropdown('vat_type', option.permission));
  const withholdingOptions = [
    { value: 'w/o', label: 'No withholding', permission: 'none' },
    { value: 'with', label: 'Apply withholding tax', permission: 'withholding' },
  ].filter((option) => canPurchaseDropdown('withholding', option.permission));
  const { currentClient, currentClientId, currentDat, saveCoaAccounts, savePurchase, deletePurchase, showToast, setCurrentDat } = useAccounting();
  // Run 009 / T009 — AP aging summary (unpaid = On Account)
  const apAging = useMemo(() => isAP ? computeApAging(currentClient?.purchases || [], new Date().toISOString().split('T')[0]) : null, [currentClient?.purchases, isAP]);
  
  // Single record state (similar to original but react-friendly)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const transactionDateRef = useRef<HTMLInputElement>(null);
  // Embedded-edit bookkeeping: the record's real id (viewIndex is not a
  // context index in embedded mode) and its original storage-backed
  // attachment so it is not wiped out when the user saves without re-uploading.
  const embeddedEditIdRef = useRef<string | null>(null);
  const embeddedOriginalAttachmentRef = useRef<any>(null);
  const [supplierTin, setSupplierTin] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [netAmount, setNetAmount] = useState(0);
  const [vatType, setVatType] = useState('vat');
  const [exemptAmount, setExemptAmount] = useState('');
  const [zeroRatedAmount, setZeroRatedAmount] = useState('');
  const [withholdingOption, setWithholdingOption] = useState<'w/o' | 'with'>('w/o');
  const [atcCode, setAtcCode] = useState('');
  const [whtAmount, setWhtAmount] = useState(0);
  const [accountTitle, setAccountTitle] = useState('');
  // Other Payments multi-entry line items. Each row carries its own account
  // title and amount; the voucher total is the sum of all line amounts. One
  // empty row is always present so the form is never blank.
  const [otherPaymentEntries, setOtherPaymentEntries] = useState<
    Array<{ id: string; accountTitle: string; amount: string }>
  >([{ id: `e${Date.now()}-0`, accountTitle: '', amount: '' }]);
  const [transactionDetails, setTransactionDetails] = useState('');
  const [inputTax, setInputTax] = useState(0);
  const [attachment, setAttachment] = useState<PurchaseAttachment | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  // Derive available accounts from Chart of Accounts
  const coaAccounts = useMemo(() => {
    let accs = (currentClient?.accounts || []).filter(a => !a.hidden);
    if (accs.length === 0) accs = getDefaultAccountsForIndustry(currentClient?.industry, currentClient?.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    // Account selection is based on the chart of accounts, not an expense class.
    return accs.filter(a => {
      const at = a.type.toLowerCase();
      return at === 'asset' || at === 'assets' || at === 'costs' || at === 'cost' || at === 'expense' || at === 'expenses';
    });
  }, [currentClient?.accounts, currentDat]);

  // Clear the account selection if it no longer exists in the available accounts.
  // This intentionally never auto-picks the first account - the field starts
  // empty and shows the "Type or choose an account..." placeholder until selected.
  useEffect(() => {
    setAccountTitle(prev => (coaAccounts.find(a => a.name === prev) ? prev : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDat, coaAccounts]);

  // Let users customize the "Payment for" account list right from this tab —
  // adding a new Chart of Accounts entry or removing the currently selected
  // one — without having to navigate to the Chart of Accounts page.
  const [showAddPaymentAccount, setShowAddPaymentAccount] = useState(false);
  const [newPaymentAccountName, setNewPaymentAccountName] = useState('');
  const [newPaymentAccountType, setNewPaymentAccountType] = useState<'Asset' | 'Costs' | 'Expense'>('Expense');

  const generatePaymentAccountId = (type: string, format: 'numeric' | 'alphanumeric'): string => {
    const baseByType: Record<string, number> = { Asset: 1000, Costs: 5000, Expense: 5100 };
    const base = baseByType[type] ?? 9000;
    const fallbackAccounts = getDefaultAccountsForIndustry(currentClient?.industry, currentClient?.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    const existingIds = new Set((currentClient?.accounts && currentClient.accounts.length > 0 ? currentClient.accounts : fallbackAccounts).map(a => a.id));
    let n = base;
    while (existingIds.has(String(n))) n += 10;
    if (format === 'alphanumeric') {
      const letters = newPaymentAccountName.replace(/[^a-zA-Z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3) || 'GEN';
      let candidate = `${letters}-${n}`;
      while (existingIds.has(candidate)) {
        n += 10;
        candidate = `${letters}-${n}`;
      }
      return candidate;
    }
    return String(n);
  };

  // ---- Other Payments multi-entry helpers ----
  const otherPaymentTotal = otherPaymentEntries.reduce((sum, e) => {
    const v = parseFloat(String(e.amount || '').replace(/,/g, '').trim());
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  const addOtherPaymentEntry = () => {
    setOtherPaymentEntries(prev => [...prev, { id: `e${Date.now()}-${prev.length}`, accountTitle: '', amount: '' }]);
  };
  const removeOtherPaymentEntry = (id: string) => {
    setOtherPaymentEntries(prev => (prev.length <= 1 ? prev : prev.filter(e => e.id !== id)));
  };
  const updateOtherPaymentEntry = (id: string, field: 'accountTitle' | 'amount', value: string) => {
    setOtherPaymentEntries(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  // ---- Other Payments multiple-entries mode. A checkbox toggles between a
  // single-entry form (with multi-line account+amount breakdown) and a
  // horizontal multi-row grid where each row is a complete entry. A + button
  // appends another row; "Add Entries" saves all rows at once.
  const [multipleEntries, setMultipleEntries] = useState(false);
  type MultiEntryRow = {
    id: string;
    date: string;
    supplierName: string;
    supplierTin: string;
    supplierAddress: string;
    invoiceNo: string;
    paymentMethod: string;
    bankName: string;
    checkNumber: string;
    withholdingOption: string;
    atcCode: string;
    whtAmount: number;
    transactionDetails: string;
    accountTitle: string;
    amount: string;
  };
  const emptyMultiRow = (): MultiEntryRow => ({
    id: `m${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString().split('T')[0],
    supplierName: '', supplierTin: '', supplierAddress: '',
    invoiceNo: '', paymentMethod: 'Cash', bankName: '', checkNumber: '',
    withholdingOption: 'w/o', atcCode: '', whtAmount: 0,
    transactionDetails: '', accountTitle: '', amount: '',
  });
  const [multiEntries, setMultiEntries] = useState<MultiEntryRow[]>([emptyMultiRow()]);
  const addMultiRow = () => setMultiEntries(prev => [...prev, emptyMultiRow()]);
  const removeMultiRow = (id: string) => setMultiEntries(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  const updateMultiRow = (id: string, field: keyof MultiEntryRow, value: string | number) =>
    setMultiEntries(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));

  const handleAddPaymentAccount = () => {
    if (!hasPermission(modulePermissionKey('coa')) || !hasPermission(actionPermissionKey('coa', 'add'))) { showToast('Your profile cannot add chart-of-accounts entries.'); return; }
    if (!currentClient || !currentClientId) return;
    const name = newPaymentAccountName.trim();
    if (!name) {
      alert('Please enter an account name.');
      return;
    }
    const baseAccounts = currentClient.accounts && currentClient.accounts.length > 0 ? currentClient.accounts : getDefaultAccountsForIndustry(currentClient.industry, currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    if (baseAccounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      alert('An account with this name already exists.');
      return;
    }
    const format = currentClient.coaFormat || 'numeric';
    const id = generatePaymentAccountId(newPaymentAccountType, format);
    const newAccount = {
      id,
      name,
      type: newPaymentAccountType,
      normalSide: getNormalSide(newPaymentAccountType),
    };
    const updatedAccounts = resequenceAccounts([...baseAccounts, newAccount], format);
    saveCoaAccounts(updatedAccounts, format);
    setAccountTitle(name);
    setShowAddPaymentAccount(false);
    setNewPaymentAccountName('');
    setNewPaymentAccountType('Expense');
    showToast(`Account "${name}" added.`);
  };

  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [sequenceNumber, setSequenceNumber] = useState(1);

  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // Auto-count sequence number
  useEffect(() => {
    if (currentClient && viewIndex === null) {
      const periodPurchases = currentClient.purchases || [];
      const count = currentDat ? periodPurchases.filter(p => p.datMonthYear === currentDat.formatted).length : 0;
      setSequenceNumber(count + 1);
    }
  }, [currentClient?.purchases.length, currentDat?.formatted, viewIndex]);

  const [autoLoadMsg, setAutoLoadMsg] = useState('');

  const periodPurchases = (() => {
    if (!currentClient) return [];
    const all = currentClient.purchases || [];
    if (currentDat) {
      return all.filter(p => p.datMonthYear === currentDat.formatted);
    } else {
      if (!date) return [];
      const [y, m] = date.split('-');
      const expected = `${MONTHS[parseInt(m) - 1]} ${y}`;
      return all.filter(p => p.datMonthYear === expected);
    }
  })();

  const loadPurchase = (index: number, purchaseList = periodPurchases) => {
    if (index < 0 || index >= purchaseList.length) return;
    const p = purchaseList[index];
    if (p) {
      const dateParts = p.date.split('/');
      setDate(p.date.match(/^\d{4}-\d{2}-\d{2}$/) ? p.date : (dateParts.length === 3 ? `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}` : p.date));
      setPaymentMethod(p.paymentMethod);
      setBankName(p.bankName || '');
      setCheckNumber(p.checkNumber || '');
      setInvoiceNo(p.invoiceNo || '');
      setSupplierTin(p.supplierTin || '');
      setSupplierName(p.supplierName || '');
      setSupplierAddress(p.supplierAddress || '');
      
      const storedVatType = p.vatType || 'vat';
      setVatType(storedVatType);
      const exempt = Number((p as any).exemptAmount ?? 0);
      const zeroRated = Number((p as any).zeroRatedAmount ?? 0);
      setExemptAmount(exempt ? exempt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      setZeroRatedAmount(zeroRated ? zeroRated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      const baseAmount = Number(p.amount ?? 0);
      const inputTax = Number(p.inputTax ?? 0);
      const gross = storedVatType === 'vat'
        ? baseAmount + inputTax
        : storedVatType === 'vat-nonvat'
          ? baseAmount + inputTax + exempt
          : storedVatType === 'non-vat'
            ? exempt
            : zeroRated;
      setAmount(gross ? gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      setWithholdingOption(p.withholdingOption || 'w/o');
      setAtcCode(p.atcCode || '');
      setAccountTitle(p.accountTitle || '');
      // Restore Other Payments multi-entry line items. Legacy records without
      // a stored breakdown fall back to one line built from accountTitle + amount.
      if (isOtherPayments) {
        const stored = (p as any).otherPaymentEntries;
        if (Array.isArray(stored) && stored.length > 0) {
          setOtherPaymentEntries(stored.map((e: any, i: number) => ({
            id: `e${Date.now()}-${i}`,
            accountTitle: e.accountTitle || '',
            amount: e.amount ? Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
          })));
        } else {
          const amt = p.exemptAmount != null ? Number(p.exemptAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
          setOtherPaymentEntries([{ id: `e${Date.now()}-0`, accountTitle: p.accountTitle || '', amount: amt }]);
        }
      }
      
      const acct = currentClient?.accounts?.find(a => a.name === p.accountTitle);

      setTransactionDetails(p.transactionDetails || '');
      setAttachment(attachmentFromStored((p as any).attachment));
      setSequenceNumber(p.sequenceNumber || (index + 1));
      setViewIndex(index);
    }
  };

  useEffect(() => {
    const editPurchaseId = (location.state as { editPurchaseId?: string | number } | null)?.editPurchaseId;
    if (editPurchaseId == null || !currentClient) return;

    const allPurchases = currentClient.purchases || [];
    const index = allPurchases.findIndex(p => String(p.id) === String(editPurchaseId));
    if (index >= 0) {
      loadPurchase(index, allPurchases);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, currentClient, periodPurchases, navigate]);

  // Embedded mode (Expense History edit modal): load the record passed via
  // props directly instead of resolving it through routing/context.
  useEffect(() => {
    if (!embedded || !editPurchase) return;
    embeddedEditIdRef.current = String(editPurchase.id);
    embeddedOriginalAttachmentRef.current = editPurchase.attachment || null;
    loadPurchase(0, [editPurchase]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, editPurchase]);

  const handleAddNew = () => {
    setViewIndex(null);
    setInvoiceNo('');
    setSupplierTin('');
    setSupplierName('');
    setSupplierAddress('');
    setAmount('');
    setExemptAmount('');
    setZeroRatedAmount('');
    setBankName('');
    setCheckNumber('');
    setTransactionDetails('');
    setAttachment(null);
    setAccountTitle('');
    setOtherPaymentEntries([{ id: `e${Date.now()}-0`, accountTitle: '', amount: '' }]);
    const count = periodPurchases.length;
    setSequenceNumber(count + 1);
  };

  // Re-compute input tax and net amount on amount or vat type change
  useEffect(() => {
    const gross = parseFloat(String(amount).replace(/,/g, '')) || 0;
    const exempt = parseFloat(String(exemptAmount).replace(/,/g, '')) || 0;
    if (vatType === 'vat') {
      const net = gross / 1.12;
      setNetAmount(net);
      setInputTax(net * 0.12);
    } else if (vatType === 'vat-nonvat') {
      const vatGross = Math.max(0, gross - exempt);
      const net = vatGross / 1.12;
      setNetAmount(net);
      setInputTax(net * 0.12);
    } else {
      setNetAmount(0);
      setInputTax(0);
    }
  }, [amount, exemptAmount, vatType]);

  // Default to the first ATC in the schedule whenever "With Withholdings" is
  // selected and no ATC has been chosen yet.
  useEffect(() => {
    if (withholdingOption === 'with' && !atcCode && ATC_SCHEDULE.length > 0) {
      setAtcCode(ATC_SCHEDULE[0].code);
    }
    if (withholdingOption === 'w/o' && atcCode) {
      setAtcCode('');
    }
  }, [withholdingOption, atcCode]);

  // Re-compute withholding tax amount (per the BIR Schedule of Alphanumeric
  // Tax Codes) whenever the purchase base, withholding option, or selected
  // ATC changes. The expanded withholding tax base is the full purchase cost
  // EXCLUDING VAT — VATable net PLUS the exempt and zero-rated portions — not
  // just the VATable net. Otherwise non-VAT / zero-rated / mixed purchases
  // with an exempt amount compute zero (or understated) withholding tax.
  useEffect(() => {
    if (withholdingOption === 'with' && atcCode) {
      const entry = ATC_SCHEDULE.find(e => e.code === atcCode);
      const exempt = parseFloat(String(exemptAmount).replace(/,/g, '')) || 0;
      const zeroRated = parseFloat(String(zeroRatedAmount).replace(/,/g, '')) || 0;
      const ewtBase = netAmount + exempt + zeroRated;
      setWhtAmount(entry ? ewtBase * entry.rate : 0);
    } else {
      setWhtAmount(0);
    }
  }, [withholdingOption, atcCode, netAmount, exemptAmount, zeroRatedAmount]);

  // Auto-fill from supplier library
  useEffect(() => {
    if (supplierTin.length === 11 && currentClient) {
      const found = currentClient.tinLibrary.suppliers.find(s => s.tin === supplierTin);
      if (found) {
        setSupplierName(found.name);
        if (found.address) setSupplierAddress(found.address);
        setAutoLoadMsg(`Loaded: ${found.name}`);
        const t = setTimeout(() => setAutoLoadMsg(''), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [supplierTin, currentClient]);

  // Date validation against DAT
  useEffect(() => {
    if (!currentDat || !date) {
      setDateWarning(null);
      return;
    }
    const selectedDate = new Date(date);
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth() + 1;

    if (y > currentDat.year) {
      setDateWarning(`⚠️ Transaction year (${y}) cannot be later than DAT year (${currentDat.year})`);
    } else if (y < currentDat.year) {
      setDateWarning(`⚠️ Transaction year (${y}) is earlier than DAT year (${currentDat.year}). Please select a date within ${currentDat.formatted}.`);
    } else if (m > currentDat.month) {
      setDateWarning(`⚠️ Transaction month cannot be later than DAT month`);
    } else if (m < currentDat.month) {
      setDateWarning(`⚠️ Transaction month is earlier than DAT month. Please select a date within ${currentDat.formatted}.`);
    } else {
      setDateWarning(null);
    }
  }, [date, currentDat]);

  const handleAddPurchase = async () => {
    const editingExisting = embedded ? Boolean(editPurchase) || viewIndex !== null : viewIndex !== null;
    if (!canPurchaseAction(editingExisting ? 'edit' : 'add')) { showToast(`Your profile does not have permission to ${editingExisting ? 'edit' : 'add'} purchases.`); return; }
    const paymentPermission = paymentMethodOptions.find((option) => option.value === paymentMethod)?.permission;
    if (!isAP && !isOtherPayments && (!paymentPermission || !canPurchaseDropdown('payment_method', paymentPermission))) { showToast('The selected payment method is not permitted for your profile.'); return; }
    const vatPermission = vatTypeOptions.find((option) => option.value === vatType)?.permission;
    if (!isOtherPayments && !isAP && (!vatPermission || !canPurchaseDropdown('vat_type', vatPermission))) { showToast('The selected VAT option is not permitted for your profile.'); return; }
    const withholdingPermission = withholdingOptions.find((option) => option.value === withholdingOption)?.permission;
    if (!isAP && (!withholdingPermission || !canPurchaseDropdown('withholding', withholdingPermission))) { showToast('The selected withholding option is not permitted for your profile.'); return; }
    if (!currentClient || !currentClientId) return;

    // Validate the values currently shown in the form. In edit mode, fields
    // loaded from an existing record must remain valid even when the user only
    // changes one field (for example, Amount).
    const parsedAmount = parseFloat(String(amount || '').replace(/,/g, '').trim());
    const parsedExemptAmount = parseFloat(String(exemptAmount || '').replace(/,/g, '').trim());
    const parsedZeroRatedAmount = parseFloat(String(zeroRatedAmount || '').replace(/,/g, '').trim());

    const hasDate = Boolean(String(date || '').trim());
    const hasSupplierName = Boolean(String(supplierName || '').trim());
    const hasAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0;
    const hasInvoiceAndTin = isOtherPayments
      || (Boolean(String(invoiceNo || '').trim()) && Boolean(String(supplierTin || '').trim()));

    const hasVatAmount = isOtherPayments
      || (vatType === 'non-vat'
        ? Number.isFinite(parsedExemptAmount) && parsedExemptAmount >= 0
        : vatType === 'zero-rated'
          ? Number.isFinite(parsedZeroRatedAmount) && parsedZeroRatedAmount >= 0
          : hasAmount);

    // For Other Payments, at least one line item must have both an account
    // title and a positive amount. The voucher total is the sum of all lines.
    const validOtherPaymentEntries = isOtherPayments
      ? otherPaymentEntries.filter(e => {
          const v = parseFloat(String(e.amount || '').replace(/,/g, '').trim());
          return Boolean(String(e.accountTitle || '').trim()) && Number.isFinite(v) && v > 0;
        })
      : [];
    const hasOtherPaymentEntries = !isOtherPayments || validOtherPaymentEntries.length > 0;

    if (!(isOtherPayments && multipleEntries) && (!hasDate || !hasSupplierName || !hasInvoiceAndTin || !hasVatAmount || !hasOtherPaymentEntries)) {
      alert('Please fill out all required fields with valid values.');
      return;
    }

    if (dateWarning) {
      alert('Please fix date warning before saving.');
      return;
    }

    const [y, m, d] = date.split('-');
    const formattedDate = `${m}/${d}/${y}`;

    // In embedded edit mode the real id comes from the loaded record (viewIndex
    // is 0 and is NOT a context index). Preserve an existing storage-backed
    // attachment when the user did not upload a new one — otherwise
    // savePurchase would delete the old file and clear the reference.
    const editId = embedded
      ? (embeddedEditIdRef.current || editPurchase?.id || (viewIndex !== null ? currentClient.purchases[viewIndex]?.id : Date.now()))
      : (viewIndex !== null ? currentClient.purchases[viewIndex].id : Date.now());
    const editSequence = embedded
      ? (editPurchase?.sequenceNumber || sequenceNumber)
      : (viewIndex !== null ? (currentClient.purchases[viewIndex].sequenceNumber || sequenceNumber) : sequenceNumber);
    const finalAttachment = attachment || (embedded && embeddedOriginalAttachmentRef.current?.storagePath ? embeddedOriginalAttachmentRef.current : null);

    const purchaseData = {
      id: editId,
      sequenceNumber: editSequence,
      datMonthYear: currentDat ? currentDat.formatted : `${MONTHS[parseInt(m) - 1]} ${y}`,
      date: formattedDate,
      paymentMethod: isAP ? '' : paymentMethod,
      bankName: paymentMethod === 'Check' ? bankName : null,
      checkNumber: paymentMethod === 'Check' ? checkNumber : null,
      invoiceNo,
      supplierTin,
      supplierName,
      supplierAddress,
      // Keep each VAT classification in its own field. `amount` is the
      // VATable net amount only; exempt and 0-rated values are stored only in
      // their dedicated fields so they cannot be duplicated in Expense History
      // or mapped into the wrong Supabase column. Other Payments intentionally
      // uses only exemptAmount because that screen's Amount represents exempt.
      amount: isOtherPayments ? 0 : ((vatType === 'vat-nonvat' || vatType === 'vat') ? netAmount : 0),
      vatType: isOtherPayments ? 'non-vat' : vatType,
      exemptAmount: isOtherPayments ? otherPaymentTotal : (vatType === 'non-vat' || vatType === 'vat-nonvat' ? (parseFloat(String(exemptAmount).replace(/,/g, '')) || 0) : 0),
      zeroRatedAmount: isOtherPayments ? 0 : (vatType === 'zero-rated' ? (parseFloat(String(zeroRatedAmount).replace(/,/g, '')) || 0) : 0),
      withholdingOption,
      atcCode: withholdingOption === 'with' ? atcCode : null,
      whtRate: withholdingOption === 'with' ? (ATC_SCHEDULE.find(e => e.code === atcCode)?.rate ?? null) : null,
      whtAmount: withholdingOption === 'with' ? whtAmount : 0,
      // Other Payments: accountTitle holds a summary of the line items so
      // list/history views still show something meaningful; the full per-line
      // breakdown is stored in otherPaymentEntries and restored on edit.
      accountTitle: isOtherPayments
        ? (validOtherPaymentEntries.length === 1
            ? validOtherPaymentEntries[0].accountTitle
            : `${validOtherPaymentEntries[0]?.accountTitle || 'Multiple'} +${validOtherPaymentEntries.length - 1} more`)
        : accountTitle,
      transactionDetails,
      // Full multi-entry breakdown for Other Payments (account + amount per line).
      ...(isOtherPayments ? {
        otherPaymentEntries: validOtherPaymentEntries.map(e => ({
          accountTitle: e.accountTitle,
          amount: parseFloat(String(e.amount || '').replace(/,/g, '').trim()) || 0,
        })),
      } : {}),
      inputTax: isOtherPayments ? 0 : inputTax,
      attachment: finalAttachment,
    };

    // Duplicate guard: the same supplier (TIN) cannot invoice twice with the
    // same invoice number. Check across ALL periods (not just the currently
    // selected one) and exclude the record currently being edited. Skip when
    // there is no invoice number (e.g. miscellaneous payments without one).
    const trimmedInvoice = String(invoiceNo || '').trim();
    const trimmedTin = String(supplierTin || '').trim();
    if (trimmedInvoice) {
      const duplicate = (currentClient.purchases || []).find(p =>
        String(p.invoiceNo || '').trim().toLowerCase() === trimmedInvoice.toLowerCase()
        && String(p.supplierTin || '').trim() === trimmedTin
        && String(p.id) !== String(purchaseData.id)
      );
      if (duplicate) {
        alert(`Duplicate invoice: Invoice #${trimmedInvoice} is already recorded for supplier TIN ${trimmedTin}. Please verify the invoice number before saving.`);
        return;
      }
    }

    // Persist the purchase directly to the normalized `purchases` table.
    // Do not rebuild the whole Client aggregate from the currently loaded page/list;
    // that can overwrite transactions that are not present in the browser.
    const savingMulti = isOtherPayments && multipleEntries;
    if (!savingMulti) {
      await savePurchase(String(purchaseData.id), purchaseData);
    }

    // Other Payments multiple-entries mode: persist every filled row.
    if (savingMulti) {
      const validRows = multiEntries.filter(r => {
        const amt = parseFloat(String(r.amount || '').replace(/,/g, ''));
        return Boolean(String(r.supplierName || '').trim()) && Boolean(String(r.accountTitle || '').trim()) && Number.isFinite(amt) && amt > 0;
      });
      if (validRows.length === 0) {
        alert('At least one row needs a supplier name, account title, and amount.');
        return;
      }
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const rowId = `multi-${r.id}`;
        const amt = parseFloat(String(r.amount || '').replace(/,/g, '')) || 0;
        await savePurchase(rowId, {
          id: rowId,
          sequenceNumber: (editSequence || sequenceNumber) + i,
          datMonthYear: currentDat ? currentDat.formatted : `${MONTHS[parseInt(m) - 1]} ${y}`,
          date: r.date,
          paymentMethod: r.paymentMethod,
          bankName: r.paymentMethod === 'Check' ? r.bankName : null,
          checkNumber: r.paymentMethod === 'Check' ? r.checkNumber : null,
          invoiceNo: r.invoiceNo,
          supplierTin: r.supplierTin,
          supplierName: r.supplierName,
          supplierAddress: r.supplierAddress,
          amount: 0,
          vatType: 'non-vat',
          exemptAmount: amt,
          zeroRatedAmount: 0,
          withholdingOption: r.withholdingOption,
          atcCode: r.withholdingOption === 'with' ? r.atcCode : null,
          whtRate: r.withholdingOption === 'with' ? (ATC_SCHEDULE.find(e => e.code === r.atcCode)?.rate ?? null) : null,
          whtAmount: r.withholdingOption === 'with' ? r.whtAmount : 0,
          accountTitle: r.accountTitle,
          transactionDetails: r.transactionDetails,
          inputTax: 0,
          otherPaymentEntries: [{ accountTitle: r.accountTitle, amount: amt }],
          attachment: null,
        });
      }
      showToast(`${validRows.length} entries added`);
      setMultiEntries([emptyMultiRow()]);
    } else {
      showToast(viewIndex !== null ? 'Entry updated' : 'Expense entry added');
    }

    // Embedded in the History edit modal: close immediately so the user sees
    // the refreshed row (the form does not need to be reset).
    if (embedded) { onSaved?.(); return; }

    // Reset the complete entry form after Add Entry / Update Entry.
    // A saved transaction remains in currentClient.purchases; the input form
    // must start clean so values from the previous transaction are not carried
    // into the next entry.
    setDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Cash');
    setBankName('');
    setCheckNumber('');
    setInvoiceNo('');
    setSupplierTin('');
    setSupplierName('');
    setSupplierAddress('');
    setAmount('');
    setNetAmount(0);
    setVatType('vat');
    setExemptAmount('');
    setZeroRatedAmount('');
    setWithholdingOption('w/o');
    setAtcCode('');
    setWhtAmount(0);
    setAccountTitle('');
    setOtherPaymentEntries([{ id: `e${Date.now()}-0`, accountTitle: '', amount: '' }]);
    setMultipleEntries(false);
    setMultiEntries([emptyMultiRow()]);
    setTransactionDetails('');
    setInputTax(0);
    setAttachment(null);
    setAttachmentBusy(false);

    // After adding/updating an entry, place the cursor back on Transaction Date
    // so the next transaction always starts from the first field.
    setTimeout(() => {
      transactionDateRef.current?.focus();
    }, 0);
  };

  const handleDelete = async (id: number) => {
    if (!canPurchaseAction('delete')) { showToast('Your profile does not have permission to delete purchases.'); return; }
    if (!currentClient || !currentClientId) return;
    try {
      await deletePurchase(String(id));
      showToast('Expense deleted');
    } catch (error) {
      console.error('Purchase delete failed:', error);
      showToast('Unable to delete expense');
    }
  };

  return (
    <div className="w-full flex flex-col purchase-page-shell">
      {!embedded && <PageHeader title={currentDat ? "Expense Data Entry Screen (DAT)" : "Expense Data Entry Screen"} icon={<ShoppingCart className="w-5 h-5 text-amber-500" />} />}
      <div className="p-4 md:p-6 flex-1">

      {!embedded && (
      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-sm">
        {hasPermission(modulePermissionKey('purchases')) && hasPermission(actionPermissionKey('purchases', 'view')) && <button type="button" onClick={() => navigate('/purchases/invoiced')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-xl text-sm font-bold transition-all ${!isOtherPayments && !isAP ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Invoiced</button>}
        {canViewOtherPayments && <button type="button" onClick={() => navigate('/purchases/other-payments')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-xl text-sm font-bold transition-all ${isOtherPayments ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Other Payments</button>}
        {canViewAp && <button type="button" onClick={() => navigate('/purchases/ap')} className={`flex-1 min-w-[140px] px-4 py-3 rounded-xl text-sm font-bold transition-all ${isAP ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Accounts Payable (AP)</button>}
      </div>
      )}

      {!embedded && (
      <div className="mb-4 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {isAP ? 'Accounts Payable (AP)' : isOtherPayments ? 'Other Payments' : 'Invoiced'}
      </div>
      )}

      {isAP && apAging && (
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">AP Aging — {apAging.count} unpaid bill{apAging.count === 1 ? '' : 's'} · Total {formatMoney(apAging.total)}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {apAging.buckets.map((b, i) => (
              <div key={b.label} className={`rounded-xl border p-3 ${i === 3 ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20' : i === 2 ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{b.label} <span className="font-normal">({b.count})</span></div>
                <div className={`text-sm font-extrabold mt-1 tabular-nums ${i === 3 ? 'text-rose-600 dark:text-rose-400' : i === 2 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatMoney(b.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 relative">
        <div className="lg:col-span-3 pb-2 mb-2 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-4 justify-between">
            <div className="w-full md:w-1/3">
              <label className="form-label text-red-500">Transaction Date *</label>
              <input 
                ref={transactionDateRef}
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                min={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-01` : undefined}
                max={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-${String(new Date(currentDat.year, currentDat.month, 0).getDate()).padStart(2, '0')}` : undefined}
                className="form-input" 
              />
              {dateWarning && <p className="text-xs text-amber-600 bg-amber-100 p-2 mt-1 rounded-lg">{dateWarning}</p>}
            </div>
            
            {!isAP && (
              <div className="w-full md:w-2/3 flex flex-col justify-end">
                <label className="form-label">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="form-input" disabled={paymentMethodOptions.length === 0}>
                  {paymentMethodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            )}
        </div>

        {!isAP && paymentMethod === 'Check' && (
          <>
            <div className="lg:col-span-1">
              <label className="form-label text-red-500">Bank Name *</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)} className="form-input bg-amber-50 dark:bg-amber-900/10 border-amber-200">
                <option value="">Select Bank...</option>
                <option value="BDO">BDO</option>
                <option value="BPI">BPI</option>
                <option value="Metrobank">Metrobank</option>
                <option value="Security Bank">Security Bank</option>
                <option value="RCBC">RCBC</option>
                <option value="UnionBank">UnionBank</option>
                <option value="PNB">PNB</option>
                <option value="Chinabank">Chinabank</option>
                <option value="EastWest">EastWest</option>
                <option value="AUB">AUB</option>
                <option value="Others">Others</option>
              </select>
            </div>
            <div className="lg:col-span-2">
               <label className="form-label text-red-500">Check Number *</label>
               <input type="text" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="000123" className="form-input bg-amber-50 dark:bg-amber-900/10 border-amber-200" />
            </div>
          </>
        )}

        {!isOtherPayments && <div>
           <label className="form-label text-red-500">Invoice # *</label>
           <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Supplier Invoice" className="form-input" />
        </div>}
        
        {!isOtherPayments && <div className="relative">
          <label className="form-label text-red-500">Supplier TIN *</label>
          <input 
            type="text" 
            value={supplierTin} 
            onChange={e => setSupplierTin(formatTIN(e.target.value))} 
            placeholder="000-000-000" 
            className="form-input font-mono" 
            maxLength={11}
          />
           {autoLoadMsg && (
            <span className="absolute top-8 right-3 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-1 rounded">
              {autoLoadMsg}
            </span>
          )}
        </div>}

        <div>
          <label className="form-label text-red-500">Supplier Name *</label>
          <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier Full Name" className="form-input" />
        </div>

        {!isOtherPayments && <div className="lg:col-span-2">
          <label className="form-label">Supplier Address</label>
          <input type="text" value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Street, City, Province" className="form-input" />
        </div>}

        {!isOtherPayments && <div>
           <label className="form-label text-red-500">VAT Type *</label>
           <select value={vatType} onChange={e => setVatType(e.target.value)} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
             <option value="vat">VAT</option>
             <option value="non-vat">Non-VAT</option>
             <option value="vat-nonvat">VAT &amp; Non-VAT</option>
             <option value="zero-rated">0-Rated</option>
           </select>
        </div>}

        {!isOtherPayments && <div>
           <label className="form-label text-red-500">Withholding Tax *</label>
           <select value={withholdingOption} onChange={e => setWithholdingOption(e.target.value as 'w/o' | 'with')} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
             <option value="w/o">W/O Withholdings</option>
             <option value="with">With Withholdings</option>
           </select>
        </div>}

        {!isOtherPayments && withholdingOption === 'with' && (
          <div className="lg:col-span-2">
            <label className="form-label text-red-500">ATC / Nature of Income Payment *</label>
            <select value={atcCode} onChange={e => setAtcCode(e.target.value)} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
              {ATC_SCHEDULE.map(entry => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.nature}{entry.qualifier ? ` (${entry.qualifier})` : ''} — {entry.rateLabel} [{entry.party}]
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Rates per the BIR Schedule of Alphanumeric Tax Codes (ATC).</p>
          </div>
        )}

        {!isOtherPayments && withholdingOption === 'with' && (
          <div>
            <label className="form-label text-slate-500">Withholding Tax (₱)</label>
            <input type="text" readOnly value={whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed" />
          </div>
        )}

        {!isOtherPayments && (vatType === 'non-vat' || vatType === 'vat-nonvat') && (
          <div>
            <label className="form-label text-red-500">Exempt (₱) *</label>
            <input type="text" value={exemptAmount} onChange={e => /^[0-9.,]*$/.test(e.target.value) && setExemptAmount(e.target.value)} onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) setExemptAmount(parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }} placeholder="0.00" className="form-input font-bold text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-100" />
          </div>
        )}

        {!isOtherPayments && vatType === 'zero-rated' && (
          <div>
            <label className="form-label text-red-500">0-Rated (₱) *</label>
            <input type="text" value={zeroRatedAmount} onChange={e => /^[0-9.,]*$/.test(e.target.value) && setZeroRatedAmount(e.target.value)} onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) setZeroRatedAmount(parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }} placeholder="0.00" className="form-input font-bold text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-100" />
          </div>
        )}

        {!isOtherPayments && (vatType === 'vat' || vatType === 'vat-nonvat') && (
          <>
            {vatType !== 'non-vat' && <div>
              <label className="form-label text-red-500">Gross Amount (₱) *</label>
              <input type="text" value={amount} onChange={e => /^[0-9.,]*$/.test(e.target.value) && setAmount(e.target.value)} onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) setAmount(parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }} placeholder="0.00" className="form-input font-bold text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-100" />
            </div>}
            {vatType !== 'non-vat' && <>
            <div>
              <label className="form-label text-slate-500">Net Amount (₱)</label>
              <input type="text" readOnly value={netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed" />
            </div>
            <div>
              <label className="form-label text-slate-500">Input Tax (₱)</label>
              <input type="text" readOnly value={inputTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 font-bold cursor-not-allowed" />
            </div>
            </>}
          </>
        )}

        {isOtherPayments && (
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="form-label text-red-500 mb-0">Line Items — Account &amp; Amount *</label>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Total: ₱{otherPaymentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="space-y-2">
              {otherPaymentEntries.map((entry, idx) => (
                <div key={entry.id} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Combobox
                      value={entry.accountTitle}
                      onChange={v => updateOtherPaymentEntry(entry.id, 'accountTitle', v)}
                      options={coaAccounts.map(a => ({ id: a.id, label: a.name }))}
                      placeholder={`Account #${idx + 1}`}
                      inputClassName="form-input bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 font-bold text-blue-800 dark:text-blue-300 !py-2 text-sm"
                    />
                  </div>
                  <div className="w-36 shrink-0">
                    <input
                      type="text"
                      value={entry.amount}
                      onChange={e => { if (/^[0-9.,]*$/.test(e.target.value)) updateOtherPaymentEntry(entry.id, 'amount', e.target.value); }}
                      onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) updateOtherPaymentEntry(entry.id, 'amount', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                      placeholder="0.00"
                      className="form-input font-bold text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-100 !py-2 text-sm text-right"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOtherPaymentEntry(entry.id)}
                    disabled={otherPaymentEntries.length <= 1}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                    title="Remove line item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOtherPaymentEntry}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Line Item
            </button>
          </div>
        )}
        {!isOtherPayments && (<div className="lg:col-span-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="form-label">{currentDat ? "Account Title" : "Payment for"}</label>
            {!currentDat && (
              <div className="flex items-center gap-1 mb-1.5">
                {hasPermission(modulePermissionKey('coa')) && hasPermission(actionPermissionKey('coa', 'add')) && <button type="button" onClick={() => setShowAddPaymentAccount(v => !v)} className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors" title="Add a new account">
                  <Plus className="w-3.5 h-3.5" />
                </button>}
              </div>
            )}
          </div>
          <Combobox
            value={accountTitle}
            onChange={setAccountTitle}
            options={coaAccounts.map(a => ({ id: a.id, label: a.name }))}
            placeholder="Type or choose an account..."
            inputClassName="form-input bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 font-bold text-blue-800 dark:text-blue-300"
          />
          {showAddPaymentAccount && (
            <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">New Account Name</label>
                <input type="text" value={newPaymentAccountName} onChange={e => setNewPaymentAccountName(e.target.value)} placeholder="e.g. Office Supplies Expense" className="form-input" />
              </div>
              <div className="sm:w-40">
                <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Type</label>
                <select value={newPaymentAccountType} onChange={e => setNewPaymentAccountType(e.target.value as 'Asset' | 'Costs' | 'Expense')} className="form-input">
                  <option value="Asset">Asset</option><option value="Costs">Costs</option><option value="Expense">Expense</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleAddPaymentAccount} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm">Add</button>
                <button type="button" onClick={() => { setShowAddPaymentAccount(false); setNewPaymentAccountName(''); }} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold px-3 py-2.5 rounded-xl transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>)}

        <div className="lg:col-span-1 md:col-span-2">
          <label className="form-label flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> Attachment</label>
          <div className="flex items-center gap-2">
            <label className={`flex-1 cursor-pointer form-input flex items-center gap-2 ${attachmentBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              {attachmentBusy ? <Upload className="w-4 h-4 animate-pulse" /> : attachment?.type.startsWith('image/') ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              <span className="truncate text-xs">{attachmentBusy ? 'Optimizing...' : attachment ? attachment.name : 'Upload image or PDF'}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" disabled={attachmentBusy} onChange={async e => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { alert('Please upload an image or PDF file.'); return; }
                setAttachmentBusy(true);
                try { setAttachment(await prepareAttachment(file)); showToast('Attachment optimized and saved with the expense.'); }
                catch { alert('The attachment could not be processed. Please try another file.'); }
                finally { setAttachmentBusy(false); }
              }} />
            </label>
            {attachment && <button type="button" onClick={() => setAttachment(null)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Remove attachment"><X className="w-4 h-4" /></button>}
          </div>
          {attachment && <p className="text-[10px] text-slate-400 mt-1">{(attachment.compressedSize / 1024).toFixed(1)} KB stored · original {(attachment.size / 1024).toFixed(1)} KB</p>}
        </div>

        <div className="lg:col-span-3">
          <label className="form-label">Transaction Details</label>
          <input 
            type="text" 
            value={transactionDetails} 
            onChange={e => setTransactionDetails(e.target.value)} 
            placeholder="Enter additional details about this transaction..." 
            className="form-input" 
          />
        </div>

        {isOtherPayments && (
          <div className="lg:col-span-3">
            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={multipleEntries}
                onChange={e => { setMultipleEntries(e.target.checked); if (e.target.checked) setMultiEntries([emptyMultiRow()]); }}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Multiple Entries</span>
              <span className="text-xs text-slate-400">— fill multiple rows and save all at once</span>
            </label>

            {multipleEntries && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase tracking-wide">
                        <th className="px-2 py-2 text-left font-bold">#</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[110px]">Date</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[160px]">Supplier *</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[120px]">TIN</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[110px]">Invoice #</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[110px]">Payment</th>
                        <th className="px-2 py-2 text-left font-bold min-w-[180px]">Account Title *</th>
                        <th className="px-2 py-2 text-right font-bold min-w-[110px]">Amount (₱) *</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiEntries.map((row, idx) => (
                        <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-1.5 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <input type="date" value={row.date} onChange={e => updateMultiRow(row.id, 'date', e.target.value)} className="form-input !py-1 !text-xs !px-2" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={row.supplierName} onChange={e => updateMultiRow(row.id, 'supplierName', e.target.value)} placeholder="Supplier name" className="form-input !py-1 !text-xs !px-2" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={row.supplierTin} onChange={e => updateMultiRow(row.id, 'supplierTin', e.target.value)} placeholder="TIN" className="form-input !py-1 !text-xs !px-2" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={row.invoiceNo} onChange={e => updateMultiRow(row.id, 'invoiceNo', e.target.value)} placeholder="Invoice #" className="form-input !py-1 !text-xs !px-2" />
                          </td>
                          <td className="px-2 py-1.5">
                            <select value={row.paymentMethod} onChange={e => updateMultiRow(row.id, 'paymentMethod', e.target.value)} className="form-input !py-1 !text-xs !px-2">
                              <option>Cash</option><option>Check</option><option>Bank Transfer</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Combobox
                              value={row.accountTitle}
                              onChange={v => updateMultiRow(row.id, 'accountTitle', v)}
                              options={coaAccounts.map(a => ({ id: a.id, label: a.name }))}
                              placeholder="Account"
                              inputClassName="form-input !py-1 !text-xs !px-2 min-w-[160px]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={row.amount} onChange={e => { if (/^[0-9.,]*$/.test(e.target.value)) updateMultiRow(row.id, 'amount', e.target.value); }} onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) updateMultiRow(row.id, 'amount', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }} placeholder="0.00" className="form-input !py-1 !text-xs !px-2 text-right font-bold text-amber-800 dark:text-amber-300" />
                          </td>
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => removeMultiRow(row.id)} disabled={multiEntries.length <= 1} className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-30" title="Remove row">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                  <button type="button" onClick={addMultiRow} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {multiEntries.length} {multiEntries.length === 1 ? 'entry' : 'entries'} · Total ₱{multiEntries.reduce((s, r) => s + (parseFloat(String(r.amount || '').replace(/,/g, '')) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="lg:col-span-3 flex justify-end items-center mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
           <div className="flex gap-3">
             {viewIndex !== null && !embedded && canPurchaseAction('delete') && (
               <button 
                 onClick={() => {
                   if (confirm('Are you sure you want to delete this entry?')) {
                     handleDelete(periodPurchases[viewIndex].id);
                     handleAddNew();
                   }
                 }}
                 className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 border border-red-200"
               >
                 <Trash2 className="w-5 h-5" /> Delete
               </button>
             )}
             {embedded && (
               <button type="button" onClick={onClose} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                 Cancel
               </button>
             )}
             {canPurchaseAction(viewIndex !== null ? 'edit' : 'add') && <button onClick={handleAddPurchase} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-8 py-2.5 rounded-xl transition-colors shadow-sm shadow-amber-500/20 flex items-center gap-2">
               <Plus className="w-5 h-5" /> {viewIndex !== null ? 'Update Entry' : (isOtherPayments && multipleEntries ? 'Add Entries' : 'Add Entry')}
             </button>}
           </div>
        </div>
      </div>

      </div>
    </div>
  );
}