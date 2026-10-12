# CAPOTBOOKS - Android Accounting & BIR Tax Compliance

CAPOTBOOKS is a comprehensive Philippine accounting and tax compliance application rewritten for Android using Kotlin and Jetpack Compose (Material Design 3).

## Key Features

1. **Financial Dashboard & KPI Monitoring**:
   - Real-time gross revenue, operating expenses, net income, cash in bank.
   - Working capital monitoring: Accounts Receivable (AR) vs. Accounts Payable (AP).
   - Bureau of Internal Revenue (BIR) upcoming tax alerts and compliance reminders.

2. **Sales Invoicing & Official Receipts**:
   - Invoicing with Philippine tax classification: 12% VAT Registered, Non-VAT (Percentage Tax), Zero-Rated, and VAT Exempt.
   - Automatic deduction of Expanded Withholding Tax (Creditable WHT BIR Form 2307) using standard ATC codes (WC010, WC020, WC030, WC040, WC050, WC060, WC080, WC100).
   - Real-time customer search by buyer name, TIN, or invoice reference number.

3. **Purchases & Accounts Payable**:
   - Track invoiced expenses, miscellaneous payments, and AP dues.
   - Automatic 12% Input VAT calculation and tax credit verification.
   - Supplier TIN tracking and expense categorization.

4. **Statements of Account (SOA) & Billing**:
   - Client billing statements with due dates, amounts, and recurring frequency.
   - Quick "Mark as Paid" status toggle.

5. **Double-Entry Journal Vouchers (JV)**:
   - General Journal adjustments with balanced Debit and Credit validation.
   - Automatic posting to the General Ledger.

6. **Books of Accounts (BIR Compliant)**:
   - Sales Journal (SJ)
   - Purchases Journal (PJ)
   - Cash Receipts Journal (CRJ)
   - Cash Disbursements Journal (CDJ)
   - General Ledger (GL)

7. **Philippine Standard Chart of Accounts (COA)**:
   - Assets (1000s), Liabilities (2000s), Equity (3000s), Revenue (4000s), Direct Costs (5000s), Operating Expenses (6000s).
   - Normal side designations (Debit / Credit) and running balances.

8. **Audited Financial Statements (AFS)**:
   - Statement of Comprehensive Income (Profit & Loss)
   - Statement of Financial Position (Balance Sheet)
   - Statement of Cash Flows
   - Trial Balance

9. **Fixed Asset Lapsing Schedule (PPE)**:
   - Straight-Line, Declining Balance, and Sum-of-Years depreciation methods.
   - Cost, salvage value, useful life, accumulated depreciation, and net book value.

10. **BIR Compliance & TIN Directory**:
    - Tax calendar with statutory filing deadlines (BIR Forms 2550Q, 1701Q, 1601-C, 0619-E).
    - Unified Customer and Supplier TIN directory with validation.

11. **Business Profile (COR 2303)**:
    - Official taxpayer registration parameters: Registered Name, Trade Name, TIN, Taxpayer Classification, RDO Code, and registered address.

## Architecture

- **Language:** Kotlin
- **UI Framework:** Jetpack Compose (Material Design 3)
- **Architecture Pattern:** MVVM (Model-View-ViewModel) with unidirectional data flow
- **Local Persistence:** Room Database (`CapotDatabase`) with reactive Kotlin Coroutines `Flow`
- **Build System:** Gradle (Kotlin DSL, Version Catalog `libs.versions.toml`)

## Building & Running

1. **Prerequisites:** Android Studio Ladybug or later, JDK 21, Android SDK 36.
2. **Build Debug APK:**
   ```bash
   gradle :app:assembleDebug
   ```
3. Output APK location:
   `app/build/outputs/apk/debug/app-debug.apk`
