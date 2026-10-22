-- ============================================================================
-- Alphalist Data Entry & Validation (BIR Alphalist v7.4 reverse-engineered).
-- One row per payee/employee alphalist detail line, mirroring the original
-- Visual FoxPro `alphadtl.dbf` fields actually bound on the 1600 / 1601E /
-- 1601F data-entry forms (see FORMS/*de.SCT ControlSource extraction).
-- Safe to re-run.
-- ============================================================================

create table if not exists public.alphalist_entries (
  id text primary key,
  client_id text not null,
  form_type text not null,                    -- '1600' | '1601E' | '1601F'
  return_period date not null,                -- month being reported (first of month)
  schedule_num text not null default 'D1',    -- alphadtl.schedule_num (e.g. D1, D2)
  sequence_num integer not null,              -- alphadtl.sequence_num, auto per period+schedule
  tin text not null,                          -- alphadtl.tin (9 digits, validated: starts 0/1/2/3/4/9)
  branch_code text,                           -- alphadtl.branch_code (4 chars)
  registered_name text,                       -- alphadtl.registered_name (corporate payees)
  last_name text,                             -- alphadtl.last_name (individual payees)
  first_name text,                            -- alphadtl.first_name
  middle_name text,                           -- alphadtl.middle_name
  atc_code text not null,                     -- alphadtl.atc_code (validated against reg_atcs)
  tax_rate numeric(8,4) not null default 0,   -- alphadtl.tax_rate (auto from ATC)
  income_payment numeric(18,2) not null default 0,  -- alphadtl.income_payment
  actual_amt_wthld numeric(18,2) not null default 0, -- alphadtl.actual_amt_wthld (auto = income_payment * tax_rate)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alphalist_entries_client on public.alphalist_entries(client_id);
create index if not exists idx_alphalist_entries_period on public.alphalist_entries(client_id, form_type, return_period);
