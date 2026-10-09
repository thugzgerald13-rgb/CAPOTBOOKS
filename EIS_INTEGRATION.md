# BIR E-Invoicing (EIS) Integration — CAPOTBOOKS

This package makes CAPOTBOOKS ready for the **BIR Electronic Invoicing System (EIS)** mandated by **RR No. 11-2025 (as amended by RR No. 26-2025)** and operationalised by **RMC No. 98-2026 (22 September 2026)**, with a first-group **issuance** deadline of **31 December 2026**. Reference: <https://bir-eis.ph/> and the EIS Certification Portal <https://eis-cert.bir.gov.ph/>.

## Two duties — keep them apart (RMC 98-2026)

| Duty | Statute | Status (Oct 2026) | Gating |
| --- | --- | --- | --- |
| **Issue** structured e-invoices to buyers | NIRC s.237 (RA 12066) | **Mandatory from 31 Dec 2026** for covered taxpayers | **PTI** (Permit to Issue) Electronic Invoice before first e-invoice; **EIS Certification** within 6 months of PTI |
| **Report** sales data to BIR EIS | NIRC s.237-A | **Not yet operative** — waits for separate BIR implementing rules | **PTT** (Permit to Transmit) only upon Commissioner's directive |

The 31 Dec 2026 deadline is for **issuance**. Your system must still be **capable** of extracting and transmitting the structured data — that is what EIS Certification tests. PDFs, scans, and invoices made in Word/Excel/Google Docs/Sheets are **not** valid e-invoices. Micro taxpayers (gross sales < PHP 3,000,000/yr) are **exempt** and may adopt voluntarily.

## What changed (this patch)

### Modified files (existing EIS scaffolding updated for RMC 98-2026)
| File | Change |
| --- | --- |
| `src/lib/eisTypes.ts` | Added `EisCoveredCategory`, `EisDeliveryMethod`, `EisCertificationTests`, constants (`EIS_ISSUANCE_THRESHOLD_PHP=500`, `EIS_BUYER_DETAIL_THRESHOLD_PHP=1000`, `EIS_MICRO_EXEMPTION_THRESHOLD_PHP`, `EIS_CERTIFICATION_WINDOW_MONTHS=6`). `EisSeller` gains `TradeName`, `VatRegistered`, ATP permit/series fields. `EisSummary` gains per-ATC `WithholdingTaxes[]` + `NetPayable`. `EisInvoiceJson` gains `DocumentLabel`, `DeliveryMethod`, `DeliveredAt`, `DeliveryReference`. `EisSettings` gains `coveredCategory`, `permitToIssueNumber`, `permitToIssueDate`, `certificationTests`, `defaultDeliveryMethod`; `permitToTransmitNumber` retained as future s.237-A only. |
| `src/lib/eisBuilder.ts` | `buildSeller` populates `VatRegistered`/`TradeName`/ATP fields. `buildEisInvoice` sets `DocumentLabel` and `DeliveryMethod`. `validateEisInvoice` adds: electronic-delivery check (RMC 98-2026 IV.4(b)), buyer-details-above-PHP 1,000 (RR 7-2024), PHP 500 issuance threshold (EOPT s.237), and VAT-registered seller output-VAT check. |
| `src/components/EisCenter.tsx` | Compliance banner rewritten (RMC 98-2026, PTI, issuance vs reporting, micro exemption). Settings tab: covered-taxpayer selector, PTI number + issue date, EIS cert number, PTT (labelled future), default delivery method selector. Default settings include `coveredCategory` + `defaultDeliveryMethod`. |
| `scripts/eis_migration.sql` | `eis_settings` gains `covered_category`, `permit_to_issue_number`, `permit_to_issue_date`, `certification_tests jsonb`, `default_delivery_method`. Header updated. |
| `supabase/functions/eis-transmit/index.ts` | Secrets doc updated (adds `EIS_SIGNING_KEY_ID`); note on RMC 98-2026 reporting status. |

### Newly wired files (EIS was scaffolded but not connected to the app)
| File | Change |
| --- | --- |
| `src/App.tsx` | Lazy route `/eis-center` -> `<EisCenter />` |
| `src/components/Sidebar.tsx` | "E-Invoicing (EIS)" entry under the BIR collapsible; search-index entry; `pagePermission('eis-center') = edit_transactions` |
| `src/lib/pagePermissions.ts` | `/eis-center` requires `edit_transactions` |
| `src/types.ts` | `Sale` and `BillingInvoice` gain `eisUniqueId`, `eisDocType`, `eisStatus`, `eisAckCode`, `eisSubmittedAt` |
| `src/components/Billing.tsx` | Per-invoice EIS status badge (Queued/Submitted/Accepted/Rejected/Cancelled) + "EIS" quick-action button opening the EIS center |
| `.env.example` | `VITE_EIS_ENVIRONMENT`, `VITE_EIS_USE_EDGE_PROXY` |

