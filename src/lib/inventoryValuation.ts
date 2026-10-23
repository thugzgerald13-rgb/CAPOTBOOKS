// Inventory valuation + COGS (Run 020 / T020): weighted-average and FIFO costing,
// low-stock detection, and valuation report. Operates on InventoryItem + InventoryMovement.

export interface InvItemLike {
  id: string;
  code?: string;
  name?: string;
  quantityOnHand?: number;
  unitCost?: number;
  reorderPoint?: number;
  [k: string]: any;
}

export interface InvMovementLike {
  itemId?: string;
  type?: string; // 'in' | 'out' | 'adjustment'
  quantity?: number;
  unitCost?: number;
  date?: string;
  [k: string]: any;
}

const getItemQty = (item: InvItemLike): number =>
  Number(item.quantityOnHand ?? item.stockLevel ?? 0) || 0;

const getItemBaseCost = (item: InvItemLike): number =>
  Number(item.unitCost ?? item.costPrice ?? 0) || 0;

const getMoveQty = (m: InvMovementLike): number =>
  Number(m.quantity ?? m.qty ?? 0) || 0;

const getMoveCost = (m: InvMovementLike, fallbackItem?: InvItemLike): number =>
  Number(m.unitCost ?? (fallbackItem ? getItemBaseCost(fallbackItem) : 0)) || 0;

/** Weighted-average unit cost from movements (purchases in). */
export function weightedAvgCost(item: InvItemLike, movements: InvMovementLike[]): number {
  const ins = movements.filter(m => String(m.itemId) === String(item.id) && /in|purchase|receipt/i.test(String(m.type || '')));
  const totalQty = ins.reduce((n, m) => n + getMoveQty(m), 0);
  const totalCost = ins.reduce((n, m) => n + getMoveQty(m) * getMoveCost(m, item), 0);
  if (totalQty > 0) return totalCost / totalQty;
  return getItemBaseCost(item);
}

/** FIFO cost of goods sold for a given quantity sold (from movements). Returns COGS + remaining layers. */
export function fifoCogs(item: InvItemLike, movements: InvMovementLike[], qtySold: number): { cogs: number; remainingQty: number; remainingValue: number } {
  const ins = movements
    .filter(m => String(m.itemId) === String(item.id) && /in|purchase|receipt/i.test(String(m.type || '')))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const layers = ins.map(m => ({ qty: getMoveQty(m), cost: getMoveCost(m, item) }));
  let remaining = qtySold;
  let cogs = 0;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(layer.qty, remaining);
    cogs += take * layer.cost;
    layer.qty -= take;
    remaining -= take;
  }
  const remainingQty = layers.reduce((n, l) => n + l.qty, 0);
  const remainingValue = layers.reduce((n, l) => n + l.qty * l.cost, 0);
  return { cogs, remainingQty, remainingValue };
}

/** Total inventory valuation (weighted-average) + low-stock list. */
export function valuationReport(items: InvItemLike[], movements: InvMovementLike[]): {
  totalValue: number;
  totalQuantity: number;
  lowStock: InvItemLike[];
  rows: Array<{ item: InvItemLike; qty: number; unitCost: number; value: number; low: boolean }>;
} {
  let totalValue = 0, totalQuantity = 0;
  const lowStock: InvItemLike[] = [];
  const rows = items.map(item => {
    const qty = getItemQty(item);
    const unitCost = weightedAvgCost(item, movements);
    const value = qty * unitCost;
    const reorder = Number(item.reorderPoint) || 0;
    const low = reorder > 0 && qty <= reorder;
    if (low) lowStock.push(item);
    totalValue += value; totalQuantity += qty;
    return { item, qty, unitCost, value, low };
  });
  return { totalValue, totalQuantity, lowStock, rows };
}

/** Estimated COGS for a period using weighted-average cost: sum(out movements × avg cost). */
export function estimatedCogs(items: InvItemLike[], movements: InvMovementLike[]): number {
  return movements.reduce((sum, m) => {
    if (!/out|sale|sold/i.test(String(m.type || ''))) return sum;
    const item = items.find(i => String(i.id) === String(m.itemId));
    const cost = item ? weightedAvgCost(item, movements) : getMoveCost(m);
    return sum + getMoveQty(m) * cost;
  }, 0);
}
