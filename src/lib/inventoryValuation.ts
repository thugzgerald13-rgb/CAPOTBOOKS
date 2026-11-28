// Inventory valuation + COGS (Run 020 / T020): perpetual moving weighted-average,
// chronological FIFO costing (replaying prior outs), and PAS 2 / PFRS for SMEs Sec. 13
// Lower of Cost and Net Realizable Value (LCNRV) valuation reporting.

export interface InvItemLike {
  id: string;
  code?: string;
  name?: string;
  quantityOnHand?: number;
  unitCost?: number;
  netRealizableValue?: number;
  nrv?: number;
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

const getItemNrv = (item: InvItemLike): number | null => {
  const raw = item.netRealizableValue ?? item.nrv;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const getMoveQty = (m: InvMovementLike): number =>
  Math.abs(Number(m.quantity ?? m.qty ?? 0) || 0);

const getMoveCost = (m: InvMovementLike, fallbackItem?: InvItemLike): number =>
  Number(m.unitCost ?? (fallbackItem ? getItemBaseCost(fallbackItem) : 0)) || 0;

const isInMovement = (m: InvMovementLike): boolean =>
  /in|purchase|receipt/i.test(String(m.type || ''));

const isOutMovement = (m: InvMovementLike): boolean =>
  /out|sale|sold|issue/i.test(String(m.type || ''));

function sortedItemMovements(itemId: string, movements: InvMovementLike[]): InvMovementLike[] {
  return movements
    .filter(m => String(m.itemId) === String(itemId))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

/**
 * Perpetual moving weighted-average unit cost:
 * Replays chronological `in` and `out` movements so sold inventory reduces
 * pool quantity and value at the running average cost at the time of each sale.
 */
export function weightedAvgCost(item: InvItemLike, movements: InvMovementLike[]): number {
  const ordered = sortedItemMovements(item.id, movements);
  if (ordered.length === 0) return getItemBaseCost(item);

  let poolQty = 0;
  let poolValue = 0;
  let lastAvg = getItemBaseCost(item);

  for (const m of ordered) {
    const qty = getMoveQty(m);
    if (qty <= 0) continue;

    if (isInMovement(m)) {
      const unitCost = getMoveCost(m, item);
      poolQty += qty;
      poolValue += qty * unitCost;
      if (poolQty > 0) lastAvg = poolValue / poolQty;
    } else if (isOutMovement(m)) {
      const deductQty = Math.min(poolQty, qty);
      poolQty -= deductQty;
      poolValue = Math.max(0, poolValue - deductQty * lastAvg);
    } else if (/adjust/i.test(String(m.type || ''))) {
      const signedQty = Number(m.quantity ?? m.qty ?? 0) || 0;
      if (signedQty > 0) {
        const unitCost = getMoveCost(m, item);
        poolQty += signedQty;
        poolValue += signedQty * unitCost;
        if (poolQty > 0) lastAvg = poolValue / poolQty;
      } else if (signedQty < 0) {
        const deductQty = Math.min(poolQty, Math.abs(signedQty));
        poolQty -= deductQty;
        poolValue = Math.max(0, poolValue - deductQty * lastAvg);
      }
    }
  }

  return poolQty > 0 ? poolValue / poolQty : lastAvg;
}

/**
 * Chronological FIFO cost of goods sold for a new `qtySold`:
 * First replays historical `in` and `out` movements in date order to establish
 * true remaining FIFO cost layers, then consumes `qtySold` from the oldest
 * remaining layers.
 */
export function fifoCogs(
  item: InvItemLike,
  movements: InvMovementLike[],
  qtySold: number,
): { cogs: number; remainingQty: number; remainingValue: number } {
  const ordered = sortedItemMovements(item.id, movements);
  const layers: Array<{ qty: number; cost: number }> = [];

  const consumeFromLayers = (qtyToConsume: number): number => {
    let left = Math.max(0, qtyToConsume);
    let costSum = 0;
    for (const layer of layers) {
      if (left <= 0) break;
      if (layer.qty <= 0) continue;
      const take = Math.min(layer.qty, left);
      costSum += take * layer.cost;
      layer.qty -= take;
      left -= take;
    }
    return costSum;
  };

  for (const m of ordered) {
    const qty = getMoveQty(m);
    if (qty <= 0) continue;
    if (isInMovement(m)) {
      layers.push({ qty, cost: getMoveCost(m, item) });
    } else if (isOutMovement(m)) {
      consumeFromLayers(qty);
    }
  }

  const cogs = consumeFromLayers(qtySold);
  const remainingQty = layers.reduce((n, l) => n + l.qty, 0);
  const remainingValue = layers.reduce((n, l) => n + l.qty * l.cost, 0);
  return { cogs, remainingQty, remainingValue };
}

/**
 * Total inventory valuation (perpetual weighted-average + PAS 2 LCNRV write-down)
 * and low-stock list.
 */
export function valuationReport(items: InvItemLike[], movements: InvMovementLike[]): {
  totalValue: number;
  totalCostValue: number;
  totalNrvWriteDown: number;
  totalQuantity: number;
  lowStock: InvItemLike[];
  rows: Array<{
    item: InvItemLike;
    qty: number;
    unitCost: number;
    nrv: number | null;
    carryingUnitValue: number;
    value: number;
    nrvWriteDown: number;
    low: boolean;
  }>;
} {
  let totalValue = 0;
  let totalCostValue = 0;
  let totalNrvWriteDown = 0;
  let totalQuantity = 0;
  const lowStock: InvItemLike[] = [];

  const rows = items.map(item => {
    const qty = getItemQty(item);
    const unitCost = weightedAvgCost(item, movements);
    const nrv = getItemNrv(item);
    // PAS 2 / PFRS for SMEs Sec. 13: measure at Lower of Cost and NRV
    const carryingUnitValue = nrv !== null ? Math.min(unitCost, nrv) : unitCost;
    const costValue = qty * unitCost;
    const value = qty * carryingUnitValue;
    const nrvWriteDown = Math.max(0, costValue - value);
    const reorder = Number(item.reorderPoint) || 0;
    const low = reorder > 0 && qty <= reorder;
    if (low) lowStock.push(item);
    totalCostValue += costValue;
    totalValue += value;
    totalNrvWriteDown += nrvWriteDown;
    totalQuantity += qty;
    return { item, qty, unitCost, nrv, carryingUnitValue, value, nrvWriteDown, low };
  });

  return { totalValue, totalCostValue, totalNrvWriteDown, totalQuantity, lowStock, rows };
}

/**
 * Period COGS using perpetual moving weighted-average cost:
 * Replays each item's movements chronologically and accumulates COGS at the
 * moving average unit cost in effect at the exact time of each `out` movement.
 */
export function estimatedCogs(items: InvItemLike[], movements: InvMovementLike[]): number {
  let totalCogs = 0;
  for (const item of items) {
    const ordered = sortedItemMovements(item.id, movements);
    let poolQty = 0;
    let poolValue = 0;
    let runningAvg = getItemBaseCost(item);

    for (const m of ordered) {
      const qty = getMoveQty(m);
      if (qty <= 0) continue;
      if (isInMovement(m)) {
        const c = getMoveCost(m, item);
        poolQty += qty;
        poolValue += qty * c;
        if (poolQty > 0) runningAvg = poolValue / poolQty;
      } else if (isOutMovement(m)) {
        totalCogs += qty * runningAvg;
        const deduct = Math.min(poolQty, qty);
        poolQty -= deduct;
        poolValue = Math.max(0, poolValue - deduct * runningAvg);
      }
    }
  }
  return totalCogs;
}
