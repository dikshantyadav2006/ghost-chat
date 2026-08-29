package com.dikshant.ghostchat.core.util

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import com.dikshant.ghostchat.core.Ghost
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.sin

/**
 * Tone-based sound effects (no bundled assets). Ringtone loops a two-tone
 * pattern; send/receive play short blips. Respects the device profile like
 * WhatsApp: silent → nothing, vibrate → vibrate, normal → ring.
 */
object Sound {
    private const val SAMPLE_RATE = 22050
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var ringJob: Job? = null

    private fun ringerMode(): Int {
        val am = Ghost.context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.ringerMode
    }

    fun playSend() {
        tone(listOf(880.0 to 120))
    }

    fun playReceive() {
        tone(listOf(660.0 to 90, 880.0 to 120))
    }

    fun playRingtone() {
        if (ringJob != null) return
        when (ringerMode()) {
            AudioManager.RINGER_MODE_SILENT -> return
            AudioManager.RINGER_MODE_VIBRATE -> {
                vibrateRing()
                return
            }
        }
        ringJob = scope.launch {
            while (isActive) {
                tone(listOf(740.0 to 400), block = true)
                tone(listOf(588.0 to 400), block = true)
            }
        }
    }

    fun stopRingtone() {
        ringJob?.cancel()
        ringJob = null
        runCatching {
            Ghost.context.getSystemService(Vibrator::class.java)?.cancel()
        }
    }

    fun playCallAccepted() {
        tone(listOf(520.0 to 200, 780.0 to 240))
    }

    fun playCallEnded() {
        tone(listOf(520.0 to 160, 320.0 to 200))
    }

    private fun vibrateRing() {
        val vibrator = Ghost.context.getSystemService(Vibrator::class.java) ?: return
        if (!vibrator.hasVibrator()) return
        val pattern = longArrayOf(0, 600, 400, 600, 400, 1200)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 2))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(pattern, 2)
        }
    }

    /** Plays a sequence of (frequencyHz, durationMs) tones. */
    fun tone(pattern: List<Pair<Double, Long>>, block: Boolean = false) {
        if (ringerMode() != AudioManager.RINGER_MODE_NORMAL) return
        val run: suspend () -> Unit = {
            withContext(Dispatchers.Default) {
                for ((freq, durMs) in pattern) playTone(freq, durMs)
            }
        }
        if (block) {
            scope.launch { run() }
        } else {
            scope.launch { run() }
        }
    }

    private suspend fun playTone(freq: Double, durationMs: Long) {
        val numSamples = (SAMPLE_RATE * durationMs / 1000.0).toInt()
        if (numSamples <= 0) return
        val buffer = ShortArray(numSamples)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / SAMPLE_RATE
            val envelope = (1.0 - i.toDouble() / numSamples).coerceIn(0.0, 1.0)
            buffer[i] = (sin(2 * PI * freq * t) * envelope * Short.MAX_VALUE * 0.35).toInt().toShort()
        }
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build(),
            )
            .setBufferSizeInBytes(buffer.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        try {
            track.write(buffer, 0, buffer.size)
            track.play()
            delay(durationMs + 40)
        } catch (e: Exception) {
            // ignore
        } finally {
            runCatching { track.stop() }
            track.release()
        }
    }
}
