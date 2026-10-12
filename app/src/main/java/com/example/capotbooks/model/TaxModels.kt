package com.example.capotbooks.model

import androidx.room.Entity
import androidx.room.PrimaryKey

data class WhtAtcEntry(
    val atc: String,
    val description: String,
    val rate: Double
)

data class TaxBreakdown(
    val gross: Double,
    val vatable: Double,
    val outputVat: Double,
    val vatExempt: Double,
    val zeroRated: Double,
    val wht: Double,
    val netReceivable: Double
)

@Entity(tableName = "tax_deadlines")
data class TaxDeadline(
    @PrimaryKey
    val id: String,
    val formType: String, // 2550Q, 1701Q, 2551Q, 1601-C, 0619-E, 1601-EQ
    val title: String,
    val period: String,
    val dueDate: String,
    val status: String = "Pending", // Pending, Filed, Paid, Overdue
    val amountDue: Double = 0.0,
    val dateFiled: String? = null
)

object PhilippineTaxEngine {
    const val VAT_RATE = 0.12 // 12% Value Added Tax in the Philippines
    const val PERCENTAGE_TAX_RATE = 0.03 // 3% for Non-VAT taxpayers

    val ATC_SCHEDULE = listOf(
        WhtAtcEntry("WC010", "Rent — Real Property", 0.05),
        WhtAtcEntry("WC020", "Rent — Personal Property", 0.05),
        WhtAtcEntry("WC030", "Services — General Contractor", 0.02),
        WhtAtcEntry("WC040", "Contractor / Subcontractor", 0.01),
        WhtAtcEntry("WC050", "Professional Fees (Individual)", 0.10),
        WhtAtcEntry("WC060", "Professional Fees (Corporate)", 0.15),
        WhtAtcEntry("WC080", "Suppliers of Goods", 0.01),
        WhtAtcEntry("WC100", "Credit Card Payments", 0.005),
        WhtAtcEntry("WI010", "Interest on Bank Deposits", 0.20)
    )

    fun getWhtRate(atcCode: String?): Double {
        if (atcCode.isNullOrBlank()) return 0.0
        return ATC_SCHEDULE.find { it.atc.equals(atcCode, ignoreCase = true) }?.rate ?: 0.0
    }

    fun computeSalesTax(gross: Double, vatType: String, atcCode: String? = null): TaxBreakdown {
        var vatable = 0.0
        var outputVat = 0.0
        var vatExempt = 0.0
        var zeroRated = 0.0

        when (vatType) {
            "VAT Registered" -> {
                vatable = gross / (1.0 + VAT_RATE)
                outputVat = gross - vatable
            }
            "VAT Exempt" -> {
                vatExempt = gross
            }
            "Zero-Rated" -> {
                zeroRated = gross
                vatable = gross
            }
            else -> { // Non-VAT
                vatable = gross
            }
        }

        val whtRate = getWhtRate(atcCode)
        val wht = if (whtRate > 0) gross * whtRate else 0.0
        val netReceivable = gross - wht

        return TaxBreakdown(
            gross = gross,
            vatable = vatable,
            outputVat = outputVat,
            vatExempt = vatExempt,
            zeroRated = zeroRated,
            wht = wht,
            netReceivable = netReceivable
        )
    }

    fun computeInputVat(gross: Double): Double {
        val vatable = gross / (1.0 + VAT_RATE)
        return gross - vatable
    }
}
