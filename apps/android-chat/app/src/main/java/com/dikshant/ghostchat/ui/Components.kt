package com.dikshant.ghostchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.io.File

fun parseColor(hex: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (e: Exception) {
        com.dikshant.ghostchat.ui.theme.GhostMint
    }
}

@Composable
fun Avatar(
    emoji: String,
    color: String,
    photo: String?,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(parseColor(color)),
        contentAlignment = Alignment.Center,
    ) {
        val localPhoto = photo?.let { p -> File(p).takeIf { it.exists() } }
        if (localPhoto != null) {
            AsyncImage(
                model = localPhoto,
                contentDescription = null,
                modifier = Modifier.size(size).clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(emoji, fontSize = (size.value * 0.5f).sp)
        }
    }
}
