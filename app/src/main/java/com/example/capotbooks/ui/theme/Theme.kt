package com.example.capotbooks.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColorScheme = lightColorScheme(
    primary = BrandBlue600,
    onPrimary = Color.White,
    primaryContainer = BrandBlue100,
    onPrimaryContainer = BrandBlue900,
    secondary = BrandSuccess600,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD1FAE5),
    onSecondaryContainer = Color(0xFF065F46),
    tertiary = BrandAmber500,
    onTertiary = Color.White,
    background = Slate50,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate700,
    outline = Slate200,
    error = BrandDanger600,
    onError = Color.White
)

private val DarkColorScheme = darkColorScheme(
    primary = BrandBlue500,
    onPrimary = Color.White,
    primaryContainer = BrandBlue800,
    onPrimaryContainer = BrandBlue100,
    secondary = BrandSuccess500,
    onSecondary = Color.White,
    background = Slate900,
    onBackground = Color(0xFFF1F5F9),
    surface = Slate800,
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Slate700,
    onSurfaceVariant = Slate300,
    outline = Slate700,
    error = BrandDanger500,
    onError = Color.White
)

@Composable
fun CapotBooksTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
