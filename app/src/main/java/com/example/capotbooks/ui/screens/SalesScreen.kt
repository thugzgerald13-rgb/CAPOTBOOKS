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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.capotbooks.model.PhilippineTaxEngine
import com.example.capotbooks.model.Sale
import com.example.capotbooks.ui.components.StatusBadge
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

@Composable
fun SalesScreen(
    state: AccountingUiState,
    viewModel: AccountingViewModel
) {
    var searchQuery by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }

    val filteredSales = state.sales.filter {
        it.buyerName.contains(searchQuery, ignoreCase = true) ||
                it.ref.contains(searchQuery, ignoreCase = true) ||
                it.buyerTin.contains(searchQuery, ignoreCase = true)
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.testTag("add_sale_fab")
            ) {
                Icon(Icons.Default.Add, contentDescription = "New Sale Invoice")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("sales_screen")
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search by Buyer, Reference, or TIN") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("sales_search_input"),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${filteredSales.size} Invoices",
                    style = MaterialTheme.typography.titleMedium,
                    color = Slate500
                )
                Text(
                    text = "Total: ${formatCurrency(filteredSales.sumOf { it.amount })}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandSuccess600
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(filteredSales) { sale ->
                    SaleItemCard(
                        sale = sale,
                        onDelete = { viewModel.deleteSale(sale) }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddSaleDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { buyerName, buyerTin, ref, amount, vatType, paymentType, incomeType, desc, atc ->
                viewModel.createSale(buyerName, buyerTin, ref, amount, vatType, paymentType, incomeType, desc, atc)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun SaleItemCard(
    sale: Sale,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth().testTag("sale_card_${sale.id}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = sale.buyerName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "TIN: ${sale.buyerTin.ifEmpty { "N/A" }} • Ref: ${sale.ref}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate500
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete Sale",
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
                    Text(
                        text = "Net: ${formatCurrency(sale.netOfVat)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate500
                    )
                    if (sale.outputTax > 0) {
                        Text(
                            text = "Output VAT: ${formatCurrency(sale.outputTax)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = BrandBlue600
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = formatCurrency(sale.amount),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = BrandSuccess600
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    StatusBadge(text = sale.vatType, color = BrandBlue600)
                }
            }
        }
    }
}

@Composable
fun AddSaleDialog(
    onDismiss: () -> Unit,
    onConfirm: (
        buyerName: String,
        buyerTin: String,
        ref: String,
        amount: Double,
        vatType: String,
        paymentType: String,
        incomeType: String,
        desc: String,
        atcCode: String?
    ) -> Unit
) {
    var buyerName by remember { mutableStateOf("") }
    var buyerTin by remember { mutableStateOf("") }
    var ref by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var vatType by remember { mutableStateOf("VAT Registered") }
    var paymentType by remember { mutableStateOf("Bank Transfer") }
    var incomeType by remember { mutableStateOf("Service Revenue") }
    var desc by remember { mutableStateOf("") }
    var atcCode by remember { mutableStateOf("") }

    val amount = amountText.toDoubleOrNull() ?: 0.0
    val taxPreview = PhilippineTaxEngine.computeSalesTax(amount, vatType, atcCode)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Sales Invoice / Official Receipt", fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    OutlinedTextField(
                        value = buyerName,
                        onValueChange = { buyerName = it },
                        label = { Text("Customer / Buyer Name *") },
                        modifier = Modifier.fillMaxWidth().testTag("sale_buyer_name_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = buyerTin,
                        onValueChange = { buyerTin = it },
                        label = { Text("Buyer TIN (e.g. 123-456-789-000)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = ref,
                        onValueChange = { ref = it },
                        label = { Text("Invoice / OR Reference #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it },
                        label = { Text("Total Gross Amount (₱) *") },
                        modifier = Modifier.fillMaxWidth().testTag("sale_amount_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = desc,
                        onValueChange = { desc = it },
                        label = { Text("Particulars / Description") },
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
                            Text("BIR Tax Calculation Preview", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                            Text("Net of VAT: ${formatCurrency(taxPreview.vatable)}", style = MaterialTheme.typography.bodySmall)
                            Text("12% Output VAT: ${formatCurrency(taxPreview.outputVat)}", style = MaterialTheme.typography.bodySmall)
                            Text("Net Receivable: ${formatCurrency(taxPreview.netReceivable)}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (buyerName.isNotBlank() && amount > 0) {
                        onConfirm(buyerName, buyerTin, ref, amount, vatType, paymentType, incomeType, desc, atcCode)
                    }
                },
                enabled = buyerName.isNotBlank() && amount > 0,
                modifier = Modifier.testTag("save_sale_button")
            ) {
                Text("Save Sale")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
