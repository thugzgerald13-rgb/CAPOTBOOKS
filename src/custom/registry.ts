/**
 * src/custom/registry.ts — THE ONE FILE A DEVELOPER EDITS to ship a customization.
 *
 * Flow for a customer request ("Acme wants their own Sales page / a different
 * New Invoice button"):
 *   1. Create the customized page in src/custom/pages/  (copy _TemplatePage.tsx).
 *   2. Register it below with the slot it replaces (slot ids: SWAPPABLE_SLOTS in
 *      src/lib/uiVariants.ts).
 *   3. Deploy.
 *   4. Developer System Config -> "UI Variants": pick the user (or plan), pick the
 *      slot, choose your variant. Pick "Universal (default)" to swap back.
 *
 * Nothing changes for anyone until step 4. Users with no assignment keep the
 * universal UI, and a variant that crashes falls back to the universal UI.
 */
import { registerComponentVariant, registerActionVariant } from '../lib/uiVariants';
// import { FilePlus2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// PAGES / FEATURES — replace (or wrap) a universal page for specific users.
// `load` is lazy, so a variant adds nothing to the bundle users actually download
// unless they are assigned it.
// ---------------------------------------------------------------------------

// Pharmacy Product Management — fork of the universal Inventory page.
// Assigned from Developer System Config → UI Variants → slot `page.inventory`.
// Covers: medicine catalogue (generic/brand, strength, dosage, dosage form,
// SKU + multiple barcodes/QR, unit conversion, pricing/cost), barcode/QR-assisted
// registration (wedge scanner + optional camera, existing-match retrieval,
// duplicate guard), and barcode/QR-assisted receiving with supplier, lot/batch,
// expiry date, purchase cost and pack→base-unit conversion.
registerComponentVariant('page.inventory', {
  id: 'pharmacy-inventory',
  label: 'Pharmacy — Product Management & Receiving',
  description: 'Pharmacy fork of Inventory: medicine registry with barcode/QR-assisted registration and lot/batch receiving with expiry monitoring.',
  load: () => import('./pages/PharmacyInventory'),
});

// registerComponentVariant('page.sales', {
//   id: 'acme-sales',                       // stored in the database — never rename once assigned
//   label: 'Acme — Sales (with approval column)',
//   description: 'Wraps the universal Sales page and adds an approval banner.',
//   load: () => import('./pages/AcmeSales'),
// });

// ---------------------------------------------------------------------------
// BUTTONS — change label / icon / destination / behaviour, or hide a universal button.
// ---------------------------------------------------------------------------
// registerActionVariant('action.header.quick-add.billing', {
//   id: 'acme-new-tax-invoice',
//   label: 'Acme — "New Tax Invoice" opens custom billing',
//   override: { label: 'New Tax Invoice', icon: FilePlus2, page: 'billing' },
// });
//
// registerActionVariant('action.header.quick-add.files', {
//   id: 'hide-upload',
//   label: 'Hide Upload Receipt / File',
//   override: { hidden: true },
// });
//
// Custom behaviour instead of navigating:
// registerActionVariant('action.header.quick-add.sales', {
//   id: 'acme-sales-wizard',
//   label: 'Acme — open sales wizard',
//   override: { label: 'Quick Sale', onSelect: ({ navigateToPage }) => navigateToPage('sales') },
// });

// Keep the imports referenced so tooling does not flag an "unused" registry before first use.
void registerComponentVariant;
void registerActionVariant;
