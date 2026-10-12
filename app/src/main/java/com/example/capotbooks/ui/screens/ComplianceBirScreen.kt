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
import com.example.capotbooks.model.TaxDeadline
import com.example.capotbooks.model.TinEntry
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
fun ComplianceBirScreen(
    state: AccountingUiState,
    viewModel: AccountingViewModel
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showAddTinDialog by remember { mutableStateOf(false) }

    val tabs = listOf("BIR Tax Calendar", "TIN Directory")

    Scaffold(
        floatingActionButton = {
            if (selectedTab == 1) {
                FloatingActionButton(
                    onClick = { showAddTinDialog = true },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.testTag("add_tin_fab")
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add TIN Record")
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("compliance_screen")
        ) {
            Text(
                text = "Bureau of Internal Revenue (BIR) Compliance",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Tax return deadlines, Form 2307, 2550M/Q, 1601-C, and Customer/Supplier TINs",
                style = MaterialTheme.typography.bodySmall,
                color = Slate500
            )

            Spacer(modifier = Modifier.height(10.dp))

            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title, style = MaterialTheme.typography.labelSmall) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (selectedTab == 0) {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.taxDeadlines) { deadline ->
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier.fillMaxWidth().testTag("tax_card_${deadline.id}")
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("BIR Form ${deadline.formType}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                        Text(deadline.title, style = MaterialTheme.typography.bodySmall, color = Slate500)
                                        Text("Period: ${deadline.period} • Due: ${deadline.dueDate}", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = BrandAmber500)
                                    }
                                    StatusBadge(
                                        text = deadline.status,
                                        color = if (deadline.status == "Paid") BrandSuccess600 else BrandAmber500
                                    )
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Estimated Due: ${formatCurrency(deadline.amountDue)}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (deadline.status != "Paid") {
                                        OutlinedButton(
                                            onClick = { viewModel.updateTaxDeadlineStatus(deadline, "Paid") },
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("Mark as Filed & Paid", style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.tinEntries) { entry ->
                        Card(
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            modifier = Modifier.fillMaxWidth().testTag("tin_card_${entry.id}")
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(entry.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    Text("TIN: ${entry.tin}", color = BrandBlue600, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                                    if (entry.address.isNotEmpty()) {
                                        Text(entry.address, color = Slate500, style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    StatusBadge(text = entry.type.uppercase(), color = BrandBlue600)
                                    IconButton(onClick = { viewModel.deleteTinEntry(entry) }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Delete TIN", tint = BrandDanger500)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddTinDialog) {
        AddTinDialog(
            onDismiss = { showAddTinDialog = false },
            onConfirm = { name, tin, type, address ->
                viewModel.addTinEntry(name, tin, type, address)
                showAddTinDialog = false
            }
        )
    }
}

@Composable
fun AddTinDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, tin: String, type: String, address: String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var tin by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("customer") }
    var address by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Register TIN Record", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Registered Entity / Individual Name *") },
                    modifier = Modifier.fillMaxWidth().testTag("tin_name_input")
                )
                OutlinedTextField(
                    value = tin,
                    onValueChange = { tin = it },
                    label = { Text("9-to-12 Digit TIN (xxx-xxx-xxx-000) *") },
                    modifier = Modifier.fillMaxWidth().testTag("tin_number_input")
                )
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Registered Business Address") },
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    TextButton(onClick = { type = "customer" }) {
                        Text(if (type == "customer") "● Customer" else "○ Customer")
                    }
                    TextButton(onClick = { type = "supplier" }) {
                        Text(if (type == "supplier") "● Supplier" else "○ Supplier")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank() && tin.isNotBlank()) {
                        onConfirm(name, tin, type, address)
                    }
                },
                modifier = Modifier.testTag("save_tin_button")
            ) {
                Text("Save to Directory")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
