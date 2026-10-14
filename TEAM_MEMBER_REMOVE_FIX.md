# CAPOTBOOKS — Remove/Delete Team Member Not Working: Root Cause & Fix

## Symptom
In Team & Subusers, clicking **Remove** (confirming the dialog) appears to do
nothing — the member stays in the list. The Disable toggle works, but Remove
does the same thing as Disable.

## Root Cause
Remove for **managed staff** goes through `src/lib/subusers.ts → removeSubuser()`,
which calls the `managed-staff` Edge Function (`action: 'remove'`) first and
**returns early on success** — the `remove_subuser` RPC (which actually
*deletes* the `account_team_links` row) never runs.

But the edge function's `remove` action
(`supabase/functions/managed-staff/index.ts`) only did:

```ts
.from('account_team_links')
.update({ status: 'disabled', ... })   // ← update, NOT delete
```

And every version of `list_my_subusers()` selects
`where l.owner_user_id = auth.uid()` with **no `status = 'active'` filter** —
so a disabled link still shows up in the team list. Result: Remove and Disable
were identical; the member never disappeared.

(Independent / invited professional accounts bypass the edge function and call
`remove_subuser` directly, so they were removed correctly — only managed staff
were affected.)

## Fixes Applied

### 1. `supabase/functions/managed-staff/index.ts` — Remove deletes the link
Changed the `account_team_links` operation from `.update({status:'disabled'})`
to `.delete()`. The managed credential is still disabled (`is_active=false`) so
the login can no longer be resolved/used.

### 2. `src/lib/subusers.ts` — `removeSubuser` always runs the delete RPC
The edge function call is now **best-effort** (credential disable only); the
`remove_subuser` RPC always runs afterward and is the source of truth for
actually severing the link. If the edge function already deleted it, the RPC's
"Team member not found" is treated as success. This makes Remove work even if
the deployed edge function is still the old build.

## Deploy steps
```bash
# redeploy the edge function (required for fix #1; fix #2 works without it)
npx supabase functions deploy managed-staff

# ensure the newest remove_subuser RPC is applied (handles pending-invite
# revocation; if your DB only has subusers_invites_migration.sql's version,
# revoking a still-pending invitation will fail with "Team member not found")
psql "$DATABASE_URL" -f scripts/fix_invited_accountant_team_list.sql

npm run build
```

## Verify
Owner → Team & Subusers → Remove a managed staff member → confirm → member
disappears immediately (the UI already calls `refreshTeamMembers()` after
removal). Re-creating the same login via "Add Staff" works (link is deleted,
not just disabled, so upsert re-creates it cleanly).

## Files Changed
- `supabase/functions/managed-staff/index.ts`
- `src/lib/subusers.ts`
- `TEAM_MEMBER_REMOVE_FIX.md` (this file)
