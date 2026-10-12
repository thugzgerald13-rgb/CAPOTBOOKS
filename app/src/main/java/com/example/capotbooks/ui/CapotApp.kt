package com.example.capotbooks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.capotbooks.ui.components.CapotTopBar
import com.example.capotbooks.ui.screens.AssetLapsingScreen
import com.example.capotbooks.ui.screens.BillingScreen
import com.example.capotbooks.ui.screens.BusinessProfileScreen
import com.example.capotbooks.ui.screens.ChartOfAccountsScreen
import com.example.capotbooks.ui.screens.ComplianceBirScreen
import com.example.capotbooks.ui.screens.DashboardScreen
import com.example.capotbooks.ui.screens.FinancialReportsScreen
import com.example.capotbooks.ui.screens.JournalVoucherScreen
import com.example.capotbooks.ui.screens.PurchasesScreen
import com.example.capotbooks.ui.screens.SalesScreen
import com.example.capotbooks.ui.screens.SpecialJournalsScreen
import com.example.capotbooks.ui.theme.BrandBlue600
import com.example.capotbooks.ui.theme.BrandBlue900
import com.example.capotbooks.ui.theme.Slate500
import com.example.capotbooks.ui.viewmodel.AccountingViewModel
import com.example.capotbooks.ui.viewmodel.Screen
import kotlinx.coroutines.launch

data class DrawerItemData(
    val screen: Screen,
    val icon: ImageVector,
    val label: String
)

@Composable
fun CapotApp(viewModel: AccountingViewModel) {
    val uiState by viewModel.uiState.collectAsState()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // Handle Android system back button
    if (uiState.currentScreen != Screen.Dashboard) {
        BackHandler {
            viewModel.navigateTo(Screen.Dashboard)
        }
    }

    val drawerItems = listOf(
        DrawerItemData(Screen.Dashboard, Icons.Default.Assessment, "Dashboard"),
        DrawerItemData(Screen.Sales, Icons.Default.Receipt, "Sales Invoicing"),
        DrawerItemData(Screen.Purchases, Icons.Default.ShoppingCart, "Purchases & AP"),
        DrawerItemData(Screen.Billing, Icons.Default.Description, "Statements of Account (SOA)"),
        DrawerItemData(Screen.JournalVoucher, Icons.Default.Folder, "Journal Vouchers (JV)"),
        DrawerItemData(Screen.SpecialJournals, Icons.Default.MenuBook, "Books of Accounts (SJ, PJ, GL)"),
        DrawerItemData(Screen.ChartOfAccounts, Icons.Default.AccountBalance, "Chart of Accounts (COA)"),
        DrawerItemData(Screen.FinancialReports, Icons.Default.Assessment, "Financial Statements (AFS)"),
        DrawerItemData(Screen.AssetLapsing, Icons.Default.Domain, "Asset Lapsing Schedule"),
        DrawerItemData(Screen.Compliance, Icons.Default.Schedule, "BIR Compliance & TIN Library"),
        DrawerItemData(Screen.BusinessProfile, Icons.Default.Business, "Business Profile (COR 2303)")
    )

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(modifier = Modifier.width(300.dp)) {
                // Drawer Header
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BrandBlue600)
                        .padding(20.dp)
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(Color.White),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "CB",
                                    color = BrandBlue600,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = "CAPOTBOOKS",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = uiState.profile?.tradeName ?: "CAPOT ENTERPRISE",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White
                        )
                        Text(
                            text = "TIN: ${uiState.profile?.tin ?: "123-456-789-000"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                drawerItems.forEach { item ->
                    val isSelected = uiState.currentScreen == item.screen
                    NavigationDrawerItem(
                        icon = { Icon(item.icon, contentDescription = item.label, tint = if (isSelected) BrandBlue600 else Slate500) },
                        label = { Text(item.label, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                        selected = isSelected,
                        onClick = {
                            viewModel.navigateTo(item.screen)
                            scope.launch { drawerState.close() }
                        },
                        modifier = Modifier
                            .padding(NavigationDrawerItemDefaults.ItemPadding)
                            .testTag("nav_drawer_${item.screen.route}")
                    )
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                CapotTopBar(
                    title = uiState.currentScreen.title,
                    profile = uiState.profile,
                    onOpenDrawer = { scope.launch { drawerState.open() } }
                )
            },
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.testTag("bottom_nav_bar")
                ) {
                    NavigationBarItem(
                        selected = uiState.currentScreen == Screen.Dashboard,
                        onClick = { viewModel.navigateTo(Screen.Dashboard) },
                        icon = { Icon(Icons.Default.Assessment, contentDescription = "Dashboard") },
                        label = { Text("Dashboard") },
                        modifier = Modifier.testTag("bottom_nav_dashboard")
                    )
                    NavigationBarItem(
                        selected = uiState.currentScreen == Screen.Sales,
                        onClick = { viewModel.navigateTo(Screen.Sales) },
                        icon = { Icon(Icons.Default.Receipt, contentDescription = "Sales") },
                        label = { Text("Sales") },
                        modifier = Modifier.testTag("bottom_nav_sales")
                    )
                    NavigationBarItem(
                        selected = uiState.currentScreen == Screen.Purchases,
                        onClick = { viewModel.navigateTo(Screen.Purchases) },
                        icon = { Icon(Icons.Default.ShoppingCart, contentDescription = "Purchases") },
                        label = { Text("Purchases") },
                        modifier = Modifier.testTag("bottom_nav_purchases")
                    )
                    NavigationBarItem(
                        selected = uiState.currentScreen == Screen.FinancialReports,
                        onClick = { viewModel.navigateTo(Screen.FinancialReports) },
                        icon = { Icon(Icons.Default.AccountBalance, contentDescription = "Reports") },
                        label = { Text("Reports") },
                        modifier = Modifier.testTag("bottom_nav_reports")
                    )
                }
            }
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                when (uiState.currentScreen) {
                    Screen.Dashboard -> DashboardScreen(state = uiState, onNavigate = { viewModel.navigateTo(it) })
                    Screen.Sales -> SalesScreen(state = uiState, viewModel = viewModel)
                    Screen.Purchases -> PurchasesScreen(state = uiState, viewModel = viewModel)
                    Screen.Billing -> BillingScreen(state = uiState, viewModel = viewModel)
                    Screen.JournalVoucher -> JournalVoucherScreen(state = uiState, viewModel = viewModel)
                    Screen.SpecialJournals -> SpecialJournalsScreen(state = uiState)
                    Screen.ChartOfAccounts -> ChartOfAccountsScreen(state = uiState, viewModel = viewModel)
                    Screen.FinancialReports -> FinancialReportsScreen(state = uiState)
                    Screen.AssetLapsing -> AssetLapsingScreen(state = uiState, viewModel = viewModel)
                    Screen.Compliance -> ComplianceBirScreen(state = uiState, viewModel = viewModel)
                    Screen.BusinessProfile -> BusinessProfileScreen(state = uiState, viewModel = viewModel)
                }
            }
        }
    }
}
