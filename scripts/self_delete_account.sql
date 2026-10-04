-- ============================================================================
-- self_delete_account.sql — allow a signed-in user to permanently delete their
-- own account from Account Settings ("Delete Account" danger zone).
--
-- Run this in the Supabase SQL editor. Companion to developer_user_controls.sql
-- (which is developer-only and forbids self-deletion).
--
-- Security model:
--   SECURITY DEFINER (postgres owner can delete from auth.users).
--   Caller may ONLY delete auth.uid() — no target-id parameter, so one user
--   cannot delete another. The developer account is explicitly protected.
--   Tables referencing auth.users / public.profiles with ON DELETE CASCADE
--   (declared in schema.sql / subusers migrations) are removed automatically.
--
-- After the RPC succeeds, the client signs out (the session is now invalid).
-- ============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
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
