-- ============================================================================
-- self_delete_account.sql — allow a signed-in user to permanently delete their
-- own account from Account Settings ("Delete Account" danger zone).
--
-- NOTE: For the complete fix that also updates audit_logs / RELIEF / Alphalist
-- triggers, non-cascading foreign keys, Storage object ownership, and
-- developer subscriber deletion, run scripts/fix_permanent_account_deletion.sql
-- in the Supabase SQL editor.
--
-- Security model:
--   SECURITY DEFINER (postgres owner can delete from auth.users).
--   Caller may ONLY delete auth.uid() — no target-id parameter, so one user
--   cannot delete another. The developer account is explicitly protected.
--
-- After the RPC succeeds, the client signs out (the session is now invalid).
-- ============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  -- Protect the developer account from self-deletion.
  if caller_email = lower('thugz.gerald13@gmail.com') then
    raise exception 'The developer account cannot be deleted here';
  end if;

  if to_regprocedure('public._permanently_delete_user_account(uuid)') is not null then
    perform public._permanently_delete_user_account(auth.uid());
    return;
  end if;

  perform set_config('app.account_deletion', 'true', true);
  perform set_config('app.relief_allow_amend', 'on', true);
  perform set_config('app.alphalist_amend', 'true', true);

  delete from public.profiles where id = auth.uid();
  delete from auth.users    where id = auth.uid();

  if not found then
    raise exception 'Account was not deleted';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- Verify (destructive — only run as the user you intend to delete):
--   select public.delete_my_account();
