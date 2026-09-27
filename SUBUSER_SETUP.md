# Team & Subusers — Independent Account Architecture

## Key Fix
**No more owned/subordinate accounts.** Every user retains full ownership of their account. Invitations grant *access permissions*, not account ownership.

## How It Works
1. **You** send an invitation → pending record created (no account created)
2. **They** receive email → click link → log in or sign up → THEIR account
3. On accept → a `team_members` entry links **their independent account** to your team
4. They see your workspace alongside any of their own workspaces

## Clean Separation
- ✅ Removing their access → only severs the link, **their account stays intact**
- ✅ Suspending your account → does **not** affect theirs
- ✅ They can join multiple teams from different owners
- ✅ Billing, profile, and security settings remain per-account

## Migration
- Replace old `subusers` table with `team_members`
- Run `schema.sql` to apply new tables
- Existing members: convert ownership records to membership records
