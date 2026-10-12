package com.example.capotbooks.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "business_profile")
data class BusinessProfile(
    @PrimaryKey
    val id: String = "default",
    val name: String = "CAPOT ENTERPRISE",
    val tin: String = "123-456-789-000",
    val taxpayerClassification: String = "Individual - VAT",
    val tradeName: String = "CAPOT TRADING & CONSULTING",
    val registeredName: String = "Capot Business Solutions",
    val substreet: String = "",
    val street: String = "Ayala Avenue",
    val barangay: String = "Bel-Air",
    val district: String = "District 1",
    val city: String = "Makati City",
    val zipCode: String = "1209",
    val rdoCode: String = "047",
    val phone: String = "+63 917 123 4567",
    val email: String = "admin@capotbooks.ph",
    val industry: String = "general-services",
    val accountingType: String = "Calendar"
)

@Entity(tableName = "tin_directory")
data class TinEntry(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val type: String, // "customer" or "supplier"
    val tin: String,
    val name: String,
    val address: String = ""
)
