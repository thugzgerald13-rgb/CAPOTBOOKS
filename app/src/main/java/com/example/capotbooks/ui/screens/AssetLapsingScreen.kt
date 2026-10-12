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
import com.example.capotbooks.model.AssetLapsingEntry
import com.example.capotbooks.model.DepreciationEngine
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

@Composable
fun AssetLapsingScreen(
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
                modifier = Modifier.testTag("add_asset_fab")
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Fixed Asset")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("asset_lapsing_screen")
        ) {
            Text(
                text = "Fixed Asset Lapsing Schedule (PPE)",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Track acquisition cost, salvage value, accumulated depreciation & net book value",
                style = MaterialTheme.typography.bodySmall,
                color = Slate500
            )

            Spacer(modifier = Modifier.height(14.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(state.assets) { asset ->
                    val accDep = DepreciationEngine.accumulatedDepreciation(asset, 1)
                    val nbv = DepreciationEngine.netBookValue(asset, 1)

                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth().testTag("asset_card_${asset.id}")
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(asset.description, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                    Text("Purchased: ${asset.datePurchased} • Inv: ${asset.invoiceNo} • Life: ${asset.usefulLifeYears} yrs", style = MaterialTheme.typography.bodySmall, color = Slate500)
                                }
                                IconButton(onClick = { viewModel.deleteAsset(asset) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete Asset", tint = BrandDanger500)
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("Acquisition Cost: ${formatCurrency(asset.cost)}", style = MaterialTheme.typography.bodySmall)
                                    Text("Accum. Depreciation: ${formatCurrency(accDep)}", style = MaterialTheme.typography.bodySmall, color = BrandDanger500)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Net Book Value", style = MaterialTheme.typography.labelSmall, color = Slate500)
                                    Text(formatCurrency(nbv), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = BrandSuccess600)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddAssetDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { desc, cost, life, salvage, inv, method ->
                viewModel.createAsset(desc, cost, life, salvage, inv, method)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun AddAssetDialog(
    onDismiss: () -> Unit,
    onConfirm: (desc: String, cost: Double, life: Int, salvage: Double, inv: String, method: String) -> Unit
) {
    var desc by remember { mutableStateOf("") }
    var costText by remember { mutableStateOf("") }
    var lifeText by remember { mutableStateOf("5") }
    var salvageText by remember { mutableStateOf("0.0") }
    var invNo by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Depreciable Fixed Asset", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it },
                    label = { Text("Asset Description *") },
                    modifier = Modifier.fillMaxWidth().testTag("asset_desc_input")
                )
                OutlinedTextField(
                    value = costText,
                    onValueChange = { costText = it },
                    label = { Text("Acquisition Cost (₱) *") },
                    modifier = Modifier.fillMaxWidth().testTag("asset_cost_input")
                )
                OutlinedTextField(
                    value = lifeText,
                    onValueChange = { lifeText = it },
                    label = { Text("Useful Life (Years) *") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = salvageText,
                    onValueChange = { salvageText = it },
                    label = { Text("Salvage / Scrap Value (₱)") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = invNo,
                    onValueChange = { invNo = it },
                    label = { Text("Purchase Invoice #") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val cost = costText.toDoubleOrNull() ?: 0.0
                    val life = lifeText.toIntOrNull() ?: 5
                    val salvage = salvageText.toDoubleOrNull() ?: 0.0
                    if (desc.isNotBlank() && cost > 0) {
                        onConfirm(desc, cost, life, salvage, invNo, "straight-line")
                    }
                },
                modifier = Modifier.testTag("save_asset_button")
            ) {
                Text("Add to Schedule")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
