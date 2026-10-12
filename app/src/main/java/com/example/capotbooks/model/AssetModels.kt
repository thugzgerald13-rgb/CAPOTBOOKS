package com.example.capotbooks.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlin.math.max
import kotlin.math.min

@Entity(tableName = "asset_lapsing")
data class AssetLapsingEntry(
    @PrimaryKey
    val id: String,
    val datePurchased: String,
    val invoiceNo: String,
    val description: String,
    val cost: Double,
    val usefulLifeYears: Int,
    val salvageValue: Double = 0.0,
    val method: String = "straight-line" // straight-line, declining-balance, sum-of-years
)

object DepreciationEngine {
    fun annualDepreciation(asset: AssetLapsingEntry, yearIndex: Int): Double {
        if (asset.usefulLifeYears <= 0 || yearIndex < 0 || yearIndex >= asset.usefulLifeYears) return 0.0
        val base = max(0.0, asset.cost - asset.salvageValue)
        return when (asset.method) {
            "declining-balance" -> {
                val rate = 2.0 / asset.usefulLifeYears
                var nbv = asset.cost
                for (y in 0 until yearIndex) {
                    nbv = max(asset.salvageValue, nbv - nbv * rate)
                }
                max(0.0, min(nbv - asset.salvageValue, nbv * rate))
            }
            "sum-of-years" -> {
                val soy = (asset.usefulLifeYears * (asset.usefulLifeYears + 1)) / 2.0
                base * ((asset.usefulLifeYears - yearIndex) / soy)
            }
            else -> base / asset.usefulLifeYears // straight-line
        }
    }

    fun accumulatedDepreciation(asset: AssetLapsingEntry, elapsedYears: Int): Double {
        var acc = 0.0
        for (y in 0 until min(elapsedYears, asset.usefulLifeYears)) {
            acc += annualDepreciation(asset, y)
        }
        return min(acc, asset.cost - asset.salvageValue)
    }

    fun netBookValue(asset: AssetLapsingEntry, elapsedYears: Int): Double {
        return asset.cost - accumulatedDepreciation(asset, elapsedYears)
    }
}
