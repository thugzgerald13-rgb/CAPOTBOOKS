# Pharmacy Point-of-Sale (POS) — Developer Preview

Cashier register for the pharmacy build-out. Reached from **Transactions →
Pharmacy POS** in the sidebar. **Visible to the developer account only for
now**; the page can be enabled for ordinary users later (see *Enabling for
users* below) once the pharmacy's approved tax/accounting treatment is finalized.

## 1. Run the database migration (required for server persistence)

```sql
-- Supabase SQL editor, after scripts/schema.sql and scripts/pharmacy_inventory_migration.sql
\i scripts/pharmacy_pos_migration.sql
```

Creates:

- `public.pos_transactions` — completed / voided / refunded sales, cart lines
  (JSONB), SC/PWD discount records, payment totals, sync/conflict flags.
- `public.pos_shifts` — cashier shift open/close with cash totals.

Both tables carry RLS owner policies mirroring `inventory_items` and are added
to the realtime publication when it exists. The page works **without** these
tables too: rows fall back to the local IndexedDB queue and upload when the
tables exist and the device is online.

## 2. Access control (dev-only today)

| Layer | File | Rule |
|---|---|---|
| Sidebar button | `src/components/Sidebar.tsx` | Rendered only when `isAdmin` (developer email); labeled `Dev`. |
| Route guard | `src/lib/pagePermissions.ts` | `/pos` in `ADMIN_ONLY_ROUTES`; absent from the feature allowlist, so non-devs are bounced even by direct URL. |
| Command palette | `src/components/ui/CommandPalette.tsx` | `pos` in `ADMIN_ONLY_COMMANDS`. |
| Page guard | `src/components/pos/PharmacyPos.tsx` | Renders a "developer preview" notice if `!isAdmin`. |
| Feature catalog | `src/lib/featureVisibility.ts` | `pos` listed for the Developer System Config access panel (does not grant access by itself). |

### Enabling for users later (when requested)

1. Add `'pos'` to `FEATURE_ALLOWED_PAGE_IDS` in `src/lib/pagePermissions.ts`
   and map `/pos` to a transaction permission (e.g. `edit_transactions`) in
   `ROUTE_PERMISSIONS`; remove it from `ADMIN_ONLY_ROUTES` once permission
   mapping replaces the admin-only guard.
2. Remove the `{isAdmin && ...}` gate on the sidebar button and the palette
   admin set.
3. Assign the feature through Developer System Config → feature access rules
   (per-user / per-plan) using the existing `pos` catalog entry.
4. Configure the discount/VAT rules (below) against the pharmacy's approved
   chart of accounts before production.

## 3. Feature coverage

### B. Cashier sales interface
- Manual product search by product name, generic name, brand, SKU, code and
  barcode (`src/lib/pos/units.ts` matching; offline search via Dexie cache).
- USB/Bluetooth wedge scanners: they type into the search box and submit with
  Enter; the focused search field refocuses after every add.
- Android/device camera barcode scanning: native `BarcodeDetector` component
  (`src/components/pos/PosCameraScanner.tsx`); formats EAN-13/8, UPC, Code 128/39/93,
  QR, Codabar, ITF.
- Results show availability (on-hand base units), selling price and unit;
  out-of-stock rows are disabled.
- Click a result to add; cart lines support quantity entry/edit, multi-line
  cart, line removal and running totals (`PharmacyPos.tsx`).
- Payment recording: Cash, Check, Credit Card, E-Wallet, Bank Transfer, On
  Account; tendered amount and change due for cash.
- Receipt generation: thermal-style printable receipt with business header,
  line detail, discount breakdown, totals, payment and change
  (`src/components/pos/ReceiptPrint.tsx`, existing `.print-area` print CSS).
- Sales history: History tab lists local + server receipts with status/sync
  badges and receipt preview/print.
- Void and refund workflows: reason-required modal; reversal sale row and
  stock restoration; status stamped on the original receipt
  (`postReversal` in `src/lib/pos/posSync.ts`).
- Cashier shifts and sales summaries: open shift with opening cash; close with
  actual cash count, expected cash and variance; per-method sales totals,
  discount, void/refund counts (`Shifts` tab).

### Senior Citizen / PWD discount
- Customer type selector: Regular / Senior Citizen / PWD; SC & PWD apply the
  20% discount (`POS_CONFIG` in `src/lib/pos/tax.ts`) and force VAT-exempt
  treatment.
- Customer ID reference capture: ID type, ID number, name, TIN, address, stored
  on the transaction for the BIR discount record.
