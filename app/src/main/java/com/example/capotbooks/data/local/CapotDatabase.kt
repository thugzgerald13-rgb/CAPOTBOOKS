package com.example.capotbooks.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.capotbooks.model.AssetLapsingEntry
import com.example.capotbooks.model.BillingInvoice
import com.example.capotbooks.model.BusinessProfile
import com.example.capotbooks.model.CoaAccount
import com.example.capotbooks.model.Expense
import com.example.capotbooks.model.GeneralLedgerEntry
import com.example.capotbooks.model.JournalVoucher
import com.example.capotbooks.model.JournalVoucherLine
import com.example.capotbooks.model.Purchase
import com.example.capotbooks.model.Sale
import com.example.capotbooks.model.TaxDeadline
import com.example.capotbooks.model.TinEntry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        BusinessProfile::class,
        Sale::class,
        Purchase::class,
        BillingInvoice::class,
        Expense::class,
        CoaAccount::class,
        JournalVoucher::class,
        JournalVoucherLine::class,
        GeneralLedgerEntry::class,
        AssetLapsingEntry::class,
        TaxDeadline::class,
        TinEntry::class
    ],
    version = 1,
    exportSchema = false
)
abstract class CapotDatabase : RoomDatabase() {
    abstract fun accountingDao(): AccountingDao

