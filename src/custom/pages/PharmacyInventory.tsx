/**
 * PharmacyInventory.tsx — Pharmacy Product Management variant of the universal
 * Inventory page (fork; slot `page.inventory`, variant id `pharmacy-inventory`).
 *
 * Scope (per request):
 *  A. Product registration & maintenance — generic/brand names, strength, dosage,
 *     dosage form, SKU + barcode/QR assignment, search/filter, pricing/cost,
 *     unit configuration with pack→base conversion factors.
 *  B. Barcode/QR-assisted registration — USB/Bluetooth wedge scanners and an
 *     optional Android/device camera (BarcodeDetector); auto-captured codes,
 *     existing-product match + retrieval, new-product prefill, manual entry,
 *     multiple packaging identifiers, duplicate-registration guard. External
 *     drug-database lookup is NOT guaranteed (no external API call).
 *  C. Barcode/QR-assisted receiving — scan incoming stock, auto-match product,
 *     show current stock/units, received quantity, supplier, batch/lot no,
 *     expiry date, purchase cost, pack→base-unit conversion, posted to the
 *     product + lot record; manual product search when scanning unavailable.
 *
 * Data persistence:
 *  - Catalogue attributes live in inventory_items.custom_fields (JSONB) and go
 *    through the existing saveInventoryItem helper.
 *  - Lot/batch receiving records live in `pharmacy_stock_batches` (see
 *    scripts/pharmacy_inventory_migration.sql) and are read/written directly.
 *  - Stock movements reuse inventory_movements (type 'Receiving'); lot details
 *    are encoded in reference/notes.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAccounting } from '../../context/AccountingContext';
import {
  Pill, Plus, Search, Trash2, Edit3, CheckCircle, AlertTriangle, History,
  PackageCheck, PackageX, X, Camera, CameraOff, Truck, CalendarClock, ScanBarcode,
} from 'lucide-react';
import { InventoryItem, InventoryMovement, PharmacyStockBatch } from '../../types';
import { supabase } from '../../lib/supabase';
import { valuationReport, estimatedCogs } from '../../lib/inventoryValuation';

// ---------------------------------------------------------------------------
// Reference lists
// ---------------------------------------------------------------------------
const DRUG_CATEGORIES = [
  'Prescription (Rx)',
  'OTC Non-Rx',
  'Maintenance Medicine',
  'Vitamins & Supplements',
  'Personal Care & Hygiene',
  'Medical & Surgical Supplies',
  'Baby & Infant Care',
  'Diagnostic Device',
];

const DOSAGE_FORMS = [
  'Tablet', 'Chewable Tablet', 'Effervescent Tablet', 'Capsule', 'Softgel',
  'Oral Suspension', 'Oral Solution', 'Syrup', 'Lozenge', 'Powder for Reconstitution',
  'Sachet / Granules', 'Ointment', 'Cream', 'Gel', 'Lotion', 'Topical Spray',
  'Eye Drops', 'Ear Drops', 'Nasal Spray', 'Inhaler', 'Metered-Dose Inhaler',
  'Transdermal Patch', 'Suppository', 'Injection / Vial', 'Ampule', 'IV Bottle / Infusion',
  'Medical Supply',
];

const BASE_UNITS = [
  'tablet', 'capsule', 'softgel', 'lozenge', 'vial', 'ampule', 'bottle',
  'mL', 'sachet', 'strip', 'blister', 'tube', 'patch', 'piece', 'pair', 'bag',
];

const PACK_UNITS = [
  'box', 'bottle', 'jar', 'tube', 'blister strip', 'sachet carton',
  'vial pack', 'can', 'pouch', 'bag', 'pair',
];

const ROUTES = ['Oral', 'Topical', 'Ophthalmic', 'Otic', 'Nasal', 'Inhalation', 'Injectable', 'Rectal', 'Transdermal'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const df = (item: InventoryItem): Record<string, any> => item.customFields || {};
const barcodesOf = (item: InventoryItem): string[] => {
  const b = df(item).barcodes;
  return Array.isArray(b) ? b.filter((x: any) => typeof x === 'string' && x.trim()) : [];
};
const num = (v: any): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const daysUntil = (date?: string): number | null => {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - new Date(`${todayStr()}T00:00:00`).getTime()) / 86400000);
};

type ExpiryBadge = { label: string; cls: string; days: number } | null;
const expiryBadge = (date?: string): ExpiryBadge => {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return { label: 'EXPIRED', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', days };
  if (days <= 30) return { label: `${days}d expiry`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', days };
  if (days <= 90) return { label: `${days}d expiry`, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', days };
  return null;
};

interface ScanStatus { kind: 'match' | 'new' | 'error'; message: string; item?: InventoryItem }

// Minimal BarcodeDetector access (not in the standard TS DOM lib). `any` keeps
// this file compile-safe across TS versions that omit the W3C BarcodeDetector types.
const getBarcodeDetector = (): any => (window as any).BarcodeDetector ?? null;

// ---------------------------------------------------------------------------
// Optional camera scanner (Android device / webcam). USB/Bluetooth wedge
// scanners type into the focused input like a keyboard, so they work without
// this component.
// ---------------------------------------------------------------------------
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string>('');
  // Keep the latest callbacks in refs so the mount-once scan loop always calls
  // fresh handlers (latest catalogue data, latest form state).
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lastCodeRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const Detector = getBarcodeDetector();
      if (!Detector) {
        setError('Camera scanning is not supported on this browser. Use a USB/Bluetooth scanner or enter the code manually.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        let detector: any;
        try {
          detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf'] });
        } catch {
          detector = new Detector();
        }
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const value = String(codes[0].rawValue || '').trim();
              if (value && value !== lastCodeRef.current) {
                lastCodeRef.current = value;
                setLastCode(value);
                onCodeRef.current(value);
              }
            }
          } catch { /* frame not ready / decode error — keep looping */ }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Camera unavailable. Check permission or use a USB/Bluetooth scanner.');
      }
    };
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
      <video ref={videoRef} muted playsInline className="w-full h-40 object-cover" />
      <button
        type="button"
        onClick={() => onCloseRef.current()}
        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg hover:bg-black/80 transition"
        title="Stop camera"
      >
        <CameraOff className="w-4 h-4" />
      </button>
      {error && <p className="p-3 text-xs text-rose-200 bg-rose-900/60">{error}</p>}
      {lastCode && !error && (
        <p className="absolute bottom-2 left-2 right-2 text-[11px] font-mono text-white bg-black/60 px-2 py-1 rounded">
          Last scan: {lastCode}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main variant component
// ---------------------------------------------------------------------------
export default function PharmacyInventory(_props: { Universal?: React.ComponentType<any> }) {
  const {
    currentClient,
    currentClientId,
    saveInventoryItem,
    deleteInventoryItem,
    saveInventoryMovement,
    showToast,
  } = useAccounting();

  const [activeTab, setActiveTab] = useState<'registry' | 'receiving' | 'batches' | 'movements'>('registry');

  // ---- Registry data (from context, same supabase tables as the universal UI)
  const inventoryItems: InventoryItem[] = useMemo(() => currentClient?.inventoryItems || [], [currentClient]);

  // ---- Movements (lazy loaded, like the universal page)
  const [loadedMovements, setLoadedMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  // ---- Batches / lots (pharmacy_stock_batches, lazy loaded)
  const [batches, setBatches] = useState<PharmacyStockBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  // ---- Registry search / filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [formFilter, setFormFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // ---- Registration / edit form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [fCode, setFCode] = useState('');
  const [fSku, setFSku] = useState('');
  const [fGeneric, setFGeneric] = useState('');
  const [fBrand, setFBrand] = useState('');
  const [fStrength, setFStrength] = useState('');
  const [fDosage, setFDosage] = useState('');
  const [fDosageForm, setFDosageForm] = useState('Tablet');
  const [fManufacturer, setFManufacturer] = useState('');
  const [fRoute, setFRoute] = useState('Oral');
  const [fRequiresRx, setFRequiresRx] = useState(false);
  const [fCategory, setFCategory] = useState(DRUG_CATEGORIES[0]);
  const [fBaseUnit, setFBaseUnit] = useState('tablet');
  const [fPackUnit, setFPackUnit] = useState('box');
  const [fPackSize, setFPackSize] = useState('100');
  const [fCost, setFCost] = useState('0');
  const [fPrice, setFPrice] = useState('0');
  const [fStock, setFStock] = useState('0');
  const [fReorder, setFReorder] = useState('5');
  const [fLocation, setFLocation] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fBarcodes, setFBarcodes] = useState<string[]>([]);
  const [fBarcodeInput, setFBarcodeInput] = useState('');

  // ---- Scan state (registration tab)
  const [regScanInput, setRegScanInput] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [regCameraOn, setRegCameraOn] = useState(false);

  // ---- Receiving (incoming stock) form state
  const [recvItemId, setRecvItemId] = useState('');
  const [recvSearch, setRecvSearch] = useState('');
  const [recvScanInput, setRecvScanInput] = useState('');
  const [recvCameraOn, setRecvCameraOn] = useState(false);
  const [recvSupplier, setRecvSupplier] = useState('');
  const [recvLot, setRecvLot] = useState('');
  const [recvExpiry, setRecvExpiry] = useState('');
  const [recvPacks, setRecvPacks] = useState('1');
  const [recvCostPack, setRecvCostPack] = useState('0');
  const [recvRef, setRecvRef] = useState('');
  const [recvNotes, setRecvNotes] = useState('');
  const [recvStatus, setRecvStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // -------------------------------------------------------------------------
  // Lazy load movements
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentClientId || activeTab !== 'movements') return;
      setMovementsLoading(true);
      setMovementsError(null);
      try {
        const { data, error } = await supabase
          .from('inventory_movements')
          .select('id,item_id,item_name,item_code,date,type,qty,unit_cost,total_value,reference,notes')
          .eq('client_id', currentClientId)
          .order('date', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (!cancelled) {
          setLoadedMovements((data || []).map((m: any) => ({
            id: String(m.id), itemId: m.item_id || '', itemName: m.item_name || '',
            itemCode: m.item_code || '', date: m.date ? String(m.date).slice(0, 10) : '',
            type: m.type, qty: Number(m.qty || 0), unitCost: Number(m.unit_cost || 0),
            totalValue: Number(m.total_value || 0), reference: m.reference || '', notes: m.notes || '',
          })));
        }
      } catch (e: any) {
        if (!cancelled) setMovementsError(e?.message || 'Unable to load inventory movements.');
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [currentClientId, activeTab]);

  // -------------------------------------------------------------------------
  // Lazy load batches
  // -------------------------------------------------------------------------
  const refreshBatches = useCallback(async () => {
    if (!currentClientId) return;
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const { data, error } = await supabase
        .from('pharmacy_stock_batches')
        .select('id,item_id,item_name,item_code,barcode,supplier_name,batch_lot_no,expiry_date,pack_unit,pack_size,packs_received,qty_received_base,qty_on_hand_base,unit_cost_pack,unit_cost_base,total_cost,reference,notes,received_at')
        .eq('client_id', currentClientId)
        .order('expiry_date', { ascending: true });
      if (error) throw error;
      setBatches((data || []).map((b: any) => ({
        id: String(b.id),
        clientId: currentClientId,
        itemId: b.item_id || '',
        itemName: b.item_name || '',
        itemCode: b.item_code || '',
        barcode: b.barcode || '',
        supplierName: b.supplier_name || '',
        batchLotNo: b.batch_lot_no || '',
        expiryDate: b.expiry_date ? String(b.expiry_date).slice(0, 10) : undefined,
        packUnit: b.pack_unit || '',
        packSize: num(b.pack_size),
        packsReceived: num(b.packs_received),
        qtyReceivedBase: num(b.qty_received_base),
        qtyOnHandBase: num(b.qty_on_hand_base),
        unitCostPack: num(b.unit_cost_pack),
        unitCostBase: num(b.unit_cost_base),
        totalCost: num(b.total_cost),
        reference: b.reference || '',
        notes: b.notes || '',
        receivedAt: b.received_at || undefined,
      })));
    } catch (e: any) {
      setBatchesError(e?.message || 'Unable to load batch records.');
    } finally {
      setBatchesLoading(false);
    }
  }, [currentClientId]);

  useEffect(() => {
    if (activeTab === 'receiving' || activeTab === 'batches') void refreshBatches();
  }, [activeTab, refreshBatches]);

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------
  const findByCode = useCallback((raw: string): InventoryItem | undefined => {
    const c = raw.trim().toUpperCase();
    if (!c) return undefined;
    return inventoryItems.find((i) =>
      (i.sku || '').toUpperCase() === c ||
      (i.code || '').toUpperCase() === c ||
      barcodesOf(i).some((b) => b.toUpperCase() === c)
    );
  }, [inventoryItems]);

  const supplierNames: string[] = useMemo(() =>
    (currentClient?.tinLibrary?.suppliers || []).map((s: any) => s.name).filter(Boolean),
    [currentClient]
  );

  // -------------------------------------------------------------------------
  // Derived: summary KPIs
  // -------------------------------------------------------------------------
  const summary = useMemo(() => {
    let totalStock = 0; let totalValuation = 0;
    let lowStock = 0; let outOfStock = 0;
    inventoryItems.forEach((i) => {
      totalStock += i.stockLevel || 0;
      totalValuation += (i.stockLevel || 0) * (i.costPrice || 0);
      if ((i.stockLevel || 0) === 0) outOfStock += 1;
      else if ((i.stockLevel || 0) <= (i.reorderPoint || 0)) lowStock += 1;
    });
    const expiringSoon = batches.filter((b) =>
      (b.qtyOnHandBase || 0) > 0 && (daysUntil(b.expiryDate) ?? 9999) <= 30 && (daysUntil(b.expiryDate) ?? 9999) >= 0
    ).length;
    const expired = batches.filter((b) => (b.qtyOnHandBase || 0) > 0 && (daysUntil(b.expiryDate) ?? 0) < 0).length;
    return { totalItems: inventoryItems.length, totalStock, totalValuation, lowStock, outOfStock, expiringSoon, expired };
  }, [inventoryItems, batches]);

  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      const d = df(item);
      const q = searchQuery.trim().toLowerCase();
      const haystack = [
        item.name, item.code, item.sku, d.genericName, d.brandName, d.strength,
        d.dosageForm, d.manufacturer, ...barcodesOf(item),
      ].filter(Boolean).join(' ').toLowerCase();
      const matchQuery = !q || haystack.includes(q);
      const matchCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const matchForm = formFilter === 'All' || d.dosageForm === formFilter;
      const stock = item.stockLevel || 0;
      const matchStatus =
        statusFilter === 'All' ||
        (statusFilter === 'out' && stock === 0) ||
        (statusFilter === 'low' && stock > 0 && stock <= (item.reorderPoint || 0)) ||
        (statusFilter === 'in' && stock > (item.reorderPoint || 0));
      return matchQuery && matchCategory && matchForm && matchStatus;
    });
  }, [inventoryItems, searchQuery, categoryFilter, formFilter, statusFilter]);

  const soonestBatchFor = useCallback((itemId: string): PharmacyStockBatch | undefined =>
    batches
      .filter((b) => b.itemId === itemId && (b.qtyOnHandBase || 0) > 0 && b.expiryDate)
      .sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)))[0],
  [batches]);

  // -------------------------------------------------------------------------
  // Registration form handlers
  // -------------------------------------------------------------------------
  const resetForm = () => {
    setEditingItem(null);
    setFCode('MED-' + Math.floor(100 + Math.random() * 900));
    setFSku('SKU-' + Date.now().toString().slice(-6));
    setFGeneric('');
    setFBrand('');
    setFStrength('');
    setFDosage('');
    setFDosageForm('Tablet');
    setFManufacturer('');
    setFRoute('Oral');
    setFRequiresRx(false);
    setFCategory(DRUG_CATEGORIES[0]);
    setFBaseUnit('tablet');
    setFPackUnit('box');
    setFPackSize('100');
    setFCost('0');
    setFPrice('0');
    setFStock('0');
    setFReorder('5');
    setFLocation('');
    setFDesc('');
    setFBarcodes([]);
    setFBarcodeInput('');
  };

  const openAddForm = (prefillCode?: string) => {
    resetForm();
    if (prefillCode && prefillCode.trim()) {
      setFBarcodes([prefillCode.trim().toUpperCase()]);
      if (!fSku) setFSku(prefillCode.trim().toUpperCase());
    }
    setFormOpen(true);
  };

  const openEditForm = (item: InventoryItem) => {
    const d = df(item);
    setEditingItem(item);
    setFCode(item.code || '');
    setFSku(item.sku || '');
    setFGeneric(d.genericName || '');
    setFBrand(d.brandName || '');
    setFStrength(d.strength || '');
    setFDosage(d.dosage || '');
    setFDosageForm(d.dosageForm || 'Tablet');
    setFManufacturer(d.manufacturer || '');
    setFRoute(d.route || 'Oral');
    setFRequiresRx(!!d.requiresRx);
    setFCategory(item.category || DRUG_CATEGORIES[0]);
    setFBaseUnit(d.baseUnit || item.unitOfMeasure || 'tablet');
    setFPackUnit(d.packUnit || 'box');
    setFPackSize(String(d.packSize ?? 1));
    setFCost(String(item.costPrice || 0));
    setFPrice(String(item.sellingPrice || 0));
    setFStock(String(item.stockLevel || 0));
    setFReorder(String(item.reorderPoint || 0));
    setFLocation(item.location || '');
    setFDesc(item.description || '');
    setFBarcodes(barcodesOf(item));
    setFBarcodeInput('');
    setFormOpen(true);
  };

  const addFormBarcode = () => {
    const v = fBarcodeInput.trim().toUpperCase();
    if (!v) return;
    if (fBarcodes.includes(v)) { setFBarcodeInput(''); return; }
    setFBarcodes([...fBarcodes, v]);
    setFBarcodeInput('');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fCode.trim()) { showToast?.('Item code is required.'); return; }
    if (!fGeneric.trim() && !fBrand.trim()) { showToast?.('Enter either the generic name or brand name.'); return; }

    // Duplicate-registration guard: SKU, code and every scanned barcode must be
    // unique across the catalogue (excluding the record being edited).
    const probes = [fSku.trim().toUpperCase(), fCode.trim().toUpperCase(), ...fBarcodes.map((b) => b.toUpperCase())].filter(Boolean);
    const clash = inventoryItems.find((i) =>
      i.id !== editingItem?.id &&
      (probes.includes((i.sku || '').toUpperCase()) ||
       probes.includes((i.code || '').toUpperCase()) ||
       barcodesOf(i).some((b) => probes.includes(b.toUpperCase())))
    );
    if (clash) {
      showToast?.(`Duplicate prevented: that SKU/barcode is already registered to "${clash.name}".`);
      return;
    }

    const packSize = Math.max(1, num(fPackSize));
    const costVal = num(fCost);
    const priceVal = num(fPrice);
    const reorderVal = parseInt(fReorder as any) || 0;
    const name = (fBrand.trim()
      ? `${fBrand.trim()}${fStrength.trim() ? ` ${fStrength.trim()}` : ''}`
      : fGeneric.trim());
    const description = [
      fGeneric.trim() ? `Generic: ${fGeneric.trim()}` : '',
      fDosage.trim() ? `Directions: ${fDosage.trim()}` : '',
      fDesc.trim(),
    ].filter(Boolean).join(' | ');

    const drugFields: Record<string, any> = {
      genericName: fGeneric.trim(),
      brandName: fBrand.trim(),
      strength: fStrength.trim(),
      dosage: fDosage.trim(),
      dosageForm: fDosageForm,
      manufacturer: fManufacturer.trim(),
      route: fRoute,
      requiresRx: fRequiresRx,
      barcodes: fBarcodes,
      baseUnit: fBaseUnit,
      packUnit: fPackUnit,
      packSize,
      conversionFactor: packSize,
      lastPurchaseCost: editingItem ? df(editingItem).lastPurchaseCost ?? costVal : costVal,
    };

    let saved: InventoryItem;
    if (editingItem) {
      saved = {
        ...editingItem,
        code: fCode.trim(),
        name,
        sku: fSku.trim(),
        category: fCategory,
        unitOfMeasure: fBaseUnit,
        costPrice: costVal,
        sellingPrice: priceVal,
        reorderPoint: reorderVal,
        location: fLocation.trim(),
        description,
        customFields: { ...(editingItem.customFields || {}), ...drugFields },
      };
    } else {
      saved = {
        id: 'inv_' + Date.now(),
        code: fCode.trim(),
        name,
        sku: fSku.trim(),
        category: fCategory,
        unitOfMeasure: fBaseUnit,
        costPrice: costVal,
        sellingPrice: priceVal,
        stockLevel: parseInt(fStock as any) || 0,
        reorderPoint: reorderVal,
        location: fLocation.trim(),
        description,
        customFields: drugFields,
      };
    }
    await saveInventoryItem(saved);
    setFormOpen(false);
    setEditingItem(null);
    showToast?.(editingItem ? 'Medicine record updated.' : 'Medicine registered.');
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!confirm(`Remove "${item.name}" from the pharmacy catalogue? Its stock movements and batches will also be removed.`)) return;
    if (currentClientId) {
      await supabase.from('pharmacy_stock_batches').delete().eq('client_id', currentClientId).eq('item_id', item.id);
    }
    await deleteInventoryItem(item.id);
    void refreshBatches();
  };

  // -------------------------------------------------------------------------
  // Scanning (B: registration)
  // -------------------------------------------------------------------------
  const handleRegisterScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const match = findByCode(code);
    if (match) {
      setScanStatus({ kind: 'match', message: `Existing medicine matched — ${match.name} (${match.code}). Details loaded for editing; duplicates are blocked.`, item: match });
      openEditForm(match);
    } else {
      setScanStatus({ kind: 'new', message: `New code "${code}" captured. Complete the medicine details manually. Automatic retrieval from external drug databases is not guaranteed.` });
      openAddForm(code);
    }
  };

  // -------------------------------------------------------------------------
  // Receiving (C: barcode-assisted incoming stock)
  // -------------------------------------------------------------------------
  const selectedItem = useMemo(() => inventoryItems.find((i) => i.id === recvItemId) || null, [inventoryItems, recvItemId]);
  const selectedD = selectedItem ? df(selectedItem) : {};
  const selectedPackSize = Math.max(1, num(selectedD.packSize) || 1);
  const packs = Math.max(0, num(recvPacks));
  const baseQty = packs * selectedPackSize;
  const costPack = num(recvCostPack);
  const costBase = selectedPackSize > 0 ? costPack / selectedPackSize : 0;

  const filteredReceivingItems = useMemo(() => {
    const q = recvSearch.trim().toLowerCase();
    if (!q) return inventoryItems.slice(0, 12);
    return inventoryItems.filter((i) => {
      const d = df(i);
      return [i.name, i.code, i.sku, d.genericName, d.brandName, d.strength, ...barcodesOf(i)]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    }).slice(0, 12);
  }, [inventoryItems, recvSearch]);

  const handleReceiveScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const match = findByCode(code);
    if (match) {
      setRecvItemId(match.id);
      setRecvStatus({ kind: 'ok', text: `Matched ${match.name}. Current stock: ${match.stockLevel} ${df(match).baseUnit || 'units'}. Enter received quantities below.` });
    } else {
      setRecvStatus({ kind: 'error', text: `Code "${code}" is not in the catalogue. Register the medicine first, or use the manual product search.` });
    }
  };

  const handleSaveReceiving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClientId) { setRecvStatus({ kind: 'error', text: 'No active client.' }); return; }
    if (!selectedItem) { setRecvStatus({ kind: 'error', text: 'Select or scan a product first.' }); return; }
    if (packs <= 0) { setRecvStatus({ kind: 'error', text: 'Enter a received pack quantity greater than zero.' }); return; }
    if (!recvExpiry.trim()) { setRecvStatus({ kind: 'error', text: 'Record the batch expiration date.' }); return; }
    if (!recvLot.trim()) { setRecvStatus({ kind: 'error', text: 'Record the batch/lot number.' }); return; }

    const existing = batches.find((b) =>
      b.itemId === selectedItem.id &&
      (b.batchLotNo || '') === recvLot.trim() &&
      (b.expiryDate || '') === recvExpiry.trim()
    );

    const newOnHand = (existing?.qtyOnHandBase || 0) + baseQty;
    const newReceived = (existing?.packsReceived || 0) + packs;
    const newTotalCost = (existing?.totalCost || 0) + packs * costPack;
    const batchRow = {
      id: existing?.id || ('batch_' + Date.now()),
      client_id: currentClientId,
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      item_code: selectedItem.code,
      barcode: barcodesOf(selectedItem)[0] || null,
      supplier_name: recvSupplier.trim() || null,
      batch_lot_no: recvLot.trim(),
      expiry_date: recvExpiry.trim(),
      pack_unit: selectedD.packUnit || fPackUnit,
      pack_size: selectedPackSize,
      packs_received: newReceived,
      qty_received_base: (existing?.qtyReceivedBase || 0) + baseQty,
      qty_on_hand_base: newOnHand,
      unit_cost_pack: newReceived > 0 ? newTotalCost / newReceived : costPack,
      unit_cost_base: newOnHand > 0 ? newTotalCost / newOnHand : costBase,
      total_cost: newTotalCost,
      reference: recvRef.trim() || null,
      notes: recvNotes.trim() || null,
      received_at: new Date().toISOString(),
    };
    const { error: batchError } = await supabase.from('pharmacy_stock_batches').upsert(batchRow, { onConflict: 'id' });
    if (batchError) { setRecvStatus({ kind: 'error', text: batchError.message }); return; }

    // Add received base-unit quantity to the product's stock level.
    const updatedItem: InventoryItem = {
      ...selectedItem,
      stockLevel: (selectedItem.stockLevel || 0) + baseQty,
      costPrice: newOnHand > 0 ? newTotalCost / newOnHand : selectedItem.costPrice,
      customFields: {
        ...(selectedItem.customFields || {}),
        lastPurchaseCost: newOnHand > 0 ? newTotalCost / newOnHand : costBase,
      },
    };
    await saveInventoryItem(updatedItem);

    const movement: InventoryMovement = {
      id: 'mov_' + Date.now(),
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      itemCode: selectedItem.code,
      date: todayStr(),
      type: 'Receiving',
      qty: baseQty,
      unitCost: newOnHand > 0 ? newTotalCost / newOnHand : costBase,
      totalValue: packs * costPack,
      reference: recvRef.trim() || recvSupplier.trim() || 'Goods Receiving',
      notes: [
        recvSupplier.trim() ? `Supplier: ${recvSupplier.trim()}` : '',
        `Lot/Batch: ${recvLot.trim()}`,
        `Expiry: ${recvExpiry.trim()}`,
        `${packs} × ${selectedPackSize} ${selectedD.packUnit || selectedD.baseUnit || 'packs'} = ${baseQty} base ${selectedD.baseUnit || 'units'}`,
        `Cost: ₱${costPack.toLocaleString()} / ${selectedD.packUnit || 'pack'}`,
        `Batch: ${batchRow.id}`,
      ].filter(Boolean).join(' | '),
      barcode: barcodesOf(selectedItem)[0],
      supplierName: recvSupplier.trim() || undefined,
      batchLotNo: recvLot.trim(),
      expiryDate: recvExpiry.trim(),
      packUnit: selectedD.packUnit || undefined,
      packSize: selectedPackSize,
      packQty: packs,
      conversionFactor: selectedPackSize,
      baseQty,
      batchId: batchRow.id,
    };
    await saveInventoryMovement(movement);

    await refreshBatches();
    setRecvStatus({ kind: 'ok', text: `Received ${packs} pack(s) = ${baseQty} base units added to ${selectedItem.name}.` });
    setRecvPacks('1');
    setRecvCostPack('0');
    setRecvLot('');
    // Keep supplier/selected product open for a second receiving line.
  };

  const handleVoidBatch = async (batch: PharmacyStockBatch) => {
    if (!currentClientId) return;
    if (!confirm(`Void batch ${batch.batchLotNo || batch.id} for ${batch.itemName}? ${batch.qtyOnHandBase || 0} base units will be subtracted from stock.`)) return;
    const item = inventoryItems.find((i) => i.id === batch.itemId);
    await supabase.from('pharmacy_stock_batches').delete().eq('client_id', currentClientId).eq('id', batch.id);
    if (item && (batch.qtyOnHandBase || 0) > 0) {
      await saveInventoryItem({ ...item, stockLevel: Math.max(0, (item.stockLevel || 0) - (batch.qtyOnHandBase || 0)) });
      await saveInventoryMovement({
        id: 'mov_' + Date.now(),
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code,
        date: todayStr(),
        type: 'Adjustment',
        qty: -(batch.qtyOnHandBase || 0),
        unitCost: batch.unitCostBase || 0,
        totalValue: -((batch.qtyOnHandBase || 0) * (batch.unitCostBase || 0)),
        reference: `Void batch ${batch.batchLotNo || batch.id}`,
        notes: `Batch ${batch.id} removed; stock corrected.`,
      });
    }
    await refreshBatches();
    showToast?.('Batch voided and stock corrected.');
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const money = (n: number) => '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const v = valuationReport(inventoryItems as any, loadedMovements as any);
  const cogs = estimatedCogs(inventoryItems as any, loadedMovements as any);

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Pharmacy — Product Management & Receiving" icon={<Pill className="text-emerald-500 w-5 h-5" />} />

      {/* Valuation KPI strip */}
      <div className="px-4 md:px-6 grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventory Value (weighted-avg)</div>
          <div className="text-lg font-black text-slate-800 dark:text-slate-100">{money(v.totalValue)}</div>
          <div className="text-[10px] text-slate-400">{summary.totalStock.toLocaleString()} base units on hand</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated COGS (movements)</div>
          <div className="text-lg font-black text-slate-800 dark:text-slate-100">{money(cogs)}</div>
          <div className="text-[10px] text-slate-400">Weighted-average costing</div>
        </div>
        <div className={`rounded-xl border p-3 ${summary.expiringSoon > 0 || summary.expired > 0 ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30' : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiring Soon (≤30 days)</div>
          <div className={`text-lg font-black ${summary.expiringSoon > 0 || summary.expired > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {summary.expiringSoon} lot{summary.expiringSoon === 1 ? '' : 's'}
            {summary.expired > 0 && <span className="text-rose-500"> · {summary.expired} expired</span>}
          </div>
          <div className="text-[10px] text-slate-400">FEFO lot monitoring</div>
        </div>
      </div>

      <div className="p-4 md:p-6 flex-1">
        <div className="flex flex-col gap-6 font-sans">

          {/* KPI hub */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl"><Pill className="w-6 h-6" /></div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Registered Medicines</span>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.totalItems}</div>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl"><PackageCheck className="w-6 h-6" /></div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Stock Valuation</span>
                <div className="text-xl font-bold text-emerald-600">₱{summary.totalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-xl"><AlertTriangle className="w-6 h-6" /></div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Low Stock</span>
                <div className="text-xl font-bold text-amber-500">{summary.lowStock}</div>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-xl"><PackageX className="w-6 h-6" /></div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Out of Stock</span>
                <div className="text-xl font-bold text-rose-600">{summary.outOfStock}</div>
              </div>
            </div>
          </div>

          {/* Tabs + actions */}
          <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-100 dark:bg-slate-800/40 p-1.5 rounded-2xl gap-3">
            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
              {([
                { id: 'registry', label: 'Medicine Catalogue', icon: Pill },
                { id: 'receiving', label: 'Receive Stock', icon: Truck },
                { id: 'batches', label: 'Batches & Expiry', icon: CalendarClock },
                { id: 'movements', label: 'Movement Logs', icon: History },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 sm:flex-initial py-2 px-3 rounded-lg font-bold text-xs transition uppercase whitespace-nowrap ${activeTab === t.id ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  <span className="flex items-center gap-2 justify-center"><t.icon className="w-4 h-4" /> {t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
              <button
                onClick={() => setActiveTab('receiving')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 uppercase tracking-wide cursor-pointer"
              >
                <Truck className="w-4 h-4" /> Receive Stock
              </button>
              <button
                onClick={() => openAddForm()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 uppercase tracking-wide cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Register Medicine
              </button>
            </div>
          </div>

          {/* ============================ REGISTRY ============================ */}
          {activeTab === 'registry' && (
            <div className="space-y-4">
              {/* Scan capture bar (B) */}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      value={regScanInput}
                      onChange={(e) => setRegScanInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleRegisterScan(regScanInput); setRegScanInput(''); } }}
                      placeholder="Scan or type a barcode / QR / SKU (USB/Bluetooth scanner enters here; press Enter)…"
                      className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                    />
                  </div>
                  <button
                    onClick={() => { if (regCameraOn) setRegCameraOn(false); else setRegCameraOn(true); }}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl transition ${regCameraOn ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {regCameraOn ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                    {regCameraOn ? 'Stop Camera' : 'Camera Scan'}
                  </button>
                  <button
                    onClick={() => { const m = findByCode(regScanInput); if (m) openEditForm(m); else if (regScanInput.trim()) handleRegisterScan(regScanInput); }}
                    className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold rounded-xl transition uppercase"
                  >
                    Look Up Code
                  </button>
                </div>
                {regCameraOn && (
                  <CameraScanner onCode={(c) => { handleRegisterScan(c); }} onClose={() => setRegCameraOn(false)} />
                )}
                {scanStatus && (
                  <div className={`text-xs px-3 py-2 rounded-xl flex items-start gap-2 ${scanStatus.kind === 'match' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : scanStatus.kind === 'new' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'}`}>
                    {scanStatus.kind === 'match' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{scanStatus.message}</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  Scanned codes are captured into the medicine record automatically. Details not encoded in the barcode (generic name, strength, dosage form, price) are retrieved from the existing record when matched, or entered manually. Automatic lookup from external drug databases is not guaranteed.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search generic name, brand, strength, SKU, barcode, location…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold p-2.5 rounded-xl outline-none">
                  <option value="All">All Categories</option>
                  {DRUG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={formFilter} onChange={(e) => setFormFilter(e.target.value)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold p-2.5 rounded-xl outline-none">
                  <option value="All">All Dosage Forms</option>
                  {DOSAGE_FORMS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold p-2.5 rounded-xl outline-none">
                  <option value="All">All Stock Status</option>
                  <option value="in">In Stock</option>
                  <option value="low">Low Stock</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>

              {/* Catalogue table */}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Medicine</th>
                        <th className="px-4 py-3">SKU / Barcodes</th>
                        <th className="px-4 py-3">Unit Configuration</th>
                        <th className="px-4 py-3 text-right">Cost (₱/base)</th>
                        <th className="px-4 py-3 text-right">Price (₱/base)</th>
                        <th className="px-4 py-3 text-center">Stock / Expiry</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm font-medium">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-16 text-slate-400">
                            <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-semibold">No medicines match your filters.</p>
                            <p className="text-xs opacity-75 mt-1">Scan a barcode or click “Register Medicine” to add a product.</p>
                          </td>
                        </tr>
                      ) : filteredItems.map((item) => {
                        const d = df(item);
                        const stock = item.stockLevel || 0;
                        const isOut = stock === 0;
                        const isLow = !isOut && stock <= (item.reorderPoint || 0);
                        const soonest = soonestBatchFor(item.id);
                        const badge = soonest ? expiryBadge(soonest.expiryDate) : null;
                        const barcodes = barcodesOf(item);
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{item.name}</span>
                              {d.genericName && <span className="text-[11px] text-slate-500 block italic">({d.genericName})</span>}
                              <span className="mt-1 inline-flex items-center gap-1 flex-wrap">
                                {d.strength && <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{d.strength}</span>}
                                {d.dosageForm && <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">{d.dosageForm}</span>}
                                {d.requiresRx && <span className="text-[10px] font-black bg-rose-50 dark:bg-rose-950/30 text-rose-600 px-1.5 py-0.5 rounded">Rx</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 block">{item.sku}</span>
                              <span className="font-mono text-[10px] text-slate-400 block">{item.code}</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {barcodes.slice(0, 3).map((b) => (
                                  <span key={b} className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{b}</span>
                                ))}
                                {barcodes.length > 3 && <span className="text-[10px] text-slate-400">+{barcodes.length - 3}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div className="text-slate-700 dark:text-slate-300">{d.packUnit || item.unitOfMeasure} × {d.packSize || 1} <span className="text-slate-400">/ {d.baseUnit || item.unitOfMeasure}</span></div>
                              <div className="text-[10px] text-slate-400">factor {d.conversionFactor || d.packSize || 1} {d.baseUnit || item.unitOfMeasure}/{d.packUnit || 'pack'}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300">{money(item.costPrice)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-blue-600 font-bold">{money(item.sellingPrice)}</td>
                            <td className="px-4 py-3 text-center">
                              <div className={`text-sm font-bold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>{stock}</div>
                              <div className="text-[9px] uppercase font-black tracking-widest text-slate-400">{d.baseUnit || item.unitOfMeasure}</div>
                              {badge && <span className={`mt-1 inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{item.location || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button onClick={() => openEditForm(item)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 hover:text-blue-600 dark:text-slate-400 cursor-pointer" title="Edit medicine"><Edit3 className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteItem(item)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg text-rose-500 hover:text-rose-700 cursor-pointer" title="Delete medicine"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================ RECEIVING ============================ */}
          {activeTab === 'receiving' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: scan + manual product lookup */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><ScanBarcode className="w-4 h-4 text-emerald-500" /> Scan product on receipt</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={recvScanInput}
                      onChange={(e) => setRecvScanInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleReceiveScan(recvScanInput); setRecvScanInput(''); } }}
                      placeholder="Scan barcode/QR or SKU, then Enter…"
                      className="flex-1 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                    />
                    <button onClick={() => setRecvCameraOn((v) => !v)} className={`px-3 py-2.5 text-xs font-bold rounded-xl ${recvCameraOn ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                      {recvCameraOn ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                    </button>
                  </div>
                  {recvCameraOn && <CameraScanner onCode={handleReceiveScan} onClose={() => setRecvCameraOn(false)} />}
                  {recvStatus && (
                    <div className={`text-xs px-3 py-2 rounded-xl ${recvStatus.kind === 'ok' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'}`}>{recvStatus.text}</div>
                  )}

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Manual product search (when scanner unavailable)</label>
                    <input
                      type="text"
                      value={recvSearch}
                      onChange={(e) => setRecvSearch(e.target.value)}
                      placeholder="Search name, generic, brand, strength, barcode…"
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredReceivingItems.length === 0 && <p className="p-3 text-xs text-slate-400">No products found. Register the medicine first.</p>}
                      {filteredReceivingItems.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => { setRecvItemId(i.id); setRecvStatus({ kind: 'ok', text: `Selected ${i.name}.` }); }}
                          className={`w-full text-left px-3 py-2.5 text-xs transition ${recvItemId === i.id ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                        >
                          <div className="font-bold text-slate-800 dark:text-slate-100">{i.name} <span className="font-mono text-[10px] text-slate-400">{i.code}</span></div>
                          <div className="text-slate-500">{df(i).genericName || ''} {df(i).strength ? `· ${df(i).strength}` : ''}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">On hand: {i.stockLevel} {df(i).baseUnit || i.unitOfMeasure} · {df(i).packUnit || 'pack'} × {df(i).packSize || 1}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: receiving form */}
              <form onSubmit={handleSaveReceiving} className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-4 h-fit">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-500" /> Goods Receiving / Inbound</h4>

                {selectedItem && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/25 p-3 text-xs space-y-1">
                    <div className="font-bold text-emerald-800 dark:text-emerald-200">{selectedItem.name}</div>
                    <div className="text-emerald-700/80 dark:text-emerald-300/80">Current stock: <b>{selectedItem.stockLevel} {selectedD.baseUnit || selectedItem.unitOfMeasure}</b> · Pack: {selectedD.packUnit || 'pack'} × {selectedPackSize} {selectedD.baseUnit || 'units'}</div>
                    <div className="text-emerald-700/80 dark:text-emerald-300/80">Last purchase cost: {money(selectedD.lastPurchaseCost ?? selectedItem.costPrice)} / {selectedD.baseUnit || 'unit'}</div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Supplier *</label>
                  <input list="pharmacy-suppliers" value={recvSupplier} onChange={(e) => setRecvSupplier(e.target.value)} placeholder="Supplier name" className="w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                  <datalist id="pharmacy-suppliers">{supplierNames.map((n) => <option key={n} value={n} />)}</datalist>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Batch / Lot No. *</label>
                    <input value={recvLot} onChange={(e) => setRecvLot(e.target.value)} placeholder="LOT-2026-011" className="w-full text-sm font-mono border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Expiration Date *</label>
                    <input type="date" value={recvExpiry} onChange={(e) => setRecvExpiry(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Qty received ({selectedD.packUnit || 'packs'}) *</label>
                    <input type="number" min="0" step="any" value={recvPacks} onChange={(e) => setRecvPacks(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Purchase cost ({selectedD.packUnit || 'pack'}) ₱</label>
                    <input type="number" min="0" step="any" value={recvCostPack} onChange={(e) => setRecvCostPack(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">Conversion factor</span>
                    <b className="text-slate-700 dark:text-slate-200">× {selectedPackSize} {selectedD.baseUnit || 'units'}/{selectedD.packUnit || 'pack'}</b>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Added to stock (base units)</span>
                    <b className="text-emerald-600">{baseQty} {selectedD.baseUnit || 'units'}</b>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Cost per base unit</span>
                    <b className="text-slate-700 dark:text-slate-200">{money(costBase)}</b>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total purchase cost</span>
                    <b className="text-slate-700 dark:text-slate-200">{money(packs * costPack)}</b>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Reference (Invoice / DR No.)</label>
                    <input value={recvRef} onChange={(e) => setRecvRef(e.target.value)} placeholder="INV-0001" className="w-full text-sm font-mono border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Notes</label>
                    <input value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} placeholder="e.g. partial delivery" className="w-full text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                </div>

                <div className="pt-2 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-xl shadow-md uppercase tracking-wider text-xs transition">Post Receiving</button>
                </div>
              </form>
            </div>
          )}

          {/* ============================ BATCHES ============================ */}
          {activeTab === 'batches' && (
            <div className="space-y-4">
              {batchesLoading && <p className="text-sm text-slate-500 px-2">Loading lot records…</p>}
              {batchesError && <p className="text-sm text-rose-600 px-2">{batchesError}</p>}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Medicine / Supplier</th>
                        <th className="px-4 py-3">Lot No.</th>
                        <th className="px-4 py-3">Expiry</th>
                        <th className="px-4 py-3 text-center">Received (packs × size)</th>
                        <th className="px-4 py-3 text-center">On Hand (base)</th>
                        <th className="px-4 py-3 text-right">Cost / Base</th>
                        <th className="px-4 py-3 text-right">Total Cost</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {batches.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-16 text-slate-400"><CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm font-semibold">No batch/lot records yet.</p><p className="text-xs opacity-75 mt-1">Use “Receive Stock” to post the first delivery with its lot number and expiry date.</p></td></tr>
                      ) : batches.map((b) => {
                        const badge = expiryBadge(b.expiryDate);
                        return (
                          <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">{b.itemName}</span>
                              <span className="text-[11px] text-slate-500">{b.supplierName || '—'}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{b.batchLotNo || '—'}</td>
                            <td className="px-4 py-3">
                              {badge ? <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${badge.cls}`}>{b.expiryDate} · {badge.label}</span> : <span className="text-xs text-slate-500">{b.expiryDate || '—'}</span>}
                            </td>
                            <td className="px-4 py-3 text-center text-xs">{b.packsReceived} × {b.packSize} {b.packUnit}</td>
                            <td className="px-4 py-3 text-center font-mono text-xs font-bold">{b.qtyOnHandBase}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{money(b.unitCostBase)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-bold text-emerald-600">{money(b.totalCost)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => { setRecvItemId(b.itemId); setActiveTab('receiving'); }}
                                  className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg text-emerald-600 cursor-pointer" title="Receive more into this product"
                                ><Truck className="w-4 h-4" /></button>
                                <button onClick={() => handleVoidBatch(b)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg text-rose-500 cursor-pointer" title="Void batch"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================ MOVEMENTS ============================ */}
          {activeTab === 'movements' && (
            <div className="space-y-4">
              {movementsLoading && <p className="px-4 py-3 text-sm text-slate-500">Loading movement logs…</p>}
              {movementsError && <p className="px-4 py-3 text-sm text-rose-600">{movementsError}</p>}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3 text-center">Unit Cost</th>
                        <th className="px-4 py-3 text-center">Qty (base)</th>
                        <th className="px-4 py-3 text-right">Value</th>
                        <th className="px-4 py-3">Reference / Lot Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {loadedMovements.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-16 text-slate-400"><History className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm font-semibold">No stock ledger entries yet.</p></td></tr>
                      ) : loadedMovements.map((mov) => {
                        const isAdd = mov.type === 'Inbound' || mov.type === 'Receiving';
                        const isDed = mov.type === 'Outbound';
                        return (
                          <tr key={mov.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                            <td className="px-4 py-3 font-mono text-xs">{mov.date}</td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">{mov.itemName}</span>
                              <span className="font-mono text-[10px] text-slate-400">{mov.itemCode}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${mov.type === 'Receiving' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' : isAdd ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' : isDed ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400' : 'bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400'}`}>
                                {mov.type === 'Receiving' ? <Truck className="w-3 h-3" /> : null}
                                {mov.type === 'Receiving' ? 'Receiving (+)' : mov.type === 'Inbound' ? 'Inbound (+)' : mov.type === 'Outbound' ? 'Outbound (−)' : 'Adjustment (±)'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-xs">{money(mov.unitCost)}</td>
                            <td className={`px-4 py-3 text-center font-mono font-bold text-xs ${isAdd ? 'text-emerald-600' : isDed ? 'text-blue-600' : 'text-purple-600'}`}>
                              {isAdd ? '+' : isDed ? '−' : ''}{mov.qty}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-xs">{money(mov.totalValue)}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-xs">
                              <span className="font-mono uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-2">{mov.reference}</span>
                              <span className="line-clamp-2">{mov.notes || ''}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== Registration / edit drawer ==================== */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl h-full flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Pill className="w-5 h-5 text-emerald-500" />
                {editingItem ? 'Edit Medicine Record' : 'Register New Medicine'}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Barcodes / identifiers */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><ScanBarcode className="w-3.5 h-3.5" /> Barcodes / Packaging Identifiers (EAN · UPC · QR)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fBarcodeInput}
                    onChange={(e) => setFBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormBarcode(); } }}
                    placeholder="Scan or type a code, Enter to add; multiple packs supported"
                    className="flex-1 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button type="button" onClick={addFormBarcode} className="px-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fBarcodes.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-full">
                      {b}
                      <button type="button" onClick={() => setFBarcodes(fBarcodes.filter((x) => x !== b))} className="text-rose-500 hover:text-rose-700"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {fBarcodes.length === 0 && <span className="text-[11px] text-slate-400">No barcodes attached yet.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Product Code *</label>
                  <input value={fCode} onChange={(e) => setFCode(e.target.value.toUpperCase())} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 dark:text-white p-2.5 rounded-xl font-mono uppercase outline-none focus:ring-1 focus:ring-emerald-500" required />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">SKU</label>
                  <input value={fSku} onChange={(e) => setFSku(e.target.value.toUpperCase())} className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 dark:text-white p-2.5 rounded-xl font-mono outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Generic (INN) Name *</label>
                  <input value={fGeneric} onChange={(e) => setFGeneric(e.target.value)} placeholder="e.g. Paracetamol" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" required={!fBrand} />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Brand Name</label>
                  <input value={fBrand} onChange={(e) => setFBrand(e.target.value)} placeholder="e.g. Biogesic" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Strength</label>
                  <input value={fStrength} onChange={(e) => setFStrength(e.target.value)} placeholder="e.g. 500 mg, 5 mg/5 mL" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Dosage Form</label>
                  <select value={fDosageForm} onChange={(e) => setFDosageForm(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none">
                    {DOSAGE_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Dosage / Directions (Sig)</label>
                <input value={fDosage} onChange={(e) => setFDosage(e.target.value)} placeholder="e.g. 1 tablet orally every 6 hours as needed for fever" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Manufacturer / Distributor</label>
                  <input value={fManufacturer} onChange={(e) => setFManufacturer(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Route</label>
                  <select value={fRoute} onChange={(e) => setFRoute(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none">
                    {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Category</label>
                  <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none">
                    {DRUG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 pt-7 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={fRequiresRx} onChange={(e) => setFRequiresRx(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  Prescription (Rx) required
                </label>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Unit configuration & conversion</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Base unit</label>
                    <select value={fBaseUnit} onChange={(e) => setFBaseUnit(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2 rounded-xl outline-none">
                      {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Purchase pack</label>
                    <select value={fPackUnit} onChange={(e) => setFPackUnit(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2 rounded-xl outline-none">
                      {PACK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Pack size (base/pack)</label>
                    <input type="number" min="1" step="any" value={fPackSize} onChange={(e) => setFPackSize(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Conversion factor: 1 {fPackUnit} = {fPackSize || 1} {fBaseUnit}. Received packs are multiplied by this factor to reach base stock units.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Purchase cost (₱ / {fBaseUnit})</label>
                  <input type="number" min="0" step="any" value={fCost} onChange={(e) => setFCost(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Selling price (₱ / {fBaseUnit})</label>
                  <input type="number" min="0" step="any" value={fPrice} onChange={(e) => setFPrice(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Initial stock ({fBaseUnit})</label>
                  <input type="number" min="0" value={fStock} disabled={!!editingItem} onChange={(e) => setFStock(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none disabled:opacity-50 focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Reorder point ({fBaseUnit})</label>
                  <input type="number" min="0" value={fReorder} onChange={(e) => setFReorder(e.target.value)} className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Storage location / shelf</label>
                <input value={fLocation} onChange={(e) => setFLocation(e.target.value)} placeholder="e.g. Rack A-3, Refrigerated section" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Notes</label>
                <textarea rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Additional notes, contraindications, storage temperature…" className="w-full text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
              </div>

              <div className="pt-2 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-xl shadow-md uppercase tracking-wider text-xs transition">Save Medicine</button>
                <button type="button" onClick={() => setFormOpen(false)} className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100 font-bold p-3 rounded-xl uppercase tracking-wider text-xs transition">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
