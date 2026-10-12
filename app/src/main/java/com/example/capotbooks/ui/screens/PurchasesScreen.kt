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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.capotbooks.model.PhilippineTaxEngine
import com.example.capotbooks.model.Purchase
import com.example.capotbooks.ui.components.StatusBadge
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandAmber500
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

@Composable
fun PurchasesScreen(
    state: AccountingUiState,
    viewModel: AccountingViewModel
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedTab by remember { mutableIntStateOf(0) }
    var showAddDialog by remember { mutableStateOf(false) }

    val tabs = listOf("All Purchases", "Invoiced", "Other Payments", "Accounts Payable")

    val filtered = state.purchases.filter { p ->
        val matchesTab = when (selectedTab) {
            1 -> p.entrySource == "invoiced"
            2 -> p.entrySource == "other-payments"
            3 -> p.entrySource == "ap"
            else -> true
        }
        val matchesSearch = p.supplierName.contains(searchQuery, ignoreCase = true) ||
                p.invoiceNo.contains(searchQuery, ignoreCase = true) ||
                p.supplierTin.contains(searchQuery, ignoreCase = true)
        matchesTab && matchesSearch
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.testTag("add_purchase_fab")
            ) {
                Icon(Icons.Default.Add, contentDescription = "New Purchase")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("purchases_screen")
        ) {
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title, style = MaterialTheme.typography.labelSmall) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search Supplier, Invoice #, or TIN") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                modifier = Modifier.fillMaxWidth().testTag("purchases_search_input"),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${filtered.size} Records",
                    style = MaterialTheme.typography.titleMedium,
                    color = Slate500
                )
                Text(
                    text = "Total: ${formatCurrency(filtered.sumOf { it.amount })}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandDanger500
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(filtered) { purchase ->
                    PurchaseItemCard(
                        purchase = purchase,
                        onDelete = { viewModel.deletePurchase(purchase) }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddPurchaseDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, tin, inv, amt, vat, expType, title, payMethod, atc ->
                viewModel.createPurchase(name, tin, inv, amt, vat, expType, title, payMethod, atc)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun PurchaseItemCard(
    purchase: Purchase,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth().testTag("purchase_card_${purchase.id}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = purchase.supplierName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "TIN: ${purchase.supplierTin.ifEmpty { "N/A" }} • Inv: ${purchase.invoiceNo} • ${purchase.accountTitle}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate500
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete Purchase",
                        tint = BrandDanger500
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    if (purchase.inputTax > 0) {
                        Text(
                            text = "Input VAT: ${formatCurrency(purchase.inputTax)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = BrandBlue600
                        )
                    }
                    if (purchase.whtAmount > 0) {
                        Text(
                            text = "WHT (${purchase.atcCode}): ${formatCurrency(purchase.whtAmount)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = BrandAmber500
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = formatCurrency(purchase.amount),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    StatusBadge(text = purchase.vatType, color = BrandBlue600)
                }
            }
        }
    }
}

@Composable
fun AddPurchaseDialog(
    onDismiss: () -> Unit,
    onConfirm: (
        name: String,
        tin: String,
        inv: String,
        amount: Double,
        vatType: String,
        expType: String,
        title: String,
        payMethod: String,
        atc: String?
    ) -> Unit
) {
    var supplierName by remember { mutableStateOf("") }
    var supplierTin by remember { mutableStateOf("") }
    var invoiceNo by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var vatType by remember { mutableStateOf("VAT Registered") }
    var accountTitle by remember { mutableStateOf("Office Supplies Expense") }
    var payMethod by remember { mutableStateOf("Bank Transfer") }
    var atcCode by remember { mutableStateOf("") }

    val amount = amountText.toDoubleOrNull() ?: 0.0
    val inputVat = if (vatType == "VAT Registered") PhilippineTaxEngine.computeInputVat(amount) else 0.0

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Purchase / Operating Expense", fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    OutlinedTextField(
                        value = supplierName,
                        onValueChange = { supplierName = it },
                        label = { Text("Supplier / Vendor Name *") },
                        modifier = Modifier.fillMaxWidth().testTag("purchase_supplier_name_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = supplierTin,
                        onValueChange = { supplierTin = it },
                        label = { Text("Supplier TIN (123-456-789-000)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = invoiceNo,
                        onValueChange = { invoiceNo = it },
                        label = { Text("Supplier Invoice / Official Receipt #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it },
                        label = { Text("Total Purchase Amount (₱) *") },
                        modifier = Modifier.fillMaxWidth().testTag("purchase_amount_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = accountTitle,
                        onValueChange = { accountTitle = it },
                        label = { Text("Expense Category / Account Title") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("Tax Credit Preview", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                            Text("12% Input VAT Credit: ${formatCurrency(inputVat)}", style = MaterialTheme.typography.bodySmall, color = BrandBlue600)
                            Text("Net Deductible Expense: ${formatCurrency(amount - inputVat)}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (supplierName.isNotBlank() && amount > 0) {
                        onConfirm(supplierName, supplierTin, invoiceNo, amount, vatType, "Operating Expense", accountTitle, payMethod, atcCode.ifEmpty { null })
                    }
                },
                enabled = supplierName.isNotBlank() && amount > 0,
                modifier = Modifier.testTag("save_purchase_button")
            ) {
                Text("Save Purchase")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
