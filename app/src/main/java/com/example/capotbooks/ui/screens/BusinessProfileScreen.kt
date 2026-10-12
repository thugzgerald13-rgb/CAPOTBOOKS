package com.example.capotbooks.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.capotbooks.model.BusinessProfile
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

@Composable
fun BusinessProfileScreen(
    state: AccountingUiState,
    viewModel: AccountingViewModel
) {
    val p = state.profile ?: BusinessProfile()

    var tradeName by remember(p.tradeName) { mutableStateOf(p.tradeName) }
    var tin by remember(p.tin) { mutableStateOf(p.tin) }
    var taxpayerClassification by remember(p.taxpayerClassification) { mutableStateOf(p.taxpayerClassification) }
    var rdoCode by remember(p.rdoCode) { mutableStateOf(p.rdoCode) }
    var registeredName by remember(p.registeredName) { mutableStateOf(p.registeredName) }
    var street by remember(p.street) { mutableStateOf(p.street) }
    var city by remember(p.city) { mutableStateOf(p.city) }
    var phone by remember(p.phone) { mutableStateOf(p.phone) }
    var email by remember(p.email) { mutableStateOf(p.email) }
    var savedMessage by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .testTag("business_profile_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "Taxpayer & Business Profile (COR 2303)",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Official BIR Certificate of Registration parameters required on all invoices",
                style = MaterialTheme.typography.bodySmall,
                color = Slate500
            )
        }

        item {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = tradeName,
                        onValueChange = { tradeName = it },
                        label = { Text("Trade Name / Business Name *") },
                        modifier = Modifier.fillMaxWidth().testTag("profile_trade_name_input")
                    )
                    OutlinedTextField(
                        value = tin,
                        onValueChange = { tin = it },
                        label = { Text("Taxpayer Identification No. (TIN) *") },
                        modifier = Modifier.fillMaxWidth().testTag("profile_tin_input")
                    )
                    OutlinedTextField(
                        value = rdoCode,
                        onValueChange = { rdoCode = it },
                        label = { Text("BIR Revenue District Office (RDO Code) *") },
                        modifier = Modifier.fillMaxWidth().testTag("profile_rdo_input")
                    )
                    OutlinedTextField(
                        value = taxpayerClassification,
                        onValueChange = { taxpayerClassification = it },
                        label = { Text("Taxpayer Classification (e.g. Individual - VAT) *") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = registeredName,
                        onValueChange = { registeredName = it },
                        label = { Text("Registered Line of Business / Industry") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = street,
                        onValueChange = { street = it },
                        label = { Text("Street / Building Address") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = city,
                        onValueChange = { city = it },
                        label = { Text("City / Municipality *") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Contact Number") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Official Email Address") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    if (savedMessage.isNotEmpty()) {
                        Text(
                            text = savedMessage,
                            color = BrandSuccess600,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    Button(
                        onClick = {
                            val updated = p.copy(
                                tradeName = tradeName,
                                tin = tin,
                                rdoCode = rdoCode,
                                taxpayerClassification = taxpayerClassification,
                                registeredName = registeredName,
                                street = street,
                                city = city,
                                phone = phone,
                                email = email
                            )
                            viewModel.saveBusinessProfile(updated)
                            savedMessage = "Profile updated successfully!"
                        },
                        modifier = Modifier.fillMaxWidth().testTag("save_profile_button"),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Save Business Profile")
                    }
                }
            }
        }
    }
}
