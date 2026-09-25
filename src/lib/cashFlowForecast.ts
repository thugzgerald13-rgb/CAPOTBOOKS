// Cash-flow projection (Run 005 / T005) — simple trending model:
// starting cash + average monthly net income, with a ±1σ band derived from
// the variance of recent months. Commercial apps (QuickBooks cash flow
// planner, Xero short-term cash flow) surface this as a first-class widget.

export interface CashFlowPoint {
  label: string;
  projected: number;
  lower: number;
  upper: number;
}

export interface ForecastOptions {
  startingCash: number;
  /** Most recent monthly net-income series (oldest first). Last 3 used for the trend. */
  monthlyNet: number[];
  monthsAhead?: number;
}

export function forecastCashFlow({ startingCash, monthlyNet, monthsAhead = 3 }: ForecastOptions): CashFlowPoint[] {
  const recent = monthlyNet.slice(-3);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const variance = recent.length > 1
    ? Math.sqrt(recent.reduce((a, b) => a + (b - avg) ** 2, 0) / (recent.length - 1))
    : Math.abs(avg) * 0.25;

  const now = new Date();
  const points: CashFlowPoint[] = [
    { label: 'Now', projected: startingCash, lower: startingCash, upper: startingCash },
  ];
  let cash = startingCash;
  for (let i = 1; i <= monthsAhead; i++) {
    cash += avg;
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const spread = variance * i;
    points.push({
      label: d.toLocaleString('en-US', { month: 'short' }),
      projected: cash,
      lower: cash - spread,
      upper: cash + spread,
    });
  }
  return points;
}

/** Compact money formatter for chart axes/tooltips: ₱1.2M, ₱45K, ₱800 */
export function compactMoney(value: number): string {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`;
  return `₱${value.toFixed(0)}`;
}
