/**
 * PharmacyPos — Cashier Point-of-Sale (dev-only page, route `/pos`).
 *
 * Scope (per product request):
 *  - Cashier sales interface: product search (name, generic, brand, SKU,
 *    barcode), availability / price / unit display, one-click add to cart,
 *    quantity entry/edit, multiple lines, remove, running totals.
 *  - Scanning: USB/Bluetooth wedge scanners type into the search box; the
 *    optional camera scanner uses the native BarcodeDetector (Android devices).
 *  - Senior Citizen & PWD discount workflow: 20% discount, customer ID
 *    reference capture, transaction-level discount record, VAT-exempt treatment.
 *  - Multi-unit conversion: Box, Blister, Strip, Tablet, Capsule, Bottle,
 *    Piece and more; each product carries conversion factors; stock stays in
 *    the base inventory unit.
 *  - Payment recording (cash/check/card/e-wallet/bank/on account), change due,
 *    printable receipt, sales history, void & refund workflows.
 *  - Cashier shift open/close with cash accountability and sales summaries.
 *  - Offline-first (PWA): catalogue cached in IndexedDB, offline search/scan,
 *    queued transactions, auto-flush on reconnect, duplicate-protected sync,
 *    stock-conflict reporting.
 *  - Accounting integration: completed sales mirror to the `sales` register;
 *    outbound movements record COGS and decrement base-unit stock.
 *
 * Final discount rates, VAT treatment and account mappings are configurable in
 * src/lib/pos/tax.ts / the pharmacy's approved chart of accounts before launch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanBarcode, Search, Camera, Trash2, Plus, Minus, Receipt as ReceiptIcon,
  Wallet, Printer, Wifi, WifiOff, AlertTriangle, Clock, Percent,
  UserCheck, Undo2, RotateCcw, ShoppingCart, CircleDollarSign, PackageSearch,
} from 'lucide-react';
import type { InventoryItem } from '../../types';
import { PageHeader } from '../ui/PageHeader';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAccounting } from '../../context/AccountingContext';
import { useAuth } from '../../context/AuthContext';
import { onConnectivityChange } from '../../lib/offlineQueue';
import type {
  PosCatalogItem, PosCustomerType, PosLine, PosPaymentMethod, PosShift, PosTransaction, PosVatType,
} from '../../lib/pos/types';
import { toCatalogItem, POS_PAYMENT_METHODS } from '../../lib/pos/types';
import { SELLING_UNITS, factorFor, priceFor, baseQuantity, sellingUnitLabel } from '../../lib/pos/units';
import { computeSaleTotals, discountRateFor, peso, POS_CONFIG } from '../../lib/pos/tax';
import {
  syncCatalogCache, searchCachedCatalog, putLocalTransaction, getLocalTransactions,
  countPending, nextReceiptSequence, buildReceiptNo,
  putLocalShift, getOpenLocalShift, listLocalShifts,
} from '../../lib/pos/posDb';
import {
  posIsOnline, pushTransaction, pushTransactionRecord, flushPendingTransactions,
  pullServerTransactions, pushShift, pullServerShifts, postReversal,
  type PosAccountingDeps,
} from '../../lib/pos/posSync';
import { PosCameraScanner } from './PosCameraScanner';
import { ReceiptPrint, type PosBusinessInfo } from './ReceiptPrint';

type PosTab = 'sale' | 'history' | 'shifts' | 'queue';

const round2 = (n: number) => Math.round(n * 100) / 100;

const EMPTY_TOTALS = {
  sales: 0, items: 0, gross: 0, discount: 0, net: 0, vat: 0,
  cash: 0, check: 0, card: 0, ewallet: 0, bank: 0, account: 0,
  voids: 0, refunds: 0, refundedAmount: 0,
};

const ID_TYPE_OPTIONS = [
  'Senior Citizen ID',
  'PWD ID',
  'Philippine National ID',
  'Driver’s License',
  'Passport',
  'Other',
];

/** Base unit names (inventory) that map directly onto a selling-unit id. */
const BASE_TO_SELLING: Record<string, string> = {
  tablet: 'tablet', capsule: 'capsule', piece: 'piece', bottle: 'bottle',
  strip: 'strip', blister: 'blister', box: 'box', sachet: 'sachet', tube: 'tube',
  vial: 'vial', ampule: 'ampule', pair: 'pair',
};

function defaultSellingUnit(item: PosCatalogItem): string {
  return BASE_TO_SELLING[item.baseUnit] || 'piece';
}

