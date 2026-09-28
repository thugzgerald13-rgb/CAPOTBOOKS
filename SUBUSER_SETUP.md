# Team & Subusers — Hybrid Model Setup & Usage

CAPOT supports **two ways** to add people to your account. Both share the
account holder's clients, books, files and reports, each with their own login
and role.

| | **Invite (their own account)** | **Create managed login** |
|---|---|---|
| Best for | Accountants, partners, external staff | Employees / cashiers who don't want to sign up |
| Who owns the account | **The invitee** — fully independent | **You** created the login |
| At invite time | A pending invitation is created (no account) | A CAPOT login is created immediately |
| Next step | They sign in with **their own** account and accept | You share the temporary password with them |
| Can they leave / keep data? | Yes — they leave and keep their own account | Login is disabled/removed but preserved |
| You can reset their password? | No (they own it) | Yes, one-time temporary password |

## 1. Apply the database migrations (required, one-time, in order)

The frontend cannot create auth users with the anon key, so everything runs
through `SECURITY DEFINER` Postgres RPCs. Apply both files once, **in order**:

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of `scripts/subusers_migration.sql` → **Run**.
3. Open another **New query**, paste `scripts/subusers_invites_migration.sql`
   → **Run**. Both are idempotent — safe to re-run.

What the second migration adds:
- `account_members.member_kind` — `'managed'` (you created the login) or
  `'independent'` (they own their account).
- `public.account_invitations` — pending independent invites (expire after
  7 days). No auth.users row is created until the invitee accepts.
- New RPCs: `send_independent_invite`, `list_my_invitations`,
  `revoke_invitation`, `list_my_pending_invites`, `accept_invitation`,
  `decline_invitation`, `leave_my_membership`.
- `invite_subuser`, `list_my_subusers`, `get_my_account_membership` are
  redefined to carry `member_kind` (backward compatible).

Verify:
```sql
select * from public.list_my_invitations();
select * from public.list_my_pending_invites();
select * from public.get_my_account_membership();
```

> If you skip these, the app still works exactly as before. The **Team &
> Subusers** page shows a "not enabled yet" banner with these instructions.

## 2. Add someone — two modes

Sign in as the Business Owner or Accountant. Sidebar → **Settings** →
**Team & Subusers**. Pick a mode at the top:

### A. Invite (their own account) — recommended for accountants/partners
1. Enter email, display name, role → **Send Invitation**.
2. A shareable **invitation link + code** is shown once. Send it to them.
3. They sign in (or sign up) with **their own** CAPOT account, open the link,
   and click **Accept**. Their account stays fully theirs.
4. Pending invites appear in the **Pending invitations** list — revoke anytime.
5. Once accepted they appear in **Team members** with an "Own account" badge.
   Removing them only severs the link — their account and data are untouched.

### B. Create managed login — for staff who don't sign up
1. Enter email, display name, role → **Create Login**.
2. If the email is **new**, a CAPOT login is created and a **one-time
   temporary password** is shown exactly once. Share it securely. They sign in
   with email + temp password, then change it in Settings → Account Settings.
3. If the email **already has** a CAPOT login, it is linked immediately (no
   password shown; they keep their existing password) and marked as managed.
4. Managed members show a "Managed login" badge. You can **reset their
   password** (Key icon) at any time.

## 3. Manage the team

For each member (both kinds) you can:
- **Change role** inline (dropdown).
- **Disable / enable access** (Ban icon) — toggles access to *your* account;
  their login is kept.
- **Remove** (Trash icon) — unlinks them; their login is kept.
- **Reset password** (Key icon) — **managed logins only**. Independent members
  own their password.

## 4. As a team member (subuser view)

- A banner shows whose account you are on, your role, and whether you are on
  your own independent account or a managed login.
- If **independent**, a **Leave this account** button returns you to your own
  workspace — your account stays fully intact.
- New invitations addressed to your email appear at the top with
  **Accept / Decline** buttons.
- Subusers cannot invite or remove members.

## 5. How data sharing works (unchanged)

- Every member shares the account holder's `clients`, all child tables, and
  the `client-files` Storage bucket, via `current_account_owner()` +
  `is_client_owner()`.
- Per-user preferences (theme, sidebar collapsed, active client) stay private
  to each login (stored on their own `profiles` row).
- A subuser cannot create or delete `clients` (RLS restricted to the real
  owner); they work inside the owner's existing clients.
- A user can be an active member of **one** account at a time; accepting a new
  invite while already a member of another requires leaving the first one.
