-- CAPOTBOOKS — Remove the automatic function cap on managed Staff logins
--
-- BEFORE: the 'staff' role could only ever be granted edit_transactions and
--         view_reports. Every other function (delete, approve, settings,
--         export, lock period …) and the sidebar modules that depend on them
--         were silently blocked by the server, even if the owner ticked them.
--
-- AFTER:  'staff' may be granted any capability EXCEPT manage_users. The
--         account owner now decides, per client, exactly what a staff login
--         can use (Team & Subusers → Manage access). manage_users stays
--         owner-only so a staff login can never invite/remove people.
--
-- Nothing is granted automatically: existing grants are untouched. Staff only
-- gain access to what the owner explicitly ticks afterwards.
--
-- Run once in Supabase → SQL Editor. Idempotent — safe to re-run.
-- Requires scripts/client_specific_permissions.sql to have been applied.

create or replace function public.team_role_allows_permission(
  p_role text,
  p_permission text
)
returns boolean
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'accountant' then p_permission in (
      'edit_transactions', 'delete_transactions', 'approve_journal',
      'view_reports', 'export_data', 'lock_period'
    )
    when 'bookkeeper' then p_permission in (
      'edit_transactions', 'view_reports', 'export_data'
    )
    -- Staff: no fixed cap. Owner grants per client; manage_users excluded.
    when 'staff' then p_permission in (
      'edit_transactions', 'delete_transactions', 'approve_journal',
      'view_reports', 'manage_settings', 'export_data', 'lock_period'
    )
    when 'viewer' then p_permission in (
      'view_reports', 'export_data'
    )
    else false
  end;
$$;

revoke all on function public.team_role_allows_permission(text, text) from public;
grant execute on function public.team_role_allows_permission(text, text) to authenticated;

-- Verify (expect all true except manage_users = false):
-- select p, public.team_role_allows_permission('staff', p)
-- from unnest(array['manage_users','edit_transactions','delete_transactions',
--   'approve_journal','view_reports','manage_settings','export_data','lock_period']) p;
