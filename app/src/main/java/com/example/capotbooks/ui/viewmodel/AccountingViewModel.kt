package com.example.capotbooks.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.capotbooks.data.repository.AccountingRepository
import com.example.capotbooks.model.AssetLapsingEntry
import com.example.capotbooks.model.BalanceSheetReport
import com.example.capotbooks.model.BillingInvoice
import com.example.capotbooks.model.BusinessProfile
import com.example.capotbooks.model.CoaAccount
import com.example.capotbooks.model.GeneralLedgerEntry
import com.example.capotbooks.model.JournalVoucher
import com.example.capotbooks.model.JournalVoucherLine
import com.example.capotbooks.model.PhilippineTaxEngine
import com.example.capotbooks.model.ProfitAndLossReport
import com.example.capotbooks.model.Purchase
import com.example.capotbooks.model.Sale
import com.example.capotbooks.model.TaxDeadline
import com.example.capotbooks.model.TinEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

sealed class Screen(val title: String, val route: String) {
    object Dashboard : Screen("Dashboard", "dashboard")
    object Sales : Screen("Sales Invoicing", "sales")
    object Purchases : Screen("Purchases & AP", "purchases")
    object Billing : Screen("SOA & Billing", "billing")
    object JournalVoucher : Screen("Journal Voucher", "journal_voucher")
    object SpecialJournals : Screen("Books of Accounts", "journals")
    object ChartOfAccounts : Screen("Chart of Accounts", "coa")
    object FinancialReports : Screen("Financial Reports", "reports")
    object AssetLapsing : Screen("Asset Lapsing", "asset_lapsing")
    object Compliance : Screen("BIR Compliance & TIN", "compliance")
    object BusinessProfile : Screen("Business Profile", "profile")
}

data class AccountingUiState(
    val currentScreen: Screen = Screen.Dashboard,
    val profile: BusinessProfile? = null,
    val sales: List<Sale> = emptyList(),
    val purchases: List<Purchase> = emptyList(),
    val billingInvoices: List<BillingInvoice> = emptyList(),
    val accounts: List<CoaAccount> = emptyList(),
    val journalVouchers: List<JournalVoucher> = emptyList(),
    val glEntries: List<GeneralLedgerEntry> = emptyList(),
    val assets: List<AssetLapsingEntry> = emptyList(),
    val taxDeadlines: List<TaxDeadline> = emptyList(),
    val tinEntries: List<TinEntry> = emptyList(),
    val pnlReport: ProfitAndLossReport? = null,
    val balanceSheetReport: BalanceSheetReport? = null,
    val totalRevenue: Double = 0.0,
    val totalExpenses: Double = 0.0,
    val netIncome: Double = 0.0,
    val accountsReceivable: Double = 0.0,
    val accountsPayable: Double = 0.0,
    val cashInBank: Double = 0.0
)

