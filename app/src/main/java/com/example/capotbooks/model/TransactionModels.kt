package com.example.capotbooks.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sales")
data class Sale(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val date: String,
    val ref: String,
    val paymentType: String = "Cash",
    val buyerTin: String = "",
    val buyerName: String,
    val buyerAddress: String = "",
    val vatType: String = "VAT Registered",
    val amount: Double,
    val netOfVat: Double = 0.0,
    val outputTax: Double = 0.0,
    val incomeType: String = "Service Income",
    val description: String = "",
    val eisStatus: String = "accepted" // queued, submitted, accepted
)

@Entity(tableName = "purchases")
data class Purchase(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val date: String,
    val invoiceNo: String,
    val paymentMethod: String = "Cash",
    val checkNumber: String? = null,
    val supplierTin: String = "",
    val supplierName: String,
    val supplierAddress: String = "",
    val amount: Double,
    val vatType: String = "VAT Registered",
    val entrySource: String = "invoiced", // 'invoiced', 'other-payments', 'ap'
    val expenseType: String = "Operating Expense",
    val accountTitle: String = "Office Supplies",
    val inputTax: Double = 0.0,
    val atcCode: String? = null,
    val whtRate: Double? = null,
    val whtAmount: Double = 0.0,
    val transactionDetails: String = ""
)

@Entity(tableName = "billing_invoices")
data class BillingInvoice(
    @PrimaryKey
    val id: String,
    val date: String,
    val dueDate: String,
    val invoiceNo: String,
    val customerTin: String = "",
    val customerName: String,
    val customerAddress: String = "",
    val vatType: String = "VAT Registered",
    val amount: Double,
    val netOfVat: Double = 0.0,
    val outputTax: Double = 0.0,
    val description: String = "",
    val status: String = "Outstanding", // "Outstanding" or "Paid"
    val isRecurring: Boolean = false,
    val recurrenceFrequency: String? = null // Monthly, Quarterly, Annually
)

@Entity(tableName = "expenses")
data class Expense(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val date: String,
    val amount: Double,
    val category: String,
    val description: String = ""
)
