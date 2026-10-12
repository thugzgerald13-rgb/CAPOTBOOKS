package com.example.capotbooks.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "chart_of_accounts")
data class CoaAccount(
    @PrimaryKey
    val id: String, // e.g. "1010", "2010"
    val code: String,
    val name: String,
    val type: String, // Asset, Liability, Equity, Revenue, Cost, Expense
    val normalSide: String = "debit", // "debit" or "credit"
    val openingBalance: Double = 0.0,
    val isSystem: Boolean = true
)

@Entity(tableName = "journal_vouchers")
data class JournalVoucher(
    @PrimaryKey
    val id: String,
    val date: String,
    val reference: String,
    val memo: String,
    val totalDebit: Double = 0.0,
    val totalCredit: Double = 0.0
)

@Entity(tableName = "journal_voucher_lines")
data class JournalVoucherLine(
    @PrimaryKey
    val id: String,
    val voucherId: String,
    val accountId: String,
    val accountName: String,
    val debit: Double,
    val credit: Double
)

@Entity(tableName = "general_ledger_entries")
data class GeneralLedgerEntry(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val accountId: String,
    val date: String,
    val reference: String,
    val particulars: String,
    val debit: Double = 0.0,
    val credit: Double = 0.0,
    val sourceJournal: String = "General Journal" // Sales, Purchases, Cash Receipts, Cash Disbursements
)
