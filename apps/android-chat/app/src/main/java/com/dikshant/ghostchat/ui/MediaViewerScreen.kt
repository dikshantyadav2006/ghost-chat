package com.dikshant.ghostchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.dikshant.ghostchat.core.Ghost
import java.io.File

/** Full-screen media lightbox (photo/video/generic file), port of MediaLightbox.tsx. */
@Composable
fun MediaViewerScreen(fileId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    var fileRow by remember { mutableStateOf<com.dikshant.ghostchat.core.db.FileRow?>(null) }
    LaunchedEffect(fileId) {
        fileRow = Ghost.repo.getFile(fileId)
    }
    val f = fileRow
    val path = f?.path?.let { File(it) }?.takeIf { it.exists() }
        ?: f?.sourcePath?.let { File(it) }?.takeIf { it.exists() }
    val isImage = f?.mime?.startsWith("image/") == true
    val isVideo = f?.mime?.startsWith("video/") == true

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF000000)),
    ) {
        when {
            path != null && isImage -> {
                AsyncImage(
                    model = path,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            path != null && isVideo -> {
                androidx.compose.ui.viewinterop.AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        androidx.media3.ui.PlayerView(ctx).apply {
                            val player = androidx.media3.exoplayer.ExoPlayer.Builder(ctx).build()
                            this.player = player
                            player.setMediaItem(androidx.media3.common.MediaItem.fromUri(android.net.Uri.fromFile(path)))
                            player.prepare()
                            player.playWhenReady = true
                        }
                    },
                    update = { view ->
                        view.player?.setMediaItem(
                            androidx.media3.common.MediaItem.fromUri(android.net.Uri.fromFile(path)),
                        )
                        view.player?.prepare()
                        view.player?.playWhenReady = true
                    },
                    onRelease = { view ->
                        view.player?.release()
                    },
                )
            }
            else -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = f?.name ?: "File",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                    )
                }
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp)
                .background(Color(0x66000000)),
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
        if (f != null) {
            Text(
                text = f.name,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(16.dp)
                    .background(Color(0x66000000))
                    .padding(8.dp),
            )
        }
    }
}
