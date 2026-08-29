package com.dikshant.ghostchat.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val GhostColorScheme = darkColorScheme(
    primary = GhostMint,
    onPrimary = Color(0xFFE9FFFB),
    primaryContainer = GhostMintDark,
    onPrimaryContainer = Color(0xFFD6F7EF),
    secondary = GhostBlue,
    onSecondary = Color(0xFF0B1B22),
    secondaryContainer = GhostRaised,
    onSecondaryContainer = GhostText,
    tertiary = GhostRed,
    onTertiary = Color.White,
    background = GhostInk,
    onBackground = GhostText,
    surface = GhostSurface,
    onSurface = GhostText,
    surfaceVariant = GhostRaised,
    onSurfaceVariant = GhostSoft,
    outline = GhostLine,
    outlineVariant = GhostLine,
    error = GhostRed,
    onError = Color.White,
    errorContainer = Color(0xFF4A2530),
    onErrorContainer = Color(0xFFFFDAD6),
)

@Composable
fun GhostChatTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = GhostColorScheme,
        typography = Typography,
        content = content,
    )
}
