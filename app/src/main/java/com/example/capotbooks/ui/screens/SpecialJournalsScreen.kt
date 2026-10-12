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
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState

@Composable
fun SpecialJournalsScreen(state: AccountingUiState) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val journalTabs = listOf(
        "Sales Journal (SJ)",
        "Purchases Journal (PJ)",
        "Cash Receipts (CRJ)",
        "Cash Disbursements (CDJ)",
        "General Ledger (GL)"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .testTag("special_journals_screen")
    ) {
        Text(
            text = "Official BIR Books of Accounts",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Loose-leaf & Computerized Accounting System (CAS) journals",
            style = MaterialTheme.typography.bodySmall,
            color = Slate500
        )

        Spacer(modifier = Modifier.height(10.dp))

        ScrollableTabRow(
            selectedTabIndex = selectedTab,
            containerColor = MaterialTheme.colorScheme.surface,
            edgePadding = 0.dp
        ) {
            journalTabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        when (selectedTab) {
            0 -> SalesJournalView(state)
            1 -> PurchasesJournalView(state)
            2 -> CashReceiptsJournalView(state)
            3 -> CashDisbursementsJournalView(state)
            4 -> GeneralLedgerView(state)
        }
    }
}

@Composable
fun SalesJournalView(state: AccountingUiState) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.sales) { sale ->
            Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(sale.date, style = MaterialTheme.typography.bodySmall, color = Slate500)
                        Text("Ref: ${sale.ref}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                    Text(sale.buyerName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Net Sales: ${formatCurrency(sale.netOfVat)}", style = MaterialTheme.typography.bodySmall)
                        Text("Output VAT: ${formatCurrency(sale.outputTax)}", style = MaterialTheme.typography.bodySmall, color = BrandBlue600)
                        Text("Debit AR/Cash: ${formatCurrency(sale.amount)}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = BrandSuccess600)
                    }
                }
            }
        }
    }
}

@Composable
fun PurchasesJournalView(state: AccountingUiState) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.purchases) { p ->
            Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(p.date, style = MaterialTheme.typography.bodySmall, color = Slate500)
                        Text("Inv #${p.invoiceNo}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                    Text(p.supplierName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Debit Expense: ${formatCurrency(p.amount - p.inputTax)}", style = MaterialTheme.typography.bodySmall)
                        Text("Input VAT: ${formatCurrency(p.inputTax)}", style = MaterialTheme.typography.bodySmall, color = BrandBlue600)
                        Text("Credit AP/Cash: ${formatCurrency(p.amount)}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun CashReceiptsJournalView(state: AccountingUiState) {
    val cashSales = state.sales.filter { it.paymentType != "On Account" }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(cashSales) { sale ->
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
                        Text("${sale.date} • ${sale.ref}", style = MaterialTheme.typography.bodySmall, color = Slate500)
                        Text(sale.buyerName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        formatCurrency(sale.amount),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = BrandSuccess600
                    )
                }
            }
        }
    }
}

@Composable
fun CashDisbursementsJournalView(state: AccountingUiState) {
    val cashPurchases = state.purchases.filter { it.entrySource != "ap" }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(cashPurchases) { p ->
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
                        Text("${p.date} • Check/OR #${p.invoiceNo}", style = MaterialTheme.typography.bodySmall, color = Slate500)
                        Text(p.supplierName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        formatCurrency(p.amount),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
fun GeneralLedgerView(state: AccountingUiState) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.glEntries) { entry ->
            Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("${entry.date} • ${entry.sourceJournal}", style = MaterialTheme.typography.bodySmall, color = Slate500)
                        Text("Account: ${entry.accountId}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                    Text(entry.particulars, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Debit: ${formatCurrency(entry.debit)}", style = MaterialTheme.typography.bodySmall)
                        Text("Credit: ${formatCurrency(entry.credit)}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
