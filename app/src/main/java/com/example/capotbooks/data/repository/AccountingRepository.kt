package com.example.capotbooks.data.repository

import com.example.capotbooks.data.local.AccountingDao
import com.example.capotbooks.model.AssetLapsingEntry
import com.example.capotbooks.model.BalanceSheetReport
import com.example.capotbooks.model.BillingInvoice
import com.example.capotbooks.model.BusinessProfile
import com.example.capotbooks.model.CashFlowReport
import com.example.capotbooks.model.CoaAccount
import com.example.capotbooks.model.DepreciationEngine
import com.example.capotbooks.model.GeneralLedgerEntry
import com.example.capotbooks.model.JournalVoucher
import com.example.capotbooks.model.JournalVoucherLine
import com.example.capotbooks.model.ProfitAndLossReport
import com.example.capotbooks.model.Purchase
import com.example.capotbooks.model.Sale
import com.example.capotbooks.model.TaxDeadline
import com.example.capotbooks.model.TinEntry
import com.example.capotbooks.model.TrialBalanceLine
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlin.math.max

class AccountingRepository(private val dao: AccountingDao) {

    val businessProfile: Flow<BusinessProfile?> = dao.getBusinessProfile()
    val allSales: Flow<List<Sale>> = dao.getAllSales()
    val allPurchases: Flow<List<Purchase>> = dao.getAllPurchases()
    val allBillingInvoices: Flow<List<BillingInvoice>> = dao.getAllBillingInvoices()
    val allAccounts: Flow<List<CoaAccount>> = dao.getAllAccounts()
    val allJournalVouchers: Flow<List<JournalVoucher>> = dao.getAllJournalVouchers()
    val allGlEntries: Flow<List<GeneralLedgerEntry>> = dao.getAllGeneralLedgerEntries()
    val allAssets: Flow<List<AssetLapsingEntry>> = dao.getAllAssets()
    val allTaxDeadlines: Flow<List<TaxDeadline>> = dao.getAllTaxDeadlines()
    val allTinEntries: Flow<List<TinEntry>> = dao.getAllTinEntries()

    suspend fun saveProfile(profile: BusinessProfile) = dao.saveBusinessProfile(profile)

    suspend fun addSale(sale: Sale): Long {
        val id = dao.insertSale(sale)
        // Auto-post to General Ledger
        dao.insertGlEntry(
            GeneralLedgerEntry(
                accountId = "1010", // Cash in Bank
                date = sale.date,
                reference = sale.ref,
                particulars = "Cash sale - ${sale.buyerName}",
                debit = sale.amount,
                credit = 0.0,
                sourceJournal = "Sales Journal"
            )
        )
        dao.insertGlEntry(
            GeneralLedgerEntry(
                accountId = "4010", // Revenue
                date = sale.date,
                reference = sale.ref,
                particulars = sale.description.ifEmpty { "Service Revenue" },
                debit = 0.0,
                credit = sale.netOfVat,
                sourceJournal = "Sales Journal"
            )
        )
        if (sale.outputTax > 0) {
            dao.insertGlEntry(
                GeneralLedgerEntry(
                    accountId = "2020", // Output VAT
                    date = sale.date,
                    reference = sale.ref,
                    particulars = "Output VAT 12% - ${sale.ref}",
                    debit = 0.0,
                    credit = sale.outputTax,
                    sourceJournal = "Sales Journal"
                )
            )
        }
        return id
    }

    suspend fun deleteSale(sale: Sale) = dao.deleteSale(sale)

    suspend fun addPurchase(purchase: Purchase): Long {
        val id = dao.insertPurchase(purchase)
        val netExpense = purchase.amount - purchase.inputTax
        dao.insertGlEntry(
            GeneralLedgerEntry(
                accountId = "6040", // Expense
                date = purchase.date,
                reference = purchase.invoiceNo,
                particulars = purchase.accountTitle,
                debit = netExpense,
                credit = 0.0,
                sourceJournal = "Purchases Journal"
            )
        )
        if (purchase.inputTax > 0) {
            dao.insertGlEntry(
                GeneralLedgerEntry(
                    accountId = "1050", // Input VAT
                    date = purchase.date,
                    reference = purchase.invoiceNo,
                    particulars = "Input VAT 12% - ${purchase.supplierName}",
                    debit = purchase.inputTax,
                    credit = 0.0,
                    sourceJournal = "Purchases Journal"
                )
            )
        }
        dao.insertGlEntry(
            GeneralLedgerEntry(
                accountId = "1010", // Cash
                date = purchase.date,
                reference = purchase.invoiceNo,
                particulars = "Paid to ${purchase.supplierName}",
                debit = 0.0,
                credit = purchase.amount,
                sourceJournal = "Purchases Journal"
            )
        )
        return id
    }