class AccountingViewModel(
    private val repository: AccountingRepository
) : ViewModel() {

    private val _currentScreen = MutableStateFlow<Screen>(Screen.Dashboard)
    val currentScreen = _currentScreen.asStateFlow()

    fun navigateTo(screen: Screen) {
        _currentScreen.value = screen
    }

    val uiState: StateFlow<AccountingUiState> = combine(
        _currentScreen,
        repository.businessProfile,
        repository.allSales,
        repository.allPurchases,
        repository.allBillingInvoices,
        repository.allAccounts,
        repository.allJournalVouchers,
        repository.allGlEntries,
        repository.allAssets,
        repository.allTaxDeadlines,
        repository.allTinEntries,
        repository.getProfitAndLossStream(),
        repository.getBalanceSheetStream()
    ) { params ->
        val screen = params[0] as Screen
        val profile = params[1] as? BusinessProfile
        val sales = params[2] as List<Sale>
        val purchases = params[3] as List<Purchase>
        val invoices = params[4] as List<BillingInvoice>
        val accounts = params[5] as List<CoaAccount>
        val vouchers = params[6] as List<JournalVoucher>
        val gl = params[7] as List<GeneralLedgerEntry>
        val assets = params[8] as List<AssetLapsingEntry>
        val deadlines = params[9] as List<TaxDeadline>
        val tinList = params[10] as List<TinEntry>
        val pnl = params[11] as ProfitAndLossReport
        val bs = params[12] as BalanceSheetReport

        val rev = sales.sumOf { it.netOfVat }
        val exp = purchases.sumOf { it.amount - it.inputTax }
        val net = rev - exp
        val ar = invoices.filter { it.status == "Outstanding" }.sumOf { it.amount } + (accounts.find { it.id == "1030" }?.openingBalance ?: 0.0)
        val ap = purchases.filter { it.entrySource == "ap" }.sumOf { it.amount } + (accounts.find { it.id == "2010" }?.openingBalance ?: 0.0)
        val cash = (accounts.find { it.id == "1010" }?.openingBalance ?: 0.0) + sales.sumOf { it.amount } - purchases.sumOf { it.amount }

        AccountingUiState(
            currentScreen = screen,
            profile = profile,
            sales = sales,
            purchases = purchases,
            billingInvoices = invoices,
            accounts = accounts,
            journalVouchers = vouchers,
            glEntries = gl,
            assets = assets,
            taxDeadlines = deadlines,
            tinEntries = tinList,
            pnlReport = pnl,
            balanceSheetReport = bs,
            totalRevenue = rev,
            totalExpenses = exp,
            netIncome = net,
            accountsReceivable = ar,
            accountsPayable = ap,
            cashInBank = cash
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = AccountingUiState()
    )

    fun createSale(
        buyerName: String,
        buyerTin: String,
        ref: String,
        amount: Double,
        vatType: String,
        paymentType: String,
        incomeType: String,
        description: String,
        atcCode: String?
    ) {
        viewModelScope.launch {
            val breakdown = PhilippineTaxEngine.computeSalesTax(amount, vatType, atcCode)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val sale = Sale(
                date = today,
                ref = ref.ifBlank { "SI-" + System.currentTimeMillis().toString().takeLast(6) },
                paymentType = paymentType,
                buyerTin = buyerTin,
                buyerName = buyerName,
                vatType = vatType,
                amount = amount,
                netOfVat = breakdown.vatable,
                outputTax = breakdown.outputVat,
                incomeType = incomeType,
                description = description
            )
            repository.addSale(sale)
        }
    }

    fun deleteSale(sale: Sale) {
        viewModelScope.launch { repository.deleteSale(sale) }
    }

    fun createPurchase(
        supplierName: String,
        supplierTin: String,
        invoiceNo: String,
        amount: Double,
        vatType: String,
        expenseType: String,
        accountTitle: String,
        paymentMethod: String,
        atcCode: String?
    ) {
        viewModelScope.launch {
            val inputVat = if (vatType == "VAT Registered") PhilippineTaxEngine.computeInputVat(amount) else 0.0
            val whtRate = PhilippineTaxEngine.getWhtRate(atcCode)
            val whtAmount = if (whtRate > 0) amount * whtRate else 0.0
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

            val purchase = Purchase(
                date = today,
                invoiceNo = invoiceNo.ifBlank { "PO-" + System.currentTimeMillis().toString().takeLast(6) },
                paymentMethod = paymentMethod,
                supplierTin = supplierTin,
                supplierName = supplierName,
                amount = amount,
                vatType = vatType,
                expenseType = expenseType,
                accountTitle = accountTitle,
                inputTax = inputVat,
                atcCode = atcCode,
                whtRate = whtRate,
                whtAmount = whtAmount
            )
            repository.addPurchase(purchase)
        }
    }

    fun deletePurchase(purchase: Purchase) {
        viewModelScope.launch { repository.deletePurchase(purchase) }
    }

    fun createBillingInvoice(
        customerName: String,
        customerTin: String,
        invoiceNo: String,
        dueDate: String,
        amount: Double,
        vatType: String,
        description: String,
        isRecurring: Boolean
    ) {
        viewModelScope.launch {
            val breakdown = PhilippineTaxEngine.computeSalesTax(amount, vatType)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val invoice = BillingInvoice(
                id = UUID.randomUUID().toString(),
                date = today,
                dueDate = dueDate,
                invoiceNo = invoiceNo.ifBlank { "SOA-" + System.currentTimeMillis().toString().takeLast(5) },
                customerTin = customerTin,
                customerName = customerName,
                vatType = vatType,
                amount = amount,
                netOfVat = breakdown.vatable,
                outputTax = breakdown.outputVat,
                description = description,
                status = "Outstanding",
                isRecurring = isRecurring
            )
            repository.addBillingInvoice(invoice)
        }
    }

    fun toggleInvoicePaid(invoice: BillingInvoice) {
        viewModelScope.launch {
            val updated = invoice.copy(status = if (invoice.status == "Paid") "Outstanding" else "Paid")
            repository.updateBillingInvoice(updated)
        }
    }

    fun deleteBillingInvoice(invoice: BillingInvoice) {
        viewModelScope.launch { repository.deleteBillingInvoice(invoice) }
    }

    fun createJournalVoucher(
        reference: String,
        memo: String,
        lines: List<JournalVoucherLine>
    ) {
        viewModelScope.launch {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val voucherId = UUID.randomUUID().toString()
            val voucher = JournalVoucher(
                id = voucherId,
                date = today,
                reference = reference.ifBlank { "JV-" + System.currentTimeMillis().toString().takeLast(5) },
                memo = memo,
                totalDebit = lines.sumOf { it.debit },
                totalCredit = lines.sumOf { it.credit }
            )
            repository.addJournalVoucher(voucher, lines.map { it.copy(voucherId = voucherId) })
        }
    }

    fun createAsset(
        description: String,
        cost: Double,
        usefulLife: Int,
        salvageValue: Double,
        invoiceNo: String,
        method: String
    ) {
        viewModelScope.launch {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val asset = AssetLapsingEntry(
                id = "FA-" + System.currentTimeMillis().toString().takeLast(5),
                datePurchased = today,
                invoiceNo = invoiceNo,
                description = description,
                cost = cost,
                usefulLifeYears = usefulLife,
                salvageValue = salvageValue,
                method = method
            )
            repository.addAsset(asset)
        }
    }

    fun deleteAsset(asset: AssetLapsingEntry) {
        viewModelScope.launch { repository.deleteAsset(asset) }
    }

    fun updateTaxDeadlineStatus(deadline: TaxDeadline, newStatus: String) {
        viewModelScope.launch {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val updated = deadline.copy(
                status = newStatus,
                dateFiled = if (newStatus == "Filed" || newStatus == "Paid") today else null
            )
            repository.updateTaxDeadline(updated)
        }
    }

    fun saveBusinessProfile(profile: BusinessProfile) {
        viewModelScope.launch { repository.saveProfile(profile) }
    }

    fun addTinEntry(name: String, tin: String, type: String, address: String) {
        viewModelScope.launch {
            repository.addTinEntry(
                TinEntry(
                    type = type,
                    tin = tin,
                    name = name,
                    address = address
                )
            )
        }
    }

    fun deleteTinEntry(entry: TinEntry) {
        viewModelScope.launch { repository.deleteTinEntry(entry) }
    }
}
