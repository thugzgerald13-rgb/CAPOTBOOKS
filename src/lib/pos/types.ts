/**
 * src/lib/pos/types.ts — Pharmacy Point-of-Sale shared types.
 *
 * The POS page (route `/pos`, developer-only until enabled for users) reuses
 * the existing `inventory_items` catalogue; these types describe the cart,
 * cashier transaction, shift and offline queue records specific to POS.
 */
import type { InventoryItem } from '../../types';

/** Customer discount classification (Philippine Senior Citizen / PWD law). */
export type PosCustomerType = 'regular' | 'senior' | 'pwd';

export type PosVatType = 'VAT Exempt' | 'VATable' | 'Zero-Rated';

export type PosTxStatus = 'completed' | 'voided' | 'refunded';

export type PosPaymentMethod =
  | 'Cash'
  | 'Check'
  | 'Credit Card'
  | 'E-Wallet'
  | 'Bank Transfer'
  | 'On Account';

export const POS_PAYMENT_METHODS: PosPaymentMethod[] = [
  'Cash',
  'Check',
  'Credit Card',
  'E-Wallet',
  'Bank Transfer',
  'On Account',
];

/** A single cart line. Stock is always deducted in the item's base unit. */
export interface PosLine {
  lineId: string;
  itemId: string;
  name: string;
  genericName?: string;
  brandName?: string;
  sku?: string;
  code?: string;
  barcode?: string;
  /** Selling unit chosen at the register (box, strip, tablet...). */
  sellingUnit: string;
  /** Base (inventory) units contained in one selling unit (conversion factor). */
  unitFactor: number;
  /** Quantity expressed in `sellingUnit`. */
  qty: number;
  /** qty × unitFactor — quantity deducted from base-unit stock. */
  baseQty: number;
  /** Gross price per one selling unit (pre-discount). */
  unitPrice: number;
  /** qty × unitPrice before discount. */
  grossLine: number;
  /** Discount amount applied to this line (SC/PWD). */
  discountLine: number;
  /** grossLine − discountLine. */
  netLine: number;
  /** Cost of goods sold: baseQty × base-unit cost. */
  costTotal: number;
  vatType: PosVatType;
  /** Available base-unit stock captured when added (offline snapshot). */
  stockOnAdd?: number;
}

export interface PosCustomer {
  type: PosCustomerType;
  name?: string;
  idType?: string;
  idNo?: string;
  tin?: string;
  address?: string;
}

export interface PosTransaction {
  /** Idempotency key (client-generated UUID); protects against duplicate syncs. */
  id: string;
  clientId: string | null;
  receiptNo: string;
  cashier: string;
  shiftId?: string | null;
  status: PosTxStatus;
  customer: PosCustomer;
  discountRate: number;
  discountAmount: number;
  discountSenior: number;
  discountPwd: number;
  gross: number;
  vatAmount: number;
  exemptAmount: number;
  net: number;
  vatType: PosVatType;
  paymentMethod: PosPaymentMethod;
  tendered: number;
  change: number;
  lines: PosLine[];
  /** `sales` table row id once mirrored to the accounting books. */
  saleId?: string;
  /** Inventory movement ids written for the outbound (COGS) entries. */
  movementIds?: string[];
  voidReason?: string;
  refundReason?: string;
  /** Original transaction id when this record is a refund reversal. */
  refundOf?: string;
  /** Set on the status row of a void/refund so the queue can replay the reversal. */
  reversalKind?: 'void' | 'refund';
  reversalReason?: string;
  /** Snapshot of the original sale used when replaying a reversal offline. */
  originalSnapshot?: PosTransaction;
  createdAt: string;
  /** 'pending' = stored offline, awaiting synchronization; 'synced' = posted. */
  syncStatus: 'pending' | 'synced' | 'conflict';
  syncError?: string;
  /** Server-side stock conflict reported during synchronization. */
  conflict?: string;
}

export interface PosShiftTotals {
  sales: number;
  items: number;
  gross: number;
  discount: number;
  net: number;
  vat: number;
  cash: number;
  check: number;
  card: number;
  ewallet: number;
  bank: number;
  account: number;
  voids: number;
  refunds: number;
  refundedAmount: number;
}

export interface PosShift {
  id: string;
  clientId: string | null;
  cashier: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  actualCash?: number;
  cashVariance?: number;
  totals: PosShiftTotals;
  notes?: string;
}

/** Normalized catalogue row cached locally for offline searching/scanning. */
export interface PosCatalogItem {
  id: string;
  clientId: string | null;
  name: string;
  genericName?: string;
  brandName?: string;
  sku?: string;
  code?: string;
  barcodes: string[];
  baseUnit: string;
  stockLevel: number;
  costPrice: number;
  sellingPrice: number;
  /** base units per selling unit, e.g. { strip: 10, box: 100 } */
  unitFactors: Record<string, number>;
  /** optional price override per selling unit (otherwise sellingPrice × factor) */
  unitPrices: Record<string, number>;
  /** Pack size recorded at receiving (base units per purchase pack), fallback for default factors. */
  packSize?: number;
  requiresRx?: boolean;
  updatedAt: string;
}

/** Map a live InventoryItem into the local offline catalogue shape. */
export function toCatalogItem(item: InventoryItem, clientId: string | null): PosCatalogItem {
  const cf = (item.customFields || {}) as Record<string, any>;
  const barcodes = Array.isArray(cf.barcodes)
    ? cf.barcodes.filter((b: any) => typeof b === 'string' && b.trim())
    : [];
  return {
    id: String(item.id),
    clientId,
    name: item.name || '',
    genericName: cf.genericName || undefined,
    brandName: cf.brandName || undefined,
    sku: item.sku || cf.sku || undefined,
    code: item.code || undefined,
    barcodes,
    baseUnit: cf.baseUnit || item.unitOfMeasure || 'piece',
    stockLevel: Number(item.stockLevel || 0),
    costPrice: Number(item.costPrice || 0),
    sellingPrice: Number(item.sellingPrice || 0),
    unitFactors: cf.unitFactors && typeof cf.unitFactors === 'object' ? cf.unitFactors : {},
    unitPrices: cf.unitPrices && typeof cf.unitPrices === 'object' ? cf.unitPrices : {},
    packSize: cf.packSize != null ? Number(cf.packSize) : undefined,
    requiresRx: Boolean(cf.requiresRx),
    updatedAt: new Date().toISOString(),
  };
}
