-- ---------------------------------------------------------------------------
-- Remove "Expense Class" (expense_type) from the purchases table.
--
-- The webapp no longer reads or writes this field. The Expense Class selector
-- was removed from Purchases, the column was removed from the Expenses History
-- view, and all SELECT/INSERT/sync mappings no longer reference it.
--
-- Safe to run: expense_type is a plain text column with no index, foreign key,
-- or view dependency. Existing data is discarded.
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchases DROP COLUMN IF EXISTS expense_type;
