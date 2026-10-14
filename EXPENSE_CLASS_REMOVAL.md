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

## Note: SLSP / RELIEF VAT export still has Services/Capital Goods/Others columns
The Quarterly Summary List of Purchases (SLSP) export and its on-screen table
in History split VATable purchases into Services / Capital Goods / Others
columns based on `expenseType`. With the field gone, those three columns now
show `0.00` (the code still references `p.expenseType`, which is now
`undefined`). They do not break the build. If you file BIR Form 2550 with an
SLSP attachment, you'll want to either remove those three columns from the
SLSP export or re-derive the split from the Chart of Accounts account type.
Everything else (VATable / Non-VAT / Zero-Rated / Input Tax totals) is
unaffected.

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