- Transaction-level discount fields: `discount_rate`, `discount_amount`,
  `discount_senior`, `discount_pwd`; per-line discount amounts on the receipt.
- Final discount rates and VAT treatment must be reconciled with the pharmacy's
  approved accounting/compliance requirements; adjust `POS_CONFIG` (or wire it
  to System Config) rather than scattering constants in the UI.

### I. Multi-unit conversion
- Selling units: Piece, Tablet, Capsule, Strip, Blister, Box, Bottle, Sachet,
  Tube, Vial, Ampule, Pair (`SELLING_UNITS` in `src/lib/pos/units.ts`).
- Per-product conversion factors in `custom_fields.unitFactors`; default
  factors derive from the pack size; stock remains in the defined base unit
  (`unitFactors` / `factorFor` / `baseQuantity`).
- Line-level price per selling unit (`custom_fields.unitPrices` override,
  otherwise base price × factor); stock deduction always converts back to base
  units before writing the inventory movement.

### J. Offline POS (PWA)
- Existing PWA manifest + service worker (`public/manifest.json`,
  `public/sw.js`) provide installability and app-shell caching.
- Local catalogue cache, offline search/scan, offline cart and queued
  transactions in IndexedDB (`src/lib/pos/posDb.ts`, database `capot-pos-v1`).
- Automatic flush on reconnect (`flushPendingTransactions`); duplicate
  protection via the transaction UUID as the idempotency primary key and unique
  client receipt numbers.
- Stock conflict reporting: server-side stock validation at sync time;
  shortfalls flag the row in the Offline Queue tab instead of forcing negative
  stock. A disconnected device cannot guarantee globally current stock — the
  note is surfaced on the queue tab.
- Initial production scope: one designated cashier terminal (configured per
  deployment); server stock validation runs during synchronization.

### K. Accounting integration (`src/lib/pos/posSync.ts`)
- Completed sales mirror to the existing `sales` register through `saveSale`
  (reference = receipt no., payment type, customer/TIN, VAT type, net/output
  tax/exempt amount, line summary description).
- COGS: each sold line writes an `Outbound` `inventory_movements` row and
  decrements `inventory_items.stock_level` in base units; void/refund reversals
  write adjustment movements and restore stock.
- Idempotent posting: stable sale/movement ids (`pos_sale_<txid>`,
  `pos_mov_<txid>_<lineid>`) prevent duplicate entries on retries.
- Final account mapping (revenue, COGS, VAT payable, receivable/cash) depends
  on the pharmacy's chart of accounts; the current mirror uses the existing
  Sales table and inventory valuation helpers the same way the universal
  Sales/Inventory pages do.

## 4. Files

| Path | Purpose |
|---|---|
| `scripts/pharmacy_pos_migration.sql` | `pos_transactions`, `pos_shifts` tables, indexes, RLS, realtime |
| `src/lib/pos/types.ts` | Transaction / line / shift / catalogue types |
| `src/lib/pos/units.ts` | Selling units and base-unit conversion factors/prices |
| `src/lib/pos/tax.ts` | SC/PWD 20% discount, VAT-exempt/VATable math, currency helper |
| `src/lib/pos/posDb.ts` | Dexie offline store: catalogue, transactions, shifts, receipt sequence |
| `src/lib/pos/posSync.ts` | Server push/flush, sale + COGS mirror, reversals, conflicts |
| `src/components/pos/PharmacyPos.tsx` | Register, History, Shifts, Queue tabs and modals |
| `src/components/pos/PosCameraScanner.tsx` | Camera barcode capture |
| `src/components/pos/ReceiptPrint.tsx` | Printable receipt |
| Route/guard wiring | `src/App.tsx`, `src/lib/pagePermissions.ts`, `src/lib/featureVisibility.ts`, `src/components/Sidebar.tsx`, `src/components/ui/CommandPalette.tsx` |

## 5. Verification checklist

- `npm install`; `npm run build` succeeds.
- Developer login: Transactions → Pharmacy POS opens; non-developer URL
  `#/pos` redirects to dashboard and the button/palette entry is hidden.
- Add products, switch selling units, adjust quantities; totals update and
  stock checks use base units.
- Senior/PWD sale: 20% discount applies, ID fields required, receipt shows the
  discount and VAT-exempt treatment.
- Charge cash/other methods; receipt prints; History shows the sale; a void
  and a refund restore stock and post reversal rows.
- Open a shift, record sales, close with counted cash; variance computes.
- Go offline: sales queue locally; reconnect; queue flushes without duplicates;
  stock shortfalls appear as conflicts.
