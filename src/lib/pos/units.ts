/**
 * src/lib/pos/units.ts — Multi-unit selling conversions for the pharmacy POS.
 *
 * Stock (inventory_items.stock_level and pharmacy batches) is always kept in
 * the product's defined BASE unit (e.g. tablet, capsule, mL). A sale can be
 * rung up in a larger selling unit (box, blister, strip, bottle, piece...);
 * each line stores its conversion factor (base units per 1 selling unit) so
 * stock deduction is always converted back to base units.
 */
import type { PosCatalogItem } from './types';

export interface SellingUnit {
  id: string;
  label: string;
  /** True for the units explicitly required by the POS specification. */
  required?: boolean;
}

/** Selling units offered at the register. Order matters for the dropdown. */
export const SELLING_UNITS: SellingUnit[] = [
  { id: 'piece', label: 'Piece', required: true },
  { id: 'tablet', label: 'Tablet', required: true },
  { id: 'capsule', label: 'Capsule', required: true },
  { id: 'strip', label: 'Strip', required: true },
  { id: 'blister', label: 'Blister', required: true },
  { id: 'box', label: 'Box', required: true },
  { id: 'bottle', label: 'Bottle', required: true },
  { id: 'sachet', label: 'Sachet' },
  { id: 'tube', label: 'Tube' },
  { id: 'vial', label: 'Vial' },
  { id: 'ampule', label: 'Ampule' },
  { id: 'pair', label: 'Pair' },
];

export const SELLING_UNIT_IDS = SELLING_UNITS.map((u) => u.id);

const unitLabel = (id: string) => SELLING_UNITS.find((u) => u.id === id)?.label ?? id;

/**
 * Default conversion factor (base units per selling unit) when the product has
 * no explicit `unitFactors` override. Smallest counted units default to 1;
 * packs fall back to the product's recorded pack size (e.g. 10 tablets/strip).
 */
function defaultFactor(item: PosCatalogItem, unit: string, packSize?: number): number {
  switch (unit) {
    case 'tablet':
    case 'capsule':
    case 'piece':
    case 'vial':
    case 'ampule':
    case 'sachet':
    case 'tube':
    case 'pair':
      return 1;
    case 'strip':
    case 'blister':
      return packSize && packSize > 0 ? packSize : 10;
    case 'box':
    case 'bottle':
      return packSize && packSize > 0 ? packSize : 1;
    default:
      return 1;
  }
}

/** Conversion factor for `item` sold in `unit` (base units per 1 selling unit). */
export function factorFor(item: PosCatalogItem, unit: string, packSize?: number): number {
  const explicit = item.unitFactors?.[unit];
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  const f = defaultFactor(item, unit, packSize);
  return Number.isFinite(f) && f > 0 ? f : 1;
}

/**
 * Gross price per one selling unit. Explicit `unitPrices[unit]` wins; otherwise
 * the base-unit selling price is scaled by the conversion factor.
 */
export function priceFor(item: PosCatalogItem, unit: string, packSize?: number): number {
  const override = item.unitPrices?.[unit];
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const factor = factorFor(item, unit, packSize);
  const base = Number(item.sellingPrice || 0);
  return Math.round(base * factor * 100) / 100;
}

/** Base-unit quantity that must be deducted from stock. */
export function baseQuantity(sellingQty: number, factor: number): number {
  return Math.round(sellingQty * factor * 10000) / 10000;
}

export function sellingUnitLabel(id: string): string {
  return unitLabel(id);
}