    companion object {
        @Volatile
        private var INSTANCE: CapotDatabase? = null

        fun getDatabase(context: Context, scope: CoroutineScope): CapotDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    CapotDatabase::class.java,
                    "capot_books_database"
                )
                    .addCallback(CapotDatabaseCallback(scope))
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }

    private class CapotDatabaseCallback(
        private val scope: CoroutineScope
    ) : RoomDatabase.Callback() {
        override fun onCreate(db: SupportSQLiteDatabase) {
            super.onCreate(db)
            INSTANCE?.let { database ->
                scope.launch(Dispatchers.IO) {
                    populateInitialData(database.accountingDao())
                }
            }
        }

        private suspend fun populateInitialData(dao: AccountingDao) {
            // Seed Profile
            dao.saveBusinessProfile(
                BusinessProfile(
                    name = "CAPOT ENTERPRISE",
                    tin = "234-567-890-000",
                    taxpayerClassification = "Individual - VAT",
                    tradeName = "Capot Accounting & Tax Services",
                    rdoCode = "047",
                    city = "Makati City"
                )
            )

            // Seed Philippine Standard Chart of Accounts
            val defaultAccounts = listOf(
                // Assets (1000)
                CoaAccount("1010", "1010", "Cash in Bank", "Asset", "debit", 250000.00),
                CoaAccount("1020", "1020", "Petty Cash Fund", "Asset", "debit", 15000.00),
                CoaAccount("1030", "1030", "Accounts Receivable", "Asset", "debit", 85000.00),
                CoaAccount("1040", "1040", "Prepaid Rent", "Asset", "debit", 30000.00),
                CoaAccount("1050", "1050", "Input VAT (12%)", "Asset", "debit", 12400.00),
                CoaAccount("1510", "1510", "Office Equipment", "Asset", "debit", 120000.00),
                CoaAccount("1520", "1520", "Accumulated Depreciation - Equipment", "Asset", "credit", 24000.00),

                // Liabilities (2000)
                CoaAccount("2010", "2010", "Accounts Payable", "Liability", "credit", 45000.00),
                CoaAccount("2020", "2020", "Output VAT (12%)", "Liability", "credit", 28800.00),
                CoaAccount("2030", "2030", "Withholding Tax Payable (1601-C)", "Liability", "credit", 5200.00),
                CoaAccount("2040", "2040", "Expanded Withholding Tax (1601-EQ)", "Liability", "credit", 3100.00),

                // Equity (3000)
                CoaAccount("3010", "3010", "Owner's Equity / Capital", "Equity", "credit", 406300.00),
                CoaAccount("3020", "3020", "Retained Earnings", "Equity", "credit", 0.0),

                // Revenue (4000)
                CoaAccount("4010", "4010", "Service Revenue", "Revenue", "credit", 0.0),
                CoaAccount("4020", "4020", "Consulting Income", "Revenue", "credit", 0.0),

                // Cost of Sales (5000)
                CoaAccount("5010", "5010", "Direct Project Costs", "Cost", "debit", 0.0),

                // Operating Expenses (6000)
                CoaAccount("6010", "6010", "Salaries and Wages", "Expense", "debit", 0.0),
                CoaAccount("6020", "6020", "Rent Expense", "Expense", "debit", 0.0),
                CoaAccount("6030", "6030", "Utilities Expense", "Expense", "debit", 0.0),
                CoaAccount("6040", "6040", "Office Supplies Expense", "Expense", "debit", 0.0),
                CoaAccount("6050", "6050", "Depreciation Expense", "Expense", "debit", 0.0)
            )
            dao.insertAccounts(defaultAccounts)

            // Seed Sample Sales
            dao.insertSale(
                Sale(
                    date = "2026-10-01",
                    ref = "SI-2026-001",
                    paymentType = "Bank Transfer",
                    buyerTin = "111-222-333-000",
                    buyerName = "Acro Solutions Inc.",
                    vatType = "VAT Registered",
                    amount = 56000.00,
                    netOfVat = 50000.00,
                    outputTax = 6000.00,
                    incomeType = "Service Revenue",
                    description = "Monthly Accounting & Tax Compliance Retainer"
                )
            )
            dao.insertSale(
                Sale(
                    date = "2026-10-05",
                    ref = "SI-2026-002",
                    paymentType = "Cash",
                    buyerTin = "444-555-666-000",
                    buyerName = "Beacon Logistics Corp.",
                    vatType = "VAT Registered",
                    amount = 112000.00,
                    netOfVat = 100000.00,
                    outputTax = 12000.00,
                    incomeType = "Consulting Income",
                    description = "BIR Audit Assistance & Clean-up"
                )
            )

            // Seed Sample Purchases
            dao.insertPurchase(
                Purchase(
                    date = "2026-10-02",
                    invoiceNo = "INV-78912",
                    paymentMethod = "Bank Transfer",
                    supplierTin = "777-888-999-000",
                    supplierName = "Ayala Land Office Leasing",
                    amount = 33600.00,
                    vatType = "VAT Registered",
                    expenseType = "Rent Expense",
                    accountTitle = "Rent Expense",
                    inputTax = 3600.00,
                    atcCode = "WC010",
                    whtRate = 0.05,
                    whtAmount = 1500.00,
                    transactionDetails = "Office space lease for October 2026"
                )
            )
            dao.insertPurchase(
                Purchase(
                    date = "2026-10-04",
                    invoiceNo = "OR-44123",
                    paymentMethod = "Cash",
                    supplierTin = "333-444-555-000",
                    supplierName = "National Bookstore Supplies",
                    amount = 6720.00,
                    vatType = "VAT Registered",
                    expenseType = "Office Supplies",
                    accountTitle = "Office Supplies Expense",
                    inputTax = 720.00,
                    transactionDetails = "Printing paper, binder folders, vouchers"
                )
            )

            // Seed Billing Invoices (SOA)
            dao.insertBillingInvoice(
                BillingInvoice(
                    id = "INV-2026-003",
                    date = "2026-10-08",
                    dueDate = "2026-10-23",
                    invoiceNo = "SOA-2026-003",
                    customerTin = "999-111-222-000",
                    customerName = "Crestview Holdings Inc.",
                    vatType = "VAT Registered",
                    amount = 84000.00,
                    netOfVat = 75000.00,
                    outputTax = 9000.00,
                    description = "Financial statement audit preparation",
                    status = "Outstanding"
                )
            )

            // Seed BIR Tax Deadlines
            val deadlines = listOf(
                TaxDeadline("BIR-01", "2550Q", "Quarterly VAT Return (Q3)", "Q3 2026", "2026-10-25", "Pending", 15400.00),
                TaxDeadline("BIR-02", "1601-C", "Monthly Remittance of Withholding Tax on Compensation", "Sep 2026", "2026-10-10", "Paid", 5200.00, "2026-10-09"),
                TaxDeadline("BIR-03", "0619-E", "Monthly Remittance Form of Expanded Withholding Tax", "Sep 2026", "2026-10-10", "Paid", 3100.00, "2026-10-09"),
                TaxDeadline("BIR-04", "1701Q", "Quarterly Income Tax Return for Individuals (Q3)", "Q3 2026", "2026-11-15", "Pending", 24000.00)
            )
            dao.insertTaxDeadlines(deadlines)

            // Seed TIN Directory
            dao.insertTinEntry(TinEntry(type = "customer", tin = "111-222-333-000", name = "Acro Solutions Inc.", address = "Taguig City"))
            dao.insertTinEntry(TinEntry(type = "customer", tin = "444-555-666-000", name = "Beacon Logistics Corp.", address = "Pasig City"))
            dao.insertTinEntry(TinEntry(type = "supplier", tin = "777-888-999-000", name = "Ayala Land Office Leasing", address = "Makati City"))
            dao.insertTinEntry(TinEntry(type = "supplier", tin = "333-444-555-000", name = "National Bookstore Supplies", address = "Quezon City"))

            // Seed Asset Lapsing
            dao.insertAsset(
                AssetLapsingEntry(
                    id = "FA-001",
                    datePurchased = "2025-01-15",
                    invoiceNo = "INV-DELL-991",
                    description = "Dell Precision Workstations (x3)",
                    cost = 120000.00,
                    usefulLifeYears = 5,
                    salvageValue = 12000.00,
                    method = "straight-line"
                )
            )
        }
    }
}
