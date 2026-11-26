# CAPOTBOOKS — Custom pages & buttons per user ("UI Variants")

A developer can build a customized version of any existing page or quick-add
button and swap it in **only for the users (or plan) that asked for it**. Everyone
else keeps the universal UI. No redeploy is needed to swap a user back and forth.

```
 universal UI (today)            customized variant (new code you write)
        │                                   │
        └──────── slot  "page.sales" ───────┘
                       │
   Supabase: app_ui_variant_assignments  (user / plan  →  slot  →  variant id)
                       │
   resolution: user → account owner → plan → universal
```

## 1. One-time setup
1. Supabase SQL Editor → run `scripts/ui_variant_assignments.sql` (safe to re-run).
2. Deploy this build. Nothing changes for anyone yet (no variants registered).

## 2. When a customer asks for a customization
1. **Build it** — copy `src/custom/pages/_TemplatePage.tsx` to e.g.
   `src/custom/pages/AcmeSales.tsx` and edit. Three patterns (see template header):
   *extend* (wrap `<Universal />`), *replace* (build from scratch with the same
   hooks/ui kit), or *fork* (copy the universal page source and edit).
2. **Register it** in `src/custom/registry.ts`:
   ```ts
   registerComponentVariant('page.sales', {
     id: 'acme-sales',            // stored in the DB — never rename once assigned
     label: 'Acme — Sales',
     load: () => import('./pages/AcmeSales'),
   });
   ```
   For a button:
   ```ts
   registerActionVariant('action.header.quick-add.billing', {
     id: 'acme-new-tax-invoice',
     label: 'Acme — New Tax Invoice',
     override: { label: 'New Tax Invoice', icon: FilePlus2, page: 'billing' },
     // or { hidden: true }  or  { onSelect: ({ navigateToPage }) => ... }
   });
   ```
3. **Deploy.**
4. **Assign it** — Developer System Config → *UI Variants*: choose a user (or a
   plan), choose the slot, select your variant. Choose *Universal (default)* to
   swap back. The user sees it on next load/refocus.

**Preview before the customer sees it:** assign the variant to your own developer
account first.

## 3. What can be swapped today
| Kind | Slots | Notes |
|---|---|---|
| Pages | 43 slots, `page.<route>` — every content route (Sales, Billing, Purchases, Journal Voucher, History, Files, Inventory, Payroll, all books/journals/ledgers, all reports & AFS, BIR Forms, Relief, Alphalist, Compliance, EIS, COA, Business/Clients/TIN, Team, Account Settings…) | Full list: `SWAPPABLE_SLOTS` in `src/lib/uiVariants.ts`. `page.purchases` covers all three Purchases sub-routes; `page.files` covers `/files/*`. Sidebar buttons open these routes, so they open the swapped page automatically. |
| Buttons | `action.header.quick-add.{billing,purchases,sales,journal-voucher,files}` — the header **+ New** menu | relabel, re-icon, retarget, custom `onSelect`, or hide |

**Make something new swappable** (e.g. a card or section inside a page):
1. Add a row to `SWAPPABLE_SLOTS` (`kind: 'component'`).
2. Replace its use with `<Swappable slot="component.xyz" Universal={XYZ} componentProps={{...}} />`.
3. Register variants as above. For another button: `applyActionOverride('action.<id>', base)` as in `Header.tsx`.

## 4. Safety guarantees
- **Access is never widened.** Page variants render *inside* `RequirePermission`
  (role permissions, granular module permissions, feature visibility, paid-module
  locks). A variant only changes what is drawn.
- **No remote code.** The database stores ids only. Unknown ids → universal UI.
  Variant code is part of your reviewed, deployed bundle.
- **Fail-safe.** A variant that throws renders the universal UI instead; a missing
  migration / failed RPC → everyone gets the universal UI.
- **Assignment API is developer-only** (same email check as the existing feature-rule RPCs).
  Table has RLS with no direct client access.
- Team members inherit their **account owner's** assignments (plus the owner's plan).
- Data access is unchanged: variants use the same context/hooks, so Supabase RLS
  and per-client permissions still apply. Do not put secrets in variant code.

## 5. Not covered (by design / follow-up)
- **Sidebar button labels/icons.** Sidebar buttons are hand-written individually and
  all navigate to routes, so they open swapped pages automatically; renaming or
  hiding an individual sidebar button is not yet a slot.
- **Buttons inside pages** (e.g. the "Save" button inside Sales). Use the *fork*
  pattern, or add a `component` slot around that section.
- Developer/admin routes (`/developertools/*`, `/admin/payments`, `/diagnostics`)
  and the standalone `/plan-billing` page are intentionally not swappable.
- `Dashboard.tsx` defines a `quickActions` list that is not rendered anywhere, so
  there is no dashboard button to swap yet.
- The slot catalog and assignments are per **user / plan**. A per-client-profile scope
  would need an extra `scope_type` in the SQL.

## 6. Rollback
Developer System Config → UI Variants → set the slot to *Universal (default)*, or
`delete from public.app_ui_variant_assignments where slot_id = 'page.sales';`

## Files in this change
| File | Change |
|---|---|
| `scripts/ui_variant_assignments.sql` | new — table + `get_my_ui_variants`, developer get/set RPCs |
| `src/lib/uiVariants.ts` | new — slot catalog, registry, per-user resolver, developer API |
| `src/components/Swappable.tsx` | new — renders universal or assigned variant (+ crash fallback) |
| `src/components/VariantAssignmentsPanel.tsx` | new — developer assignment UI |
| `src/custom/registry.ts` | new — **the file you edit** to register variants |
| `src/custom/pages/_TemplatePage.tsx` | new — starting point for a custom page |
| `src/App.tsx` | 45 routes wrapped in `<Swappable>`; registry import |
| `src/components/Header.tsx` | quick-add buttons go through `applyActionOverride` |
| `src/components/AdminSettings.tsx` | mounts `VariantAssignmentsPanel` |