### Unchanged (already correct in the scaffold)
`src/lib/eisApi.ts`, `src/lib/eisCrypto.ts`, `src/lib/eisStore.ts` — the sign/encrypt/transmit pipeline and persistence layer required no functional change for RMC 98-2026.

## How it works (the EIS flow)
1. **Classify** — set your covered-taxpayer category in Settings. Micro taxpayers (<PHP 3M) are exempt; everyone in Wave 1 (e-commerce, LTS/large, CAS/CBA/invoicing-software users) must comply.
2. **Build** — a billing invoice is converted to the BIR v2.01 structured JSON (CAS schema). `EisUniqueId` = `TIN(9) + BranchCode(5) + YYYYMMDD(8) + Seq(2)`. VAT is split into vatable (12%), zero-rated, and exempt buckets; totals reconciled.
3. **Validate** — the builder validates TIN/branch format, `EisUniqueId` length, per-line math, summary totals, electronic delivery method, buyer-details-above-PHP 1,000, and the PHP 500 issuance threshold — catching `SYN004`, `ERR002`, `ERR004`, `ERR001` before transmission.
4. **Issue to buyer** — deliver the e-invoice electronically (email/online/QR/app/web) — required by RMC 98-2026 IV.4(b). A printed copy alone is not valid.
5. **Sign** — each invoice JSON is signed as a compact **JWS (RS256)** with the taxpayer's private signing key.
6. **Encrypt** — a random **AES-256-GCM** session key wraps the signed payload; the session key itself is wrapped (**RSA-OAEP**) with the BIR public key.
7. **Submit (certification / future reporting)** — 1-100 invoices per POST, carrying an **HMAC-SHA256** request signature (Application Key as secret) and a 6-hour auth token. In production this runs in the `eis-transmit` edge function from a whitelisted IP.
8. **Inquire** — poll (or receive callback for) per-invoice ack codes; `ACC*` = accepted, `SYN*/ERR*` = rejected -> fix and resend.
9. **Retain** — JSON, JWS, and BIR acknowledgments are stored in `eis_transmissions` for the **10-year** retention period.

## Go-live checklist
1. Run `scripts/eis_migration.sql` against your Supabase database.
2. **Apply for the PTI** (Permit to Issue Electronic Invoice) at your RDO / Large Taxpayer Office — one PTI per invoicing system, evaluated within 20 working days. (Distinct from CAS Permit to Use.)
3. Sign up at **eis-cert.bir.gov.ph** using BIR Form 2303 details; create an application (CAS or CRM/POS) and generate the Application Key + signing key pair. Download the latest API guide + BIR public key from the portal.
4. In CAPOTBOOKS -> **BIR -> E-Invoicing (EIS) -> Settings**: set covered category, paste the Application Key, set TIN + Branch Code, choose delivery method, environment = Sandbox.
5. Pass the **5 mandatory EIS Certification tests** (Authentication, Invoice Issuance, Inquiry Result, Error Handling, Batch Transmission; 7 with API callback) using the Transmit Queue — **within 6 months of the PTI**, or the PTI may be revoked.
6. Request the **EIS Certificate**. (The **PTT** / Permit to Transmit for s.237-A reporting is only needed once the BIR issues separate rules.)
7. Deploy `supabase/functions/eis-transmit`; set secrets `EIS_APP_KEY`, `EIS_SIGNING_PRIVATE_JWK`, `EIS_BIR_PUBLIC_JWK`, `EIS_SIGNING_KEY_ID`, `EIS_ENVIRONMENT=production`.
8. Whitelist the edge function's fixed egress IP(s) on the EIS Certification Portal.
9. Flip environment to Production and `useEdgeProxy = true`. Once the BIR activates s.237-A reporting, transmit within **3 calendar days** of each invoice date.

> **Note:** Endpoint paths, header names, and field names follow the published EIS API Development Guide and JSON format v2.01. Always download the latest guides from the Certification Portal > Downloads before go-live and adjust `eisTypes.EIS_ENDPOINTS` / the edge function if the BIR has revised them.
