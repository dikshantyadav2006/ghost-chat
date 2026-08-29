package com.dikshant.ghostchat.ui

import android.media.MediaRecorder
import android.os.Build
import com.dikshant.ghostchat.core.Ghost
import java.io.File

/**
 * Records voice notes as audio/mp4 (AAC/M4A) so the web client can play them
 * (it supports audio/webm|audio/mp4|audio/ogg). Max 120s like the web.
 */
class VoiceRecorder {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startTime = 0L

    val maxDurationMs: Long = 120_000

    /** Returns the target file; caller tracks duration and calls stop(). */
    fun start(): File {
        val dir = File(Ghost.context.cacheDir, "voice").apply { mkdirs() }
        val file = File(dir, "voice-${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(Ghost.context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioSamplingRate(48000)
        r.setAudioEncodingBitRate(128_000)
        r.setAudioChannels(1)
        r.setOutputFile(file.absolutePath)
        r.prepare()
        r.start()
        recorder = r
        outputFile = file
        startTime = System.currentTimeMillis()
        return file
    }

    fun elapsedMs(): Long = System.currentTimeMillis() - startTime

    /** Stops and finalizes; returns the recording when long enough to send. */
    fun stop(): File? {
        val r = recorder
        val file = outputFile
        recorder = null
        outputFile = null
        if (r == null) return null
        return try {
            r.stop()
            r.release()
            if (file != null && file.exists() && file.length() > 0) file else null
        } catch (e: Exception) {
            r.release()
            null
        }
    }

    fun cancel() {
        val r = recorder
        val file = outputFile
        recorder = null
        outputFile = null
        if (r == null) return
        try {
            r.stop()
        } catch (e: Exception) {
            // ignore
        }
        r.release()
        file?.delete()
    }
}
