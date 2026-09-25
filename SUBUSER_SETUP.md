# Subusers / Team Members — Setup & Usage

CAPOT now supports **subusers**: a Business Owner or Accountant account holder
can invite team members (Accountant / Bookkeeper / Staff / Viewer) who share
the account holder's clients, books, files and reports, each with their own
login.

## 1. Apply the database migration (required, one-time)

The frontend cannot create auth users with the anon key, so subuser creation
runs through `SECURITY DEFINER` Postgres RPCs. Apply them once:

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of `scripts/subusers_migration.sql`.
3. Click **Run**. It is idempotent — safe to re-run.

What it does:
- Adds `account_owner_id`, `member_role`, `member_status` to `public.profiles`.
- Creates `public.account_members` (owner ↔ subuser links) with RLS.
- Adds `public.current_account_owner()` and redefines
  `public.is_client_owner(client_id)` so **all existing child-table and Storage
  RLS policies automatically grant subusers access** to the owner's data.
- Recreates `public.clients` policies so subusers can read/update clients but
  cannot create or delete them.
- Creates the RPCs: `invite_subuser`, `list_my_subusers`,
  `update_subuser_role`, `set_subuser_status`, `remove_subuser`,
  `reset_subuser_password`, `get_my_account_membership`.

Verify:
```sql
select public.current_account_owner();
select * from public.get_my_account_membership();
```

> If you skip this step, the app still works exactly as before. The
> **Team & Subusers** page will show a "not enabled yet" banner with these
> instructions.

## 2. Invite a subuser

1. Sign in as the Business Owner or Accountant (the account holder).
2. Sidebar → **Settings** → **Team & Subusers**.
3. Enter the teammate's email, display name, and role:
   - **Accountant** — full access to books, reports and compliance.
   - **Bookkeeper** — data entry across sales, purchases, journals.
   - **Staff** — limited day-to-day transaction entry.
   - **Viewer** — read-only.
4. Click **Invite Subuser**.

- If the email is **new**, a CAPOT login is created and a **one-time temporary
  password** is shown exactly once. Copy it and share it securely. The teammate
  signs in with email + temporary password, then changes it from
  **Settings → Account Settings**.
- If the email **already has** a CAPOT login, it is linked to your account
  immediately (no password is shown; they keep their existing password).

## 3. Manage the team

On the same page, for each member you can:
- **Change role** inline (dropdown).
- **Reset password** (Key icon) — a new one-time temporary password is shown.
- **Disable / enable access** (Ban icon) — toggles access to *your* account;
  their login is kept.
- **Remove** (Trash icon) — unlinks them from your account; their login is
  kept.

Subusers see a read-only banner showing whose account they are on and their
role; they cannot invite or remove members.

## 4. How data sharing works

- Every subuser shares the account holder's `clients`, all child tables, and
  the `client-files` Storage bucket, via `current_account_owner()` +
  `is_client_owner()`.
- Per-user preferences (theme, sidebar collapsed, active client) stay private
  to each login (stored on their own `profiles` row).
- A subuser cannot create or delete `clients` (RLS restricted to the real
  owner); they work inside the owner's existing clients.

## 5. Removing / disabling

- **Disable** sets `account_members.status = 'disabled'`; the next sign-in
  resolves `current_account_owner()` to themselves, so they see only their own
  (empty) account — your data is no longer visible.
- **Remove** deletes the membership row and clears the `profiles` member
  columns. The `auth.users` login is never deleted by these RPCs.