    suspend fun deletePurchase(purchase: Purchase) = dao.deletePurchase(purchase)

    suspend fun addBillingInvoice(invoice: BillingInvoice) = dao.insertBillingInvoice(invoice)
    suspend fun updateBillingInvoice(invoice: BillingInvoice) = dao.updateBillingInvoice(invoice)
    suspend fun deleteBillingInvoice(invoice: BillingInvoice) = dao.deleteBillingInvoice(invoice)

    suspend fun addAccount(account: CoaAccount) = dao.insertAccount(account)

    suspend fun addJournalVoucher(voucher: JournalVoucher, lines: List<JournalVoucherLine>) {
        dao.insertJournalVoucher(voucher)
        dao.insertJournalLines(lines)
        lines.forEach { line ->
            dao.insertGlEntry(
                GeneralLedgerEntry(
                    accountId = line.accountId,
                    date = voucher.date,
                    reference = voucher.reference,
                    particulars = voucher.memo,
                    debit = line.debit,
                    credit = line.credit,
                    sourceJournal = "General Journal"
                )
            )
        }
    }

    suspend fun addAsset(asset: AssetLapsingEntry) = dao.insertAsset(asset)
    suspend fun deleteAsset(asset: AssetLapsingEntry) = dao.deleteAsset(asset)

    suspend fun updateTaxDeadline(deadline: TaxDeadline) = dao.updateTaxDeadline(deadline)

    suspend fun addTinEntry(entry: TinEntry) = dao.insertTinEntry(entry)
    suspend fun deleteTinEntry(entry: TinEntry) = dao.deleteTinEntry(entry)

    // Financial Reports Calculation
    fun getProfitAndLossStream(): Flow<ProfitAndLossReport> = combine(
        allSales,
        allPurchases,
        allAccounts
    ) { sales, purchases, accounts ->
        val totalRevenue = sales.sumOf { it.netOfVat }
        val operatingExpenses = purchases.sumOf { it.amount - it.inputTax }
        val costOfSales = 0.0
        val grossProfit = totalRevenue - costOfSales
        val netIncome = grossProfit - operatingExpenses

        val breakdown = mutableListOf<TrialBalanceLine>()
        breakdown.add(TrialBalanceLine("4010", "Gross Revenue / Sales", 0.0, totalRevenue))
        breakdown.add(TrialBalanceLine("6000", "Operating Expenses", operatingExpenses, 0.0))

        ProfitAndLossReport(
            revenue = totalRevenue,
            costOfSales = costOfSales,
            grossProfit = grossProfit,
            operatingExpenses = operatingExpenses,
            netIncome = netIncome,
            accountsBreakdown = breakdown
        )
    }

    fun getBalanceSheetStream(): Flow<BalanceSheetReport> = combine(
        allSales,
        allPurchases,
        allAccounts
    ) { sales, purchases, accounts ->
        val cashOpening = accounts.find { it.id == "1010" }?.openingBalance ?: 250000.0
        val arOpening = accounts.find { it.id == "1030" }?.openingBalance ?: 85000.0
        val equipOpening = accounts.find { it.id == "1510" }?.openingBalance ?: 120000.0
        val accDepOpening = accounts.find { it.id == "1520" }?.openingBalance ?: 24000.0

        val apOpening = accounts.find { it.id == "2010" }?.openingBalance ?: 45000.0
        val capitalOpening = accounts.find { it.id == "3010" }?.openingBalance ?: 406300.0

        val netSalesCash = sales.sumOf { it.amount }
        val netPurchasesCash = purchases.sumOf { it.amount }

        val currentCash = cashOpening + netSalesCash - netPurchasesCash
        val outputVat = sales.sumOf { it.outputTax }
        val inputVat = purchases.sumOf { it.inputTax }

        val currentAssets = currentCash + arOpening + inputVat
        val nonCurrentAssets = equipOpening - accDepOpening
        val totalAssets = currentAssets + nonCurrentAssets

        val currentLiabilities = apOpening + outputVat
        val totalLiabilities = currentLiabilities

        val netIncome = sales.sumOf { it.netOfVat } - purchases.sumOf { it.amount - it.inputTax }
        val equity = capitalOpening + netIncome

        BalanceSheetReport(
            currentAssets = currentAssets,
            nonCurrentAssets = nonCurrentAssets,
            totalAssets = totalAssets,
            currentLiabilities = currentLiabilities,
            nonCurrentLiabilities = 0.0,
            totalLiabilities = totalLiabilities,
            equity = equity,
            totalLiabilitiesAndEquity = totalLiabilities + equity
        )
    }
}