function aggregateTotals(txs: PosTransaction[]) {
  const t = { ...EMPTY_TOTALS };
  for (const tx of txs) {
    if (tx.status === 'completed') {
      t.sales += 1;
      t.items += tx.lines.reduce((s, l) => s + l.qty, 0);
      t.gross += tx.gross;
      t.discount += tx.discountAmount;
      t.net += tx.net;
      t.vat += tx.vatAmount;
      switch (tx.paymentMethod) {
        case 'Cash': t.cash += tx.net; break;
        case 'Check': t.check += tx.net; break;
        case 'Credit Card': t.card += tx.net; break;
        case 'E-Wallet': t.ewallet += tx.net; break;
        case 'Bank Transfer': t.bank += tx.net; break;
        case 'On Account': t.account += tx.net; break;
      }
    } else if (tx.status === 'voided') {
      t.voids += 1;
    } else if (tx.status === 'refunded') {
      t.refunds += 1;
      t.refundedAmount += tx.net;
    }
  }
  return t;
}

export default function PharmacyPos() {
  const {
    currentClient, currentClientId,
    saveSale, saveInventoryItem, saveInventoryMovement, showToast,
  } = useAccounting();
  const { user, isAdmin } = useAuth();

  const inventoryItems: InventoryItem[] = useMemo(
    () => currentClient?.inventoryItems || [],
    [currentClient],
  );

  // ------------------------------------------------------------------ state
  const [tab, setTab] = useState<PosTab>('sale');
  const [online, setOnline] = useState(posIsOnline());
  const [busy, setBusy] = useState(false);

  // Catalogue / search
  const liveCatalog = useMemo(
    () => inventoryItems.map((i) => toCatalogItem(i, currentClientId)),
    [inventoryItems, currentClientId],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosCatalogItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Cart
  const [cart, setCart] = useState<PosLine[]>([]);

  // Customer / discount
  const [customerType, setCustomerType] = useState<PosCustomerType>('regular');
  const [customerName, setCustomerName] = useState('');
  const [customerIdType, setCustomerIdType] = useState('');
  const [customerIdNo, setCustomerIdNo] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [vatType, setVatType] = useState<PosVatType>(POS_CONFIG.defaultVatType);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('Cash');
  const [tendered, setTendered] = useState('');

  // History / shifts / queue
  const [txList, setTxList] = useState<PosTransaction[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [shift, setShift] = useState<PosShift | null>(null);
  const [shiftHistory, setShiftHistory] = useState<PosShift[]>([]);

  // Modals
  const [receiptTx, setReceiptTx] = useState<PosTransaction | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ tx: PosTransaction; kind: 'void' | 'refund' } | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [openShiftCash, setOpenShiftCash] = useState('0');
  const [closeShiftCash, setCloseShiftCash] = useState('');
  const [shiftModal, setShiftModal] = useState<'open' | 'close' | null>(null);

  const deps: PosAccountingDeps = useMemo(
    () => ({ currentClientId, inventoryItems, saveSale, saveInventoryItem, saveInventoryMovement }),
    [currentClientId, inventoryItems, saveSale, saveInventoryItem, saveInventoryMovement],
  );

  const business: PosBusinessInfo = useMemo(() => ({
    name: currentClient?.registeredName || currentClient?.tradeName || currentClient?.name || 'CAPOTBOOKS Pharmacy',
    tin: currentClient?.tin || '',
    address: [currentClient?.substreet, currentClient?.street, currentClient?.barangay, currentClient?.city, currentClient?.zipCode]
      .filter(Boolean).join(', '),
  }), [currentClient]);

  // ------------------------------------------------------- catalogue caching
  useEffect(() => {
    void syncCatalogCache(currentClientId, liveCatalog);
  }, [liveCatalog, currentClientId]);

  // ------------------------------------------------------------- search logic
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!online) {
        const cached = await searchCachedCatalog(currentClientId, query);
        if (alive) setResults(cached);
        return;
      }
      const q = query.trim().toLowerCase();
      const barcodeHit = q
        ? liveCatalog.filter((i) => i.barcodes.some((b) => b.toLowerCase() === q))
        : [];
      const fuzzy = q
        ? liveCatalog.filter((i) => !barcodeHit.includes(i) && [i.name, i.genericName, i.brandName, i.sku, i.code]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
        : liveCatalog;
      if (alive) setResults([...barcodeHit, ...fuzzy].slice(0, 40));
    })();
    return () => { alive = false; };
  }, [query, liveCatalog, online, currentClientId]);

  // ---------------------------------------------------------------- data load
  const reloadTransactions = useCallback(async () => {
    const local = await getLocalTransactions(currentClientId);
    let server: PosTransaction[] = [];
    if (posIsOnline()) server = await pullServerTransactions(currentClientId);
    const byId = new Map<string, PosTransaction>();
    [...server, ...local].forEach((t) => byId.set(t.id, t));
    setTxList([...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setQueueCount(await countPending(currentClientId));
  }, [currentClientId]);

  const reloadShifts = useCallback(async () => {
    const local = await listLocalShifts(currentClientId);
    let server: PosShift[] = [];
    if (posIsOnline()) server = await pullServerShifts(currentClientId);
    const byId = new Map<string, PosShift>();
    [...server, ...local].forEach((s) => byId.set(s.id, s));
    setShiftHistory([...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt)));
    const open = await getOpenLocalShift(currentClientId);
    setShift(open ?? null);
  }, [currentClientId]);

  useEffect(() => { void reloadTransactions(); }, [reloadTransactions]);
  useEffect(() => { void reloadShifts(); }, [reloadShifts]);

  // Connectivity: auto-flush the POS queue when back online.
  useEffect(() => {
    const handler = (isOnline: boolean) => {
      setOnline(isOnline);
      if (isOnline) {
        void flushPendingTransactions(deps).then((r) => {
          if (r.synced > 0) showToast(`POS queue: ${r.synced} sale(s) synchronized`);
          void reloadTransactions();
        });
      }
    };
    return onConnectivityChange(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, reloadTransactions]);

  // Autofocus the wedge-scanner search box.
  useEffect(() => {
    if (tab === 'sale') searchRef.current?.focus();
  }, [tab, cart.length]);

  // ------------------------------------------------------------- cart helpers
  const totals = useMemo(
    () => computeSaleTotals(cart, customerType, vatType),
    [cart, customerType, vatType],
  );

  const addToCart = (item: PosCatalogItem, unitOverride?: string) => {
    const unit = unitOverride || defaultSellingUnit(item);
    const factor = factorFor(item, unit, item.packSize);
    const price = priceFor(item, unit, item.packSize);
    if (item.stockLevel <= 0) {
      showToast(`${item.name} is out of stock.`);
      return;
    }
    if (factor > item.stockLevel) {
      showToast(`Only ${item.stockLevel} base unit(s) available for ${item.name}.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.itemId === item.id && l.sellingUnit === unit);
      if (idx >= 0) {
        const next = [...prev];
        const line = next[idx];
        const qty = line.qty + 1;
        const baseQty = baseQuantity(qty, factor);
        next[idx] = {
          ...line, qty, baseQty,
          grossLine: round2(qty * price), netLine: round2(qty * price),
          discountLine: 0, costTotal: round2(baseQty * item.costPrice),
        };
        return next;
      }
      return [...prev, {
        lineId: `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        itemId: item.id, name: item.name, genericName: item.genericName, brandName: item.brandName,
        sku: item.sku, code: item.code, barcode: item.barcodes[0],
        sellingUnit: unit, unitFactor: factor, qty: 1, baseQty: factor,
        unitPrice: price, grossLine: price, discountLine: 0, netLine: price,
        costTotal: round2(factor * item.costPrice), vatType: 'VAT Exempt', stockOnAdd: item.stockLevel,
      }];
    });
    setQuery('');
  };

  const changeLineUnit = (lineId: string, unit: string) => {
    setCart((prev) => prev.map((line) => {
      if (line.lineId !== lineId) return line;
      const item = liveCatalog.find((i) => i.id === line.itemId);
      const factor = item ? factorFor(item, unit, item.packSize) : line.unitFactor;
      const price = item ? priceFor(item, unit, item.packSize) : line.unitPrice;
      const baseQty = baseQuantity(line.qty, factor);
      return {
        ...line, sellingUnit: unit, unitFactor: factor, unitPrice: price, baseQty,
        grossLine: round2(line.qty * price), netLine: round2(line.qty * price),
        costTotal: round2(baseQty * (item?.costPrice || 0)),
      };
    }));
  };

  const changeLineQty = (lineId: string, delta: number) => {
    setCart((prev) => prev.map((line) => {
      if (line.lineId !== lineId) return line;
      const qty = Math.max(1, line.qty + delta);
      const baseQty = baseQuantity(qty, line.unitFactor);
      return {
        ...line, qty, baseQty,
        grossLine: round2(qty * line.unitPrice), netLine: round2(qty * line.unitPrice),
        costTotal: round2(baseQty * (line.costTotal / Math.max(1, line.baseQty || 1))),
      };
    }));
  };

  const removeLine = (lineId: string) => setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const resetCart = () => {
    setCart([]);
    setCustomerType('regular');
    setCustomerName(''); setCustomerIdType(''); setCustomerIdNo(''); setCustomerTin(''); setCustomerAddress('');
    setVatType(POS_CONFIG.defaultVatType);
    setPaymentMethod('Cash'); setTendered('');
  };

  const handleScanCode = (code: string) => {
    setQuery(code);
    const hit = liveCatalog.find((i) => i.barcodes.some((b) => b.toLowerCase() === code.toLowerCase()));
    if (hit) addToCart(hit);
  };

  // ------------------------------------------------------------- payment flow
  const tenderedNum = Number(tendered) || 0;
  const changeDue = paymentMethod === 'Cash' ? round2(tenderedNum - totals.net) : 0;
  const canCharge = totals.net > 0
    && (paymentMethod !== 'Cash' || tenderedNum >= totals.net)
    && (customerType === 'regular' || Boolean(customerIdNo.trim()));

  const handleCharge = async () => {
    if (!canCharge || busy) return;
    if (customerType !== 'regular' && !customerIdNo.trim()) {
      showToast('Enter the Senior Citizen / PWD ID number for the discount record.');
      return;
    }
    setBusy(true);
    try {
      const seq = await nextReceiptSequence(currentClientId);
      const tx: PosTransaction = {
        id: crypto.randomUUID(),
        clientId: currentClientId,
        receiptNo: buildReceiptNo(seq),
        cashier: user?.user_metadata?.full_name || user?.email || 'cashier',
        shiftId: shift?.id || null,
        status: 'completed',
        customer: {
          type: customerType,
          name: customerName.trim() || undefined,
          idType: customerIdType || undefined,
          idNo: customerIdNo.trim() || undefined,
          tin: customerTin.trim() || undefined,
          address: customerAddress.trim() || undefined,
        },
        discountRate: totals.discountRate,
        discountAmount: totals.discountAmount,
        discountSenior: totals.discountSenior,
        discountPwd: totals.discountPwd,
        gross: totals.gross,
        vatAmount: totals.vatAmount,
        exemptAmount: totals.exemptAmount,
        net: totals.net,
        vatType: totals.vatType,
        paymentMethod,
        tendered: paymentMethod === 'Cash' ? tenderedNum : totals.net,
        change: changeDue,
        lines: totals.lines,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      };
      await putLocalTransaction(tx);
      let pushed = tx;
      if (posIsOnline()) {
        pushed = await pushTransaction(tx, deps);
        await putLocalTransaction(pushed);
      }
      await reloadTransactions();
      setReceiptTx(pushed);
      resetCart();
      showToast(pushed.syncStatus === 'synced' ? `Sale ${pushed.receiptNo} recorded` : `Sale ${pushed.receiptNo} queued offline`);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------- void / refund flow
  const applyAdjustment = async () => {
    if (!adjustTarget || busy) return;
    if (!adjustReason.trim()) { showToast('Enter a reason for the void/refund.'); return; }
    setBusy(true);
    try {
      const { tx, kind } = adjustTarget;
      const updated: PosTransaction = {
        ...tx,
        status: kind === 'void' ? 'voided' : 'refunded',
        voidReason: kind === 'void' ? adjustReason.trim() : undefined,
        refundReason: kind === 'refund' ? adjustReason.trim() : undefined,
        reversalKind: kind,
        reversalReason: adjustReason.trim(),
        originalSnapshot: tx,
        syncStatus: 'pending',
      };
      await putLocalTransaction(updated);
      if (posIsOnline()) {
        try {
          await postReversal(tx, kind, adjustReason.trim(), deps);
          await pushTransactionRecord(updated);
          updated.syncStatus = 'synced';
          await putLocalTransaction(updated);
        } catch (e: any) {
          console.warn('Reversal deferred:', e);
        }
      }
      setAdjustTarget(null);
      setAdjustReason('');
      await reloadTransactions();
      showToast(kind === 'void' ? 'Sale voided; stock restored.' : 'Refund recorded; stock restored.');
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- shift flow
  const openShift = async () => {
    const opening = Number(openShiftCash) || 0;
    const s: PosShift = {
      id: `shift_${Date.now()}`,
      clientId: currentClientId,
      cashier: user?.email || 'cashier',
      status: 'open',
      openedAt: new Date().toISOString(),
      openingCash: opening,
      totals: { ...EMPTY_TOTALS },
    };
    await putLocalShift(s);
    await pushShift(s);
    setShift(s);
    setShiftModal(null);
    await reloadShifts();
    showToast('Cashier shift opened.');
  };

  const closeShift = async () => {
    if (!shift) return;
    const related = txList.filter((t) => t.shiftId === shift.id);
    const totalsAll = aggregateTotals(related);
    const expected = round2(shift.openingCash + totalsAll.cash - totalsAll.refundedAmount);
    const actual = Number(closeShiftCash) || 0;
    const closed: PosShift = {
      ...shift,
      status: 'closed',
      closedAt: new Date().toISOString(),
      expectedCash: expected,
      actualCash: actual,
      cashVariance: round2(actual - expected),
      totals: totalsAll,
    };
    await putLocalShift(closed);
    await pushShift(closed);
    setShift(null);
    setShiftModal(null);
    setCloseShiftCash('');
    await reloadShifts();
    showToast('Shift closed.');
  };

  const retryQueue = async () => {
    setBusy(true);
    try {
      const r = await flushPendingTransactions(deps);
      await reloadTransactions();
      showToast(r.failed === 0 ? `Queue flushed: ${r.synced} sale(s) synced.` : `${r.synced} synced, ${r.failed} still pending.`);
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ render
  if (!isAdmin) {
    return (
      <div className="mt-8 card-surface p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-3" />
        <h2 className="font-bold text-lg">Pharmacy POS is in developer preview</h2>
        <p className="text-sm text-slate-500 mt-2">This module is currently available to the developer account only. Request it from the account owner when it should be enabled for your users.</p>
      </div>
    );
  }

  const shiftTx = shift ? txList.filter((t) => t.shiftId === shift.id) : [];
  const shiftTotals = aggregateTotals(shiftTx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy POS"
        icon={<ScanBarcode className="w-5 h-5 text-emerald-600" />}
        badge={
          <span className={`ml-2 inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 ${online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40'}`}>
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? 'Online' : 'Offline — queuing locally'}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {queueCount > 0 && (
              <Button size="sm" variant="outline" onClick={retryQueue} loading={busy}>
                <RotateCcw className="w-3.5 h-3.5" /> {queueCount} queued
              </Button>
            )}
            {shift ? (
              <Button size="sm" variant="outline" onClick={() => setShiftModal('close')}>
                <Clock className="w-3.5 h-3.5" /> Close shift ({peso(shift.openingCash)})
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setShiftModal('open')}>
                <Clock className="w-3.5 h-3.5" /> Open shift
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {([
          { id: 'sale', label: 'Register', icon: ShoppingCart },
          { id: 'history', label: 'Sales History', icon: ReceiptIcon },
          { id: 'shifts', label: 'Shifts', icon: Clock },
          { id: 'queue', label: `Offline Queue${queueCount ? ` (${queueCount})` : ''}`, icon: WifiOff },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'sale' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: search + catalogue */}
          <div className="lg:col-span-4 card-surface p-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const hit = results.find((i) => i.barcodes.some((b) => b.toLowerCase() === query.trim().toLowerCase()));
                    if (hit) addToCart(hit);
                  }
                }}
                placeholder="Scan barcode or search name / generic / brand / SKU…"
                className="w-full pl-9 pr-16 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => setCameraOpen((v) => !v)}
                title="Camera barcode scanner"
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition ${cameraOpen ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-emerald-600'}`}
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            {cameraOpen && <PosCameraScanner onCode={handleScanCode} onClose={() => setCameraOpen(false)} />}
            <p className="text-[11px] text-slate-400">USB/Bluetooth wedge scanners: focus this box and scan — codes are entered like keyboard input.</p>

            <div className="flex-1 overflow-y-auto max-h-[46vh] lg:max-h-[52vh] space-y-2 pr-1">
              {results.length === 0 && (
                <div className="text-center text-sm text-slate-400 py-8">
                  <PackageSearch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  {query ? 'No matching medicine or product.' : 'Products appear here from Inventory.'}
                </div>
              )}
              {results.map((item) => {
                const unit = defaultSellingUnit(item);
                const price = priceFor(item, unit, item.packSize);
                const out = item.stockLevel <= 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(item)}
                    className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                          {item.genericName || item.name}
                          {item.brandName && <span className="font-normal text-slate-500"> · {item.brandName}</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[item.sku, item.code, item.barcodes[0]].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-700">{peso(price)}</div>
                        <div className={`text-[11px] ${out ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                          {out ? 'Out of stock' : `${item.stockLevel} ${item.baseUnit} on hand`}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle: cart */}
          <div className="lg:col-span-5 card-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Current sale</h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-rose-600 hover:underline">Clear cart</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto max-h-[52vh] space-y-2">
              {cart.length === 0 && (
                <div className="text-center text-sm text-slate-400 py-10">Add products by scanning or searching. The cart supports multiple units and quantities.</div>
              )}
              {cart.map((line) => (
                <div key={line.lineId} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{line.genericName || line.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {[line.sku, line.barcode].filter(Boolean).join(' · ')} · {peso(line.unitPrice)} / {sellingUnitLabel(line.sellingUnit)}
                      </div>
                    </div>
                    <button onClick={() => removeLine(line.lineId)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={line.sellingUnit}
                      onChange={(e) => changeLineUnit(line.lineId, e.target.value)}
                      className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5"
                    >
                      {SELLING_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeLineQty(line.lineId, -1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"><Minus className="w-3.5 h-3.5" /></button>
                      <input
                        type="number" min={1} value={line.qty}
                        onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value) || 1);
                          setCart((prev) => prev.map((l) => {
                            if (l.lineId !== line.lineId) return l;
                            const baseQty = baseQuantity(q, l.unitFactor);
                            return { ...l, qty: q, baseQty, grossLine: round2(q * l.unitPrice), netLine: round2(q * l.unitPrice) };
                          }));
                        }}
                        className="w-14 text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5"
                      />
                      <button onClick={() => changeLineQty(line.lineId, 1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="ml-auto text-sm font-bold">{peso(line.netLine)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: customer + payment + totals */}
          <div className="lg:col-span-3 space-y-4">
            <div className="card-surface p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><UserCheck className="w-4 h-4" /> Customer & discount</h3>
              <div className="grid grid-cols-3 gap-1 text-xs font-bold">
                {([['regular', 'Regular'], ['senior', 'Senior Citizen'], ['pwd', 'PWD']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setCustomerType(v)}
                    className={`py-1.5 rounded-lg border transition ${customerType === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {customerType !== 'regular' && (
                <div className="space-y-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <Percent className="w-3.5 h-3.5" /> {discountRateFor(customerType) * 100}% discount · VAT-exempt sale
                  </div>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name (as on ID)" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2" />
                  <select value={customerIdType} onChange={(e) => setCustomerIdType(e.target.value)} className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2">
                    <option value="">ID type…</option>
                    {ID_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input value={customerIdNo} onChange={(e) => setCustomerIdNo(e.target.value)} placeholder="ID number (required)" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2" />
                  <input value={customerTin} onChange={(e) => setCustomerTin(e.target.value)} placeholder="TIN (optional)" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2" />
                  <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Address (optional)" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2" />
                </div>
              )}
              {customerType === 'regular' && (
                <select value={vatType} onChange={(e) => setVatType(e.target.value as PosVatType)} className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2">
                  <option value="VAT Exempt">VAT Exempt</option>
                  <option value="VATable">VATable (12% output tax)</option>
                  <option value="Zero-Rated">Zero-Rated</option>
                </select>
              )}
            </div>

            <div className="card-surface p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><Wallet className="w-4 h-4" /> Payment</h3>
              <div className="grid grid-cols-2 gap-1">
                {POS_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`text-xs font-bold py-2 rounded-lg border transition ${paymentMethod === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {paymentMethod === 'Cash' && (
                <div>
                  <label className="text-xs font-bold text-slate-500">Tendered</label>
                  <input
                    type="number" min={0} value={tendered} onChange={(e) => setTendered(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2"
                  />
                </div>
              )}
              <div className="space-y-1 text-sm border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                <div className="flex justify-between text-slate-500"><span>Gross</span><span>{peso(totals.gross)}</span></div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600"><span>Discount ({customerType === 'senior' ? 'SC' : 'PWD'} {discountRateFor(customerType) * 100}%)</span><span>−{peso(totals.discountAmount)}</span></div>
                )}
                {totals.vatAmount > 0 && <div className="flex justify-between text-slate-500"><span>Output VAT</span><span>{peso(totals.vatAmount)}</span></div>}
                {paymentMethod === 'Cash' && <div className="flex justify-between text-slate-500"><span>Change due</span><span>{peso(changeDue)}</span></div>}
                <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-slate-700"><span>Total due</span><span className="text-emerald-700">{peso(totals.net)}</span></div>
              </div>
              <Button fullWidth variant="success" size="lg" disabled={!canCharge || busy} loading={busy} onClick={handleCharge}>
                <CircleDollarSign className="w-5 h-5" /> Charge {peso(totals.net)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card-surface p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><ReceiptIcon className="w-4 h-4" /> Sales history</h3>
          {txList.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No POS transactions yet.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-3">Receipt</th><th className="pr-3">Date</th><th className="pr-3">Customer</th>
                  <th className="pr-3">Payment</th><th className="pr-3 text-right">Net</th><th className="pr-3">Status</th><th className="pr-3">Sync</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {txList.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono text-xs">{tx.receiptNo}</td>
                    <td className="pr-3 text-xs">{new Date(tx.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="pr-3 text-xs">
                      {tx.customer.name || (tx.customer.type === 'senior' ? 'Senior Citizen' : tx.customer.type === 'pwd' ? 'PWD' : 'Walk-in')}
                      {tx.discountAmount > 0 && <span className="ml-1 text-amber-600">−{peso(tx.discountAmount)}</span>}
                    </td>
                    <td className="pr-3 text-xs">{tx.paymentMethod}</td>
                    <td className="pr-3 text-right font-bold">{peso(tx.net)}</td>
                    <td className="pr-3">
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${tx.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : tx.status === 'voided' ? 'bg-slate-200 text-slate-600' : 'bg-rose-100 text-rose-700'}`}>
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="pr-3 text-xs">
                      {tx.syncStatus === 'synced' ? <span className="text-emerald-600">synced</span> : tx.syncStatus === 'conflict' ? <span className="text-rose-600" title={tx.conflict || tx.syncError}>conflict</span> : <span className="text-amber-600">queued</span>}
                    </td>
                    <td className="text-right space-x-1 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setReceiptTx(tx)}><Printer className="w-3.5 h-3.5" /> Receipt</Button>
                      {tx.status === 'completed' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setAdjustTarget({ tx, kind: 'void' }); setAdjustReason(''); }}><Undo2 className="w-3.5 h-3.5" /> Void</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAdjustTarget({ tx, kind: 'refund' }); setAdjustReason(''); }}><RotateCcw className="w-3.5 h-3.5" /> Refund</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'shifts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-surface p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Current shift</h3>
            {!shift && <p className="text-sm text-slate-400 py-4">No open shift. Open a shift with the opening cash count to start cashiering.</p>}
            {shift && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Opened</span><span>{new Date(shift.openedAt).toLocaleString('en-PH')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Opening cash</span><span className="font-bold">{peso(shift.openingCash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Sales</span><span>{shiftTotals.sales} transaction(s) · {shiftTotals.items} unit(s)</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Gross / Discount / Net</span><span>{peso(shiftTotals.gross)} / {peso(shiftTotals.discount)} / {peso(shiftTotals.net)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cash sales</span><span className="font-bold">{peso(shiftTotals.cash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Card / Check / E-wallet / Bank / On account</span>
                  <span>{[shiftTotals.card, shiftTotals.check, shiftTotals.ewallet, shiftTotals.bank, shiftTotals.account].map(peso).join(' · ')}</span>
                </div>
                <div className="flex justify-between"><span className="text-slate-500">Voids / Refunds</span><span>{shiftTotals.voids} / {shiftTotals.refunds} ({peso(shiftTotals.refundedAmount)})</span></div>
                <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-2"><span>Expected cash (opening + cash sales − refunds)</span><span>{peso(round2(shift.openingCash + shiftTotals.cash - shiftTotals.refundedAmount))}</span></div>
              </div>
            )}
          </div>
          <div className="card-surface p-4">
            <h3 className="font-bold text-sm mb-3">Shift history</h3>
            {shiftHistory.length === 0 && <p className="text-sm text-slate-400 py-4">No recorded shifts.</p>}
            <div className="space-y-2">
              {shiftHistory.map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>{new Date(s.openedAt).toLocaleDateString('en-PH')} · {s.cashier}</span>
                    <span className={s.status === 'open' ? 'text-emerald-600' : 'text-slate-500'}>{s.status.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                    <div>Opening {peso(s.openingCash)} · Sales {s.totals.sales} · Net {peso(s.totals.net)}</div>
                    {s.status === 'closed' && (
                      <div>Expected {peso(s.expectedCash || 0)} · Actual {peso(s.actualCash || 0)} · Variance <span className={s.cashVariance && s.cashVariance !== 0 ? 'text-rose-600 font-bold' : ''}>{peso(s.cashVariance || 0)}</span></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'queue' && (
        <div className="card-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2"><WifiOff className="w-4 h-4" /> Offline transaction queue</h3>
            <Button size="sm" variant="secondary" onClick={retryQueue} loading={busy}><RotateCcw className="w-3.5 h-3.5" /> Retry synchronization</Button>
          </div>
          <p className="text-xs text-slate-500">
            Sales made while disconnected are stored locally and automatically uploaded when connectivity returns. Each sale carries a unique idempotency key so a retry never posts a duplicate. Server-side stock is validated during synchronization; shortfalls are listed below as conflicts.
          </p>
          {queueCount === 0 && <p className="text-sm text-emerald-600 py-4 text-center">Queue empty — all POS sales are synchronized.</p>}
          <div className="space-y-2">
            {txList.filter((t) => t.syncStatus !== 'synced').map((tx) => (
              <div key={tx.id} className="rounded-xl border border-amber-200 dark:border-amber-900/40 p-3 text-sm">
                <div className="flex justify-between font-mono text-xs">
                  <span>{tx.receiptNo} · {tx.status}</span>
                  <span className={tx.syncStatus === 'conflict' ? 'text-rose-600 font-bold' : 'text-amber-600'}>{tx.syncStatus.toUpperCase()}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{peso(tx.net)} · {tx.paymentMethod} · {new Date(tx.createdAt).toLocaleString('en-PH')}</div>
                {(tx.conflict || tx.syncError) && <div className="text-xs text-rose-600 mt-1">{tx.conflict || tx.syncError}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receipt modal */}
      <Modal open={!!receiptTx} onClose={() => setReceiptTx(null)} title="Receipt" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReceiptTx(null)}>Close</Button>
            <Button variant="primary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print receipt</Button>
          </>
        }
      >
        {receiptTx && <ReceiptPrint tx={receiptTx} business={business} />}
      </Modal>

      {/* Void / refund modal */}
      <Modal open={!!adjustTarget} onClose={() => setAdjustTarget(null)} title={adjustTarget?.kind === 'void' ? 'Void transaction' : 'Refund transaction'} size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={applyAdjustment} loading={busy}>
              {adjustTarget?.kind === 'void' ? 'Void sale' : 'Process refund'}
            </Button>
          </>
        }
      >
        {adjustTarget && (
          <div className="space-y-3 text-sm">
            <p><span className="font-bold">{adjustTarget.tx.receiptNo}</span> · Net {peso(adjustTarget.tx.net)}</p>
            <p className="text-xs text-slate-500">Stock for this sale will be restored and a reversal recorded in the sales register (COGS reversed). Void/refund actions are stamped with the cashier and reason.</p>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              rows={3}
              placeholder="Reason (required) e.g. expired item, returned goods, wrong charge…"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
            />
          </div>
        )}
      </Modal>

      {/* Open shift modal */}
      <Modal open={shiftModal === 'open'} onClose={() => setShiftModal(null)} title="Open cashier shift" size="sm"
        footer={<><Button variant="outline" onClick={() => setShiftModal(null)}>Cancel</Button><Button variant="primary" onClick={openShift}>Open shift</Button></>}
      >
        <label className="text-xs font-bold text-slate-500">Opening cash (PHP)</label>
        <input type="number" min={0} value={openShiftCash} onChange={(e) => setOpenShiftCash(e.target.value)} className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
      </Modal>

      {/* Close shift modal */}
      <Modal open={shiftModal === 'close'} onClose={() => setShiftModal(null)} title="Close cashier shift" size="sm"
        footer={<><Button variant="outline" onClick={() => setShiftModal(null)}>Cancel</Button><Button variant="primary" onClick={closeShift}>Close shift</Button></>}
      >
        {shift && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Expected cash</span><span className="font-bold">{peso(round2(shift.openingCash + shiftTotals.cash - shiftTotals.refundedAmount))}</span></div>
            <div>
              <label className="text-xs font-bold text-slate-500">Actual cash counted (PHP)</label>
              <input type="number" min={0} value={closeShiftCash} onChange={(e) => setCloseShiftCash(e.target.value)} className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
            </div>
            {closeShiftCash !== '' && (
              <div className="flex justify-between font-bold">
                <span>Variance</span>
                <span className={Number(closeShiftCash) - round2(shift.openingCash + shiftTotals.cash - shiftTotals.refundedAmount) !== 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {peso(round2((Number(closeShiftCash) || 0) - (shift.openingCash + shiftTotals.cash - shiftTotals.refundedAmount)))}
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
