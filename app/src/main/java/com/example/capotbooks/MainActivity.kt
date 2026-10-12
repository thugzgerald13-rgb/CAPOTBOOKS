package com.example.capotbooks

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.example.capotbooks.data.local.CapotDatabase
import com.example.capotbooks.data.repository.AccountingRepository
import com.example.capotbooks.ui.CapotApp
import com.example.capotbooks.ui.theme.CapotBooksTheme
import com.example.capotbooks.ui.viewmodel.AccountingViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val database = CapotDatabase.getDatabase(applicationContext, lifecycleScope)
        val repository = AccountingRepository(database.accountingDao())

        val viewModel = ViewModelProvider(
            this,
            object : ViewModelProvider.Factory {
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(AccountingViewModel::class.java)) {
                        @Suppress("UNCHECKED_CAST")
                        return AccountingViewModel(repository) as T
                    }
                    throw IllegalArgumentException("Unknown ViewModel class")
                }
            }
        )[AccountingViewModel::class.java]

        setContent {
            CapotBooksTheme {
                CapotApp(viewModel = viewModel)
            }
        }
    }
}
