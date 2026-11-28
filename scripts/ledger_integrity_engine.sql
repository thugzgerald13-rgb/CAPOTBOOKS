-- ============================================================================
-- ledger_integrity_engine.sql
--
-- Database-enforced Double-Entry Ledger Architecture & Data Integrity Engine
-- for CAPOTBOOKS (PostgreSQL / Supabase).
--
-- What this migration adds (100% additive & idempotent — zero breaking changes):
--   1. Immutable COA `account_id` columns on `public.purchases` and `public.sales`
--      so transactions bind to stable COA IDs rather than fragile display labels.
--   2. Canonical double-entry tables (`public.gl_journal_batches` &
--      `public.gl_posting_lines`) with strict DATE posting_date and NUMERIC(18,2)
--      single-side debit/credit checks.
--   3. DEFERRABLE INITIALLY DEFERRED constraint trigger
--      (`trg_enforce_gl_batch_balance`) that mathematically guarantees
--      SUM(debit) = SUM(credit) per journal batch at transaction COMMIT.
--   4. Atomic RPC `public.post_balanced_gl_batch(...)` that enforces
--      `accounting_period_locks` and replaces a source transaction's postings
--      in a single ACID transaction.
--   5. Fast server-side RPC `public.get_canonical_trial_balance(client_id, year)`.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Persist immutable COA account_id alongside display labels on transactions
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS account_id TEXT;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_purchases_account_id
  ON public.purchases (client_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_account_id
  ON public.sales (client_id, account_id)
  WHERE account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Canonical Double-Entry General Ledger Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_journal_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  posting_date DATE NOT NULL,
  reference TEXT,
  memo TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_gl_batches_source UNIQUE (client_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_gl_batches_client_date
  ON public.gl_journal_batches (client_id, posting_date);

CREATE TABLE IF NOT EXISTS public.gl_posting_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.gl_journal_batches(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  debit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  party_type TEXT CHECK (party_type IS NULL OR party_type IN ('customer', 'supplier')),
  party_name TEXT,
  particulars TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_gl_line_single_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_gl_lines_batch
  ON public.gl_posting_lines (batch_id);

CREATE INDEX IF NOT EXISTS idx_gl_lines_client_account
  ON public.gl_posting_lines (client_id, account_id);

CREATE INDEX IF NOT EXISTS idx_gl_lines_party
  ON public.gl_posting_lines (client_id, party_type, party_name)
  WHERE party_type IS NOT NULL AND party_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Database-Enforced Double-Entry Invariant (DEFERRABLE INITIALLY DEFERRED)
--    Validates at COMMIT time that every non-empty batch satisfies
--    ABS(SUM(debit) - SUM(credit)) < 0.01.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_gl_batch_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id UUID;
  v_debit NUMERIC(18,2);
  v_credit NUMERIC(18,2);
  v_count INTEGER;
BEGIN
  -- Skip balance check during authorized account/client cascade deletion.
  IF coalesce(current_setting('app.account_deletion', true), '') = 'true' THEN
    RETURN NULL;
  END IF;

  v_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);
  IF v_batch_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If the parent batch was deleted (ON DELETE CASCADE), skip.
  IF NOT EXISTS (SELECT 1 FROM public.gl_journal_batches WHERE id = v_batch_id) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_count, v_debit, v_credit
  FROM public.gl_posting_lines
  WHERE batch_id = v_batch_id;

  IF v_count > 0 AND ABS(v_debit - v_credit) >= 0.01 THEN
    RAISE EXCEPTION 'Double-entry balance violation on GL batch %: Debits (%) <> Credits (%)',
      v_batch_id, v_debit, v_credit
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gl_batch_balance ON public.gl_posting_lines;
CREATE CONSTRAINT TRIGGER trg_enforce_gl_batch_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.gl_posting_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gl_batch_balance();

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security (follows clients ownership / team access)
-- ---------------------------------------------------------------------------
ALTER TABLE public.gl_journal_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_posting_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gl_batches_access ON public.gl_journal_batches;
CREATE POLICY gl_batches_access
  ON public.gl_journal_batches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = gl_journal_batches.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = gl_journal_batches.client_id
    )
  );

