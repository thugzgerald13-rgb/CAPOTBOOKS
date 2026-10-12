package com.example.capotbooks.model

data class TrialBalanceLine(
    val accountCode: String,
    val accountName: String,
    val debit: Double,
    val credit: Double
)

data class ProfitAndLossReport(
    val revenue: Double,
    val costOfSales: Double,
    val grossProfit: Double,
    val operatingExpenses: Double,
    val netIncome: Double,
    val accountsBreakdown: List<TrialBalanceLine>
)

data class BalanceSheetReport(
    val currentAssets: Double,
    val nonCurrentAssets: Double,
    val totalAssets: Double,
    val currentLiabilities: Double,
    val nonCurrentLiabilities: Double,
    val totalLiabilities: Double,
    val equity: Double,
    val totalLiabilitiesAndEquity: Double
)

data class CashFlowReport(
    val operatingActivities: Double,
    val investingActivities: Double,
    val financingActivities: Double,
    val netCashChange: Double,
    val endingCashBalance: Double
)
