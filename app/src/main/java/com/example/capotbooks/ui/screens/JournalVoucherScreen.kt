package com.example.capotbooks.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.capotbooks.model.JournalVoucher
import com.example.capotbooks.model.JournalVoucherLine
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel
import java.util.UUID

@Composable
fun JournalVoucherScreen(
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
                modifier = Modifier.testTag("add_jv_fab")
            ) {
                Icon(Icons.Default.Add, contentDescription = "New Journal Voucher")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("journal_voucher_screen")
        ) {
            Text(
                text = "General Journal & Adjusting Entries",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Double-entry bookkeeping vouchers with real-time debit = credit balance",
                style = MaterialTheme.typography.bodySmall,
                color = Slate500
            )

            Spacer(modifier = Modifier.height(14.dp))

            if (state.journalVouchers.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("No Journal Vouchers Recorded", fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Create a journal voucher to record depreciation, accruals, or manual GL adjustments.", color = Slate500, style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.journalVouchers) { voucher ->
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier.fillMaxWidth().testTag("jv_card_${voucher.id}")
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(text = "Voucher: ${voucher.reference}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                        Text(text = "Date: ${voucher.date} • ${voucher.memo}", style = MaterialTheme.typography.bodySmall, color = Slate500)
                                    }
                                    Text(
                                        text = formatCurrency(voucher.totalDebit),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = BrandSuccess600
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddJournalVoucherDialog(
            accounts = state.accounts,
            onDismiss = { showAddDialog = false },
            onConfirm = { ref, memo, lines ->
                viewModel.createJournalVoucher(ref, memo, lines)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun AddJournalVoucherDialog(
    accounts: List<com.example.capotbooks.model.CoaAccount>,
    onDismiss: () -> Unit,
    onConfirm: (reference: String, memo: String, lines: List<JournalVoucherLine>) -> Unit
) {
    var reference by remember { mutableStateOf("") }
    var memo by remember { mutableStateOf("") }

    var debitAccount by remember { mutableStateOf("6050") } // Depreciation
    var debitAmountText by remember { mutableStateOf("") }
    var creditAccount by remember { mutableStateOf("1520") } // Accumulated Dep
    var creditAmountText by remember { mutableStateOf("") }

    val debitAmount = debitAmountText.toDoubleOrNull() ?: 0.0
    val creditAmount = creditAmountText.toDoubleOrNull() ?: 0.0
    val isBalanced = debitAmount > 0 && debitAmount == creditAmount

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Journal Voucher (Double-Entry)", fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    OutlinedTextField(
                        value = reference,
                        onValueChange = { reference = it },
                        label = { Text("JV Reference #") },
                        modifier = Modifier.fillMaxWidth().testTag("jv_ref_input")
                    )
                }
                item {
                    OutlinedTextField(
                        value = memo,
                        onValueChange = { memo = it },
                        label = { Text("Particulars / Memo *") },
                        modifier = Modifier.fillMaxWidth().testTag("jv_memo_input")
                    )
                }
                item {
                    Text("Debit Entry (Dr)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(
                        value = debitAmountText,
                        onValueChange = { debitAmountText = it },
                        label = { Text("Debit Amount (₱) *") },
                        modifier = Modifier.fillMaxWidth().testTag("jv_debit_amount_input")
                    )
                }
                item {
                    Text("Credit Entry (Cr)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(
                        value = creditAmountText,
                        onValueChange = { creditAmountText = it },
                        label = { Text("Credit Amount (₱) *") },
                        modifier = Modifier.fillMaxWidth().testTag("jv_credit_amount_input")
                    )
                }
                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = if (isBalanced) BrandSuccess500.copy(alpha = 0.1f) else BrandDanger500.copy(alpha = 0.1f)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = if (isBalanced) Icons.Default.CheckCircle else Icons.Default.ErrorOutline,
                                contentDescription = null,
                                tint = if (isBalanced) BrandSuccess600 else BrandDanger500
                            )
                            Spacer(modifier = Modifier.padding(4.dp))
                            Text(
                                text = if (isBalanced) "Voucher is Balanced (Dr: ${formatCurrency(debitAmount)} = Cr: ${formatCurrency(creditAmount)})"
                                else "Out of balance! Debit and Credit must match exactly.",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isBalanced) BrandSuccess600 else BrandDanger500
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (memo.isNotBlank() && isBalanced) {
                        val lines = listOf(
                            JournalVoucherLine(
                                id = UUID.randomUUID().toString(),
                                voucherId = "",
                                accountId = debitAccount,
                                accountName = accounts.find { it.id == debitAccount }?.name ?: "Depreciation Expense",
                                debit = debitAmount,
                                credit = 0.0
                            ),
                            JournalVoucherLine(
                                id = UUID.randomUUID().toString(),
                                voucherId = "",
                                accountId = creditAccount,
                                accountName = accounts.find { it.id == creditAccount }?.name ?: "Accumulated Depreciation",
                                debit = 0.0,
                                credit = creditAmount
                            )
                        )
                        onConfirm(reference, memo, lines)
                    }
                },
                enabled = memo.isNotBlank() && isBalanced,
                modifier = Modifier.testTag("save_jv_button")
            ) {
                Text("Post Voucher")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