DROP POLICY IF EXISTS gl_lines_access ON public.gl_posting_lines;
CREATE POLICY gl_lines_access
  ON public.gl_posting_lines
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = gl_posting_lines.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = gl_posting_lines.client_id
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Atomic Double-Entry Posting RPC (enforces period locks + balance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_balanced_gl_batch(
  p_client_id TEXT,
  p_source_type TEXT,
  p_source_id TEXT,
  p_posting_date DATE,
  p_reference TEXT,
  p_memo TEXT,
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_date DATE;
  v_batch_id UUID;
  v_line JSONB;
  v_dr NUMERIC(18,2) := 0;
  v_cr NUMERIC(18,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Enforce server-side accounting period lock if configured.
  IF to_regclass('public.accounting_period_locks') IS NOT NULL THEN
    SELECT lock_date INTO v_lock_date
    FROM public.accounting_period_locks
    WHERE client_id = p_client_id;

    IF v_lock_date IS NOT NULL AND p_posting_date <= v_lock_date THEN
      RAISE EXCEPTION 'Accounting period is locked on or before %. Unlock the period before posting.', v_lock_date
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A balanced GL batch requires at least 2 posting lines.';
  END IF;

  -- Pre-validate balance before mutating.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_dr := v_dr + COALESCE((v_line ->> 'debit')::NUMERIC(18,2), 0);
    v_cr := v_cr + COALESCE((v_line ->> 'credit')::NUMERIC(18,2), 0);
  END LOOP;

  IF ABS(v_dr - v_cr) >= 0.01 OR v_dr <= 0 THEN
    RAISE EXCEPTION 'Unbalanced GL batch rejected: Debits (%) <> Credits (%)', v_dr, v_cr
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.gl_journal_batches (
    client_id, source_type, source_id, posting_date, reference, memo, created_by, updated_at
  )
  VALUES (
    p_client_id, p_source_type, p_source_id, p_posting_date, p_reference, p_memo, auth.uid(), now()
  )
  ON CONFLICT (client_id, source_type, source_id)
  DO UPDATE SET
    posting_date = EXCLUDED.posting_date,
    reference = EXCLUDED.reference,
    memo = EXCLUDED.memo,
    updated_at = now()
  RETURNING id INTO v_batch_id;

  DELETE FROM public.gl_posting_lines WHERE batch_id = v_batch_id;

  INSERT INTO public.gl_posting_lines (
    batch_id, client_id, account_id, debit, credit, party_type, party_name, particulars
  )
  SELECT
    v_batch_id,
    p_client_id,
    trim(line ->> 'account_id'),
    COALESCE((line ->> 'debit')::NUMERIC(18,2), 0),
    COALESCE((line ->> 'credit')::NUMERIC(18,2), 0),
    NULLIF(trim(COALESCE(line ->> 'party_type', '')), ''),
    NULLIF(trim(COALESCE(line ->> 'party_name', '')), ''),
    NULLIF(trim(COALESCE(line ->> 'particulars', '')), '')
  FROM jsonb_array_elements(p_lines) AS line;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_balanced_gl_batch(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_balanced_gl_batch(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Server-Side Canonical Trial Balance RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_canonical_trial_balance(
  p_client_id TEXT,
  p_year INTEGER
)
RETURNS TABLE (
  account_id TEXT,
  beginning_balance NUMERIC(18,2),
  period_debit NUMERIC(18,2),
  period_credit NUMERIC(18,2),
  ending_balance NUMERIC(18,2)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT make_date(p_year, 1, 1) AS y_start,
           make_date(p_year + 1, 1, 1) AS y_end
  )
  SELECT
    l.account_id,
    COALESCE(SUM(CASE WHEN b.posting_date < bounds.y_start THEN l.debit - l.credit ELSE 0 END), 0)::NUMERIC(18,2) AS beginning_balance,
    COALESCE(SUM(CASE WHEN b.posting_date >= bounds.y_start AND b.posting_date < bounds.y_end THEN l.debit ELSE 0 END), 0)::NUMERIC(18,2) AS period_debit,
    COALESCE(SUM(CASE WHEN b.posting_date >= bounds.y_start AND b.posting_date < bounds.y_end THEN l.credit ELSE 0 END), 0)::NUMERIC(18,2) AS period_credit,
    COALESCE(SUM(CASE WHEN b.posting_date < bounds.y_end THEN l.debit - l.credit ELSE 0 END), 0)::NUMERIC(18,2) AS ending_balance
  FROM public.gl_posting_lines l
  JOIN public.gl_journal_batches b ON b.id = l.batch_id
  CROSS JOIN bounds
  WHERE l.client_id = p_client_id
    AND b.posting_date < bounds.y_end
  GROUP BY l.account_id
  ORDER BY l.account_id;
$$;

REVOKE ALL ON FUNCTION public.get_canonical_trial_balance(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_canonical_trial_balance(TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
