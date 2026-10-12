package com.example.capotbooks.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState

@Composable
fun FinancialReportsScreen(state: AccountingUiState) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val reportTabs = listOf(
        "Profit & Loss",
        "Balance Sheet",
        "Trial Balance",
        "Cash Flow Statement"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .testTag("reports_screen")
    ) {
        Text(
            text = "Audited Financial Statements (AFS)",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Philippine Financial Reporting Standards (PFRS) compliant statements",
            style = MaterialTheme.typography.bodySmall,
            color = Slate500
        )

        Spacer(modifier = Modifier.height(10.dp))

        ScrollableTabRow(
            selectedTabIndex = selectedTab,
            containerColor = MaterialTheme.colorScheme.surface,
            edgePadding = 0.dp
        ) {
            reportTabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        when (selectedTab) {
            0 -> ProfitAndLossView(state)
            1 -> BalanceSheetView(state)
            2 -> TrialBalanceView(state)
            3 -> CashFlowView(state)
        }
    }
}

@Composable
fun ProfitAndLossView(state: AccountingUiState) {
    val pnl = state.pnlReport
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth().testTag("pnl_report_card")
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text("STATEMENT OF COMPREHENSIVE INCOME", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("For the Period Ended October 31, 2026 (in PHP)", style = MaterialTheme.typography.bodySmall, color = Slate500)

            Spacer(modifier = Modifier.height(16.dp))

            ReportRow("Service & Consulting Revenue", formatCurrency(pnl?.revenue ?: 0.0), isBold = false)
            ReportRow("Less: Direct Cost of Services", formatCurrency(pnl?.costOfSales ?: 0.0), isBold = false)
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            ReportRow("GROSS PROFIT", formatCurrency(pnl?.grossProfit ?: 0.0), isBold = true, color = BrandSuccess600)

            Spacer(modifier = Modifier.height(12.dp))
            ReportRow("Operating & Administrative Expenses", formatCurrency(pnl?.operatingExpenses ?: 0.0), isBold = false)
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            ReportRow("NET OPERATING INCOME", formatCurrency(pnl?.netIncome ?: 0.0), isBold = true, color = if ((pnl?.netIncome ?: 0.0) >= 0) BrandSuccess600 else BrandDanger500)
        }
    }
}

@Composable
fun BalanceSheetView(state: AccountingUiState) {
    val bs = state.balanceSheetReport
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth().testTag("balance_sheet_card")
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text("STATEMENT OF FINANCIAL POSITION", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("As of October 31, 2026 (in PHP)", style = MaterialTheme.typography.bodySmall, color = Slate500)

            Spacer(modifier = Modifier.height(14.dp))
            Text("ASSETS", fontWeight = FontWeight.Bold, color = BrandBlue600)
            ReportRow("Current Assets (Cash, AR, VAT Input)", formatCurrency(bs?.currentAssets ?: 0.0))
            ReportRow("Non-Current Assets (PPE net of Dep.)", formatCurrency(bs?.nonCurrentAssets ?: 0.0))
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            ReportRow("TOTAL ASSETS", formatCurrency(bs?.totalAssets ?: 0.0), isBold = true, color = BrandSuccess600)

            Spacer(modifier = Modifier.height(14.dp))
            Text("LIABILITIES & OWNER'S EQUITY", fontWeight = FontWeight.Bold, color = BrandBlue600)
            ReportRow("Current Liabilities (AP, VAT Output)", formatCurrency(bs?.currentLiabilities ?: 0.0))
            ReportRow("Owner's Equity & Retained Earnings", formatCurrency(bs?.equity ?: 0.0))
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            ReportRow("TOTAL LIABILITIES & EQUITY", formatCurrency(bs?.totalLiabilitiesAndEquity ?: 0.0), isBold = true, color = BrandSuccess600)
        }
    }
}

@Composable
fun TrialBalanceView(state: AccountingUiState) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.accounts) { account ->
            Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("${account.code} - ${account.name}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                        Text(account.type, color = Slate500, style = MaterialTheme.typography.bodySmall)
                    }
                    if (account.normalSide == "debit") {
                        Text("Dr: ${formatCurrency(account.openingBalance)}", color = BrandSuccess600, fontWeight = FontWeight.Bold)
                    } else {
                        Text("Cr: ${formatCurrency(account.openingBalance)}", color = BrandBlue600, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun CashFlowView(state: AccountingUiState) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth().testTag("cash_flow_card")
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text("STATEMENT OF CASH FLOWS", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(14.dp))
            ReportRow("Cash from Operating Activities", formatCurrency(state.netIncome))
            ReportRow("Cash from Investing Activities", formatCurrency(0.0))
            ReportRow("Cash from Financing Activities", formatCurrency(0.0))
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            ReportRow("Ending Cash & Cash Equivalents", formatCurrency(state.cashInBank), isBold = true, color = BrandSuccess600)
        }
    }
}

@Composable
fun ReportRow(
    title: String,
    value: String,
    isBold: Boolean = false,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = if (isBold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = value,
            style = if (isBold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isBold) FontWeight.Bold else FontWeight.SemiBold,
            color = color
        )
    }
}
