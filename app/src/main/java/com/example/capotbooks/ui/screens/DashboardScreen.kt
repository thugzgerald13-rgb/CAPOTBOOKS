package com.example.capotbooks.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.capotbooks.ui.components.StatCard
import com.example.capotbooks.ui.components.StatusBadge
import com.example.capotbooks.ui.components.formatCurrency
import com.example.capotbooks.ui.theme.BrandAmber500
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandDanger500
import com.example.capotbooks.ui.theme.BrandSuccess500
import com.example.capotbooks.ui.theme.BrandSuccess600
import com.example.capotbooks.ui.theme.Slate100
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingUiState
import com.example.capotbooks.ui.viewmodel.Screen

@Composable
fun DashboardScreen(
    state: AccountingUiState,
    onNavigate: (Screen) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("dashboard_screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Welcome & Compliance Banner
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth().testTag("compliance_banner")
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(BrandAmber500),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Tax Alert",
                            tint = Color.White
                        )
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "BIR Compliance Notice",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Text(
                            text = "Upcoming: 2550Q Quarterly VAT due Oct 25. Ensure all sales output tax and purchases input tax are reconciled.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }

        // Primary KPI Grid
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatCard(
                    title = "Revenue",
                    amount = state.totalRevenue,
                    subtitle = "Gross billable sales",
                    icon = Icons.Default.TrendingUp,
                    iconTint = BrandSuccess500,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Expenses",
                    amount = state.totalExpenses,
                    subtitle = "Operating expenses",
                    icon = Icons.Default.TrendingDown,
                    iconTint = BrandDanger500,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatCard(
                    title = "Net Income",
                    amount = state.netIncome,
                    subtitle = if (state.netIncome >= 0) "Net Profit" else "Net Loss",
                    icon = Icons.Default.Assessment,
                    iconTint = if (state.netIncome >= 0) BrandSuccess500 else BrandDanger500,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "Cash in Bank",
                    amount = state.cashInBank,
                    subtitle = "Live balance (1010)",
                    icon = Icons.Default.AccountBalance,
                    iconTint = BrandBlue600,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Working Capital: AR vs AP
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth().testTag("working_capital_card")
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Working Capital & Cash Position",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "Accounts Receivable", style = MaterialTheme.typography.bodyMedium, color = Slate500)
                            Text(text = formatCurrency(state.accountsReceivable), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = BrandBlue600)
                        }
                        Column {
                            Text(text = "Accounts Payable", style = MaterialTheme.typography.bodyMedium, color = Slate500)
                            Text(text = formatCurrency(state.accountsPayable), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = BrandAmber500)
                        }
                    }
                }
            }
        }

        // Quick Navigation Buttons
        item {
            Text(
                text = "Quick Actions",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                QuickActionButton(
                    icon = Icons.Default.Receipt,
                    label = "New Sale",
                    onClick = { onNavigate(Screen.Sales) },
                    modifier = Modifier.weight(1f)
                )
                QuickActionButton(
                    icon = Icons.Default.ShoppingCart,
                    label = "Purchase",
                    onClick = { onNavigate(Screen.Purchases) },
                    modifier = Modifier.weight(1f)
                )
                QuickActionButton(
                    icon = Icons.Default.Description,
                    label = "Journal",
                    onClick = { onNavigate(Screen.JournalVoucher) },
                    modifier = Modifier.weight(1f)
                )
                QuickActionButton(
                    icon = Icons.Default.Assessment,
                    label = "Reports",
                    onClick = { onNavigate(Screen.FinancialReports) },
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Recent Transactions Section
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Recent Transactions",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "View All Sales",
                    style = MaterialTheme.typography.labelLarge,
                    color = BrandBlue600,
                    modifier = Modifier.clickable { onNavigate(Screen.Sales) }
                )
            }
        }

        items(state.sales.take(4)) { sale ->
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = sale.buyerName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "${sale.ref} • ${sale.date}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Slate500
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = formatCurrency(sale.amount),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = BrandSuccess600
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        StatusBadge(text = sale.vatType, color = BrandBlue600)
                    }
                }
            }
        }
    }
}

@Composable
fun QuickActionButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .clickable { onClick() }
            .testTag("quick_action_${label.lowercase().replace(" ", "_")}"),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 14.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = BrandBlue600,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
