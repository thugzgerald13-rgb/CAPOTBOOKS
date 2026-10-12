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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import com.example.capotbooks.model.BillingInvoice
import com.example.capotbooks.ui.components.StatusBadge
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandAmber500
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

@Composable
fun BillingScreen(
    state: AccountingUiState,
    viewModel: AccountingViewModel
) {
    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.testTag("add_billing_fab")
            ) {
                Icon(Icons.Default.Add, contentDescription = "New Statement of Account")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("billing_screen")
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Statements of Account (SOA)",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Outstanding: ${formatCurrency(state.billingInvoices.filter { it.status == "Outstanding" }.sumOf { it.amount })}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = BrandAmber500
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(state.billingInvoices) { invoice ->
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth().testTag("billing_card_${invoice.id}")
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = invoice.customerName,
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Inv #${invoice.invoiceNo} • Due: ${invoice.dueDate}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Slate500
                                    )
                                    if (invoice.description.isNotEmpty()) {
                                        Text(
                                            text = invoice.description,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Slate500
                                        )
                                    }
                                }
                                IconButton(onClick = { viewModel.deleteBillingInvoice(invoice) }) {
                                    Icon(
                                        imageVector = Icons.Default.Delete,
                                        contentDescription = "Delete SOA",
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
                                Text(
                                    text = formatCurrency(invoice.amount),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (invoice.status == "Paid") BrandSuccess600 else BrandAmber500
                                )

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    StatusBadge(
                                        text = invoice.status,
                                        color = if (invoice.status == "Paid") BrandSuccess600 else BrandAmber500
                                    )
                                    Spacer(modifier = Modifier.padding(4.dp))
                                    OutlinedButton(
                                        onClick = { viewModel.toggleInvoicePaid(invoice) },
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(if (invoice.status == "Paid") "Mark Unpaid" else "Mark Paid", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddBillingDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, tin, inv, due, amt, desc, recurring ->
                viewModel.createBillingInvoice(name, tin, inv, due, amt, "VAT Registered", desc, recurring)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun AddBillingDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, tin: String, inv: String, due: String, amt: Double, desc: String, recurring: Boolean) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var tin by remember { mutableStateOf("") }
    var invoiceNo by remember { mutableStateOf("") }
    var dueDate by remember { mutableStateOf("2026-10-31") }
    var amountText by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var recurring by remember { mutableStateOf(false) }

    val amount = amountText.toDoubleOrNull() ?: 0.0

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Statement of Account", fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Client Name *") },
                        modifier = Modifier.fillMaxWidth().testTag("billing_customer_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = tin,
                        onValueChange = { tin = it },
                        label = { Text("Client TIN") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = invoiceNo,
                        onValueChange = { invoiceNo = it },
                        label = { Text("SOA Reference #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = dueDate,
                        onValueChange = { dueDate = it },
                        label = { Text("Due Date (YYYY-MM-DD)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it },
                        label = { Text("Billable Amount (₱) *") },
                        modifier = Modifier.fillMaxWidth().testTag("billing_amount_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = desc,
                        onValueChange = { desc = it },
                        label = { Text("Statement Particulars") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Monthly Recurring Billing")
                        Switch(checked = recurring, onCheckedChange = { recurring = it })
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank() && amount > 0) {
                        onConfirm(name, tin, invoiceNo, dueDate, amount, desc, recurring)
                    }
                },
                enabled = name.isNotBlank() && amount > 0,
                modifier = Modifier.testTag("save_billing_button")
            ) {
                Text("Create Statement")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
