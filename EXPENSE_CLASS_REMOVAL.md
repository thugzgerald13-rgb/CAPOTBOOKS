# CAPOTBOOKS — Remove "Expense Class" (expense_type)

## What was removed
"Expense Class" was the `expense_type` column on the `purchases` table
(values: Capital Goods / Services / Others). It was NOT a separate lookup
table.

1. **Purchases form** — removed the Expense Class `<select>` (Capital Goods /
   Services / Others). The "Payment for / Account Title" list now always shows
   Assets + Costs + Expenses accounts (it used to split into Assets vs
   Expenses based on the class).
2. **Expenses History column** — removed the "Expense Class" column (column
   def, width, cell renderers) and stopped selecting/mapping `expense_type`.
3. **Supabase** — `scripts/drop_expense_type_column.sql` drops the column:
   `ALTER TABLE public.purchases DROP COLUMN IF EXISTS expense_type;`
   (also removed from `scripts/schema.sql`).

## Data-layer cleanup (so the column can be dropped safely)
Removed `expense_type` / `expenseType` from all reads/writes:
- `src/context/AccountingContext.tsx` — PURCHASES_COLUMNS, load mapping,
  syncMany, realtime, upsert, category fallback.
- `src/components/History.tsx` — PURCHASE_SELECT_COLS, row mapping.
- `src/components/BIRForms.tsx` — select list + category fallback.
- `src/components/Relief.tsx` — category fallback.
- `src/lib/glPosting.tsx` — 3 fallbacks (account_title / description /
  debit_account now use accountTitle only).
- `src/types.ts` — removed `expenseType: string` from the Purchase type.

## SLSP / RELIEF VAT export — Services/Capital Goods/Others columns removed
The Quarterly Summary List of Purchases (SLSP) export and its on-screen table
in History previously split VATable purchases into Services / Capital Goods /
Others columns based on `expenseType`. Those three columns (BIR RELIEF columns
10/11/12) have now been **removed entirely** from both the XLSX export and the
on-screen table (header labels, per-row cells, grand-total row, column widths,
and the `isServices/isCapital/isOthers` helpers). The remaining columns are
renumbered (Input Tax = 10, Gross Taxable Purchase = 11). VATable / Non-VAT /
Zero-Rated / Input Tax totals are unaffected.
All `expense_type` / `expenseType` references are gone from `src/` (verified
by grep).

## Deploy
```bash
npm run build                     # exits 0
psql "$DATABASE_URL" -f scripts/drop_expense_type_column.sql
```

## Files Changed
- `src/components/Purchases.tsx`
- `src/components/History.tsx`
- `src/components/BIRForms.tsx`
- `src/components/Relief.tsx`
- `src/context/AccountingContext.tsx`
- `src/lib/glPosting.ts`
- `src/types.ts`
- `scripts/schema.sql`
- `scripts/drop_expense_type_column.sql` (new)
- `EXPENSE_CLASS_REMOVAL.md` (this file)
