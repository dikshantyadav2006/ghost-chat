package com.dikshant.ghostchat.ui

import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.dikshant.ghostchat.core.Ghost

/**
 * App-wide voice playback (Media3/ExoPlayer). The web records webm/opus and
 * mp4/aac; ExoPlayer handles both, which is why we depend on media3-exoplayer.
 */
object GhostAudioPlayer {
    private var player: ExoPlayer? = null
    var currentPath: String? = null
        private set

    fun play(path: String) {
        stop()
        val p = ExoPlayer.Builder(Ghost.context).build().apply {
            setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(java.io.File(path))))
            prepare()
            playWhenReady = true
        }
        player = p
        currentPath = path
    }

    fun toggle(path: String) {
        if (currentPath == path && player?.isPlaying == true) {
            player?.pause()
        } else {
            play(path)
        }
    }

    fun stop() {
        player?.release()
        player = null
        currentPath = null
    }

    /** Current playback position ms, or null when idle. */
    fun positionMs(): Long? = player?.currentPosition?.takeIf { currentPath != null }

    fun durationMs(): Long? = player?.duration?.takeIf { it > 0 && currentPath != null }
}
