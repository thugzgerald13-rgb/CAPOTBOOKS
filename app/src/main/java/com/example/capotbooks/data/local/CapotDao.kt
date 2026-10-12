package com.example.capotbooks.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
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
import kotlinx.coroutines.flow.Flow

@Dao
interface AccountingDao {
    // Profile
    @Query("SELECT * FROM business_profile WHERE id = 'default' LIMIT 1")
    fun getBusinessProfile(): Flow<BusinessProfile?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveBusinessProfile(profile: BusinessProfile)

    // Sales
    @Query("SELECT * FROM sales ORDER BY id DESC")
    fun getAllSales(): Flow<List<Sale>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSale(sale: Sale): Long

    @Delete
    suspend fun deleteSale(sale: Sale)

    // Purchases
    @Query("SELECT * FROM purchases ORDER BY id DESC")
    fun getAllPurchases(): Flow<List<Purchase>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPurchase(purchase: Purchase): Long

    @Delete
    suspend fun deletePurchase(purchase: Purchase)

    // Billing Invoices (SOA)
    @Query("SELECT * FROM billing_invoices ORDER BY dueDate ASC")
    fun getAllBillingInvoices(): Flow<List<BillingInvoice>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBillingInvoice(invoice: BillingInvoice)

    @Update
    suspend fun updateBillingInvoice(invoice: BillingInvoice)

    @Delete
    suspend fun deleteBillingInvoice(invoice: BillingInvoice)

    // Chart of Accounts
    @Query("SELECT * FROM chart_of_accounts ORDER BY code ASC")
    fun getAllAccounts(): Flow<List<CoaAccount>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccounts(accounts: List<CoaAccount>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccount(account: CoaAccount)

    // Journal Vouchers
    @Query("SELECT * FROM journal_vouchers ORDER BY date DESC")
    fun getAllJournalVouchers(): Flow<List<JournalVoucher>>

    @Query("SELECT * FROM journal_voucher_lines WHERE voucherId = :voucherId")
    fun getLinesForVoucher(voucherId: String): Flow<List<JournalVoucherLine>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertJournalVoucher(voucher: JournalVoucher)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertJournalLines(lines: List<JournalVoucherLine>)

    @Delete
    suspend fun deleteJournalVoucher(voucher: JournalVoucher)

    // General Ledger Entries
    @Query("SELECT * FROM general_ledger_entries ORDER BY date DESC, id DESC")
    fun getAllGeneralLedgerEntries(): Flow<List<GeneralLedgerEntry>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGlEntry(entry: GeneralLedgerEntry)

    // Fixed Assets Lapsing
    @Query("SELECT * FROM asset_lapsing ORDER BY datePurchased DESC")
    fun getAllAssets(): Flow<List<AssetLapsingEntry>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAsset(asset: AssetLapsingEntry)

    @Delete
    suspend fun deleteAsset(asset: AssetLapsingEntry)

    // Tax Deadlines
    @Query("SELECT * FROM tax_deadlines ORDER BY dueDate ASC")
    fun getAllTaxDeadlines(): Flow<List<TaxDeadline>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTaxDeadlines(deadlines: List<TaxDeadline>)

    @Update
    suspend fun updateTaxDeadline(deadline: TaxDeadline)

    // TIN Directory
    @Query("SELECT * FROM tin_directory ORDER BY name ASC")
    fun getAllTinEntries(): Flow<List<TinEntry>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTinEntry(entry: TinEntry)

    @Delete
    suspend fun deleteTinEntry(entry: TinEntry)
}
