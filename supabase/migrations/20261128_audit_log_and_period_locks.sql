-- Immutable BIR CAS Audit Trail & Server-Side Accounting Period Locks
-- Enforces RR No. 9-2009 / RMC No. 5-2021 append-only audit trail and
-- cross-device period locking for multi-user CAPOTBOOKS workspaces.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_client_created
  ON public.audit_logs (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action, created_at DESC);

-- Prevent UPDATE or DELETE at the database engine level (BIR CAS immutability)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted (BIR CAS compliance).';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "audit_logs_select_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_select_authenticated"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Server-side per-client accounting period lock
CREATE TABLE IF NOT EXISTS public.accounting_period_locks (
  client_id TEXT PRIMARY KEY,
  lock_date DATE NOT NULL,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "period_locks_select_authenticated" ON public.accounting_period_locks;
CREATE POLICY "period_locks_select_authenticated"
  ON public.accounting_period_locks
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "period_locks_upsert_authenticated" ON public.accounting_period_locks;
CREATE POLICY "period_locks_upsert_authenticated"
  ON public.accounting_period_locks
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
