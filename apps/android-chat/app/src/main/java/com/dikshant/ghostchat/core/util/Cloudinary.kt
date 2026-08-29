package com.dikshant.ghostchat.core.util

import com.dikshant.ghostchat.BuildConfig
import com.dikshant.ghostchat.core.Ghost
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

/**
 * Optional Cloudinary upload for avatar photos (mirrors lib/cloudinary.ts).
 * When unconfigured, the photo is stored as a local data URL instead.
 */
object Cloudinary {

    fun isConfigured(): Boolean =
        BuildConfig.CLOUDINARY_CLOUD_NAME.isNotEmpty() && BuildConfig.CLOUDINARY_UPLOAD_PRESET.isNotEmpty()

    /** Uploads image bytes; returns a remote URL, or falls back to a local file path. */
    fun uploadImage(data: ByteArray): String {
        if (isConfigured()) {
            try {
                return uploadToCloudinary(data)
            } catch (e: Exception) {
                // fall through to local
            }
        }
        return saveLocal(data)
    }

    private fun uploadToCloudinary(data: ByteArray): String {
        val boundary = "----ghost" + System.nanoTime()
        val name = BuildConfig.CLOUDINARY_CLOUD_NAME
        val url = URL("https://api.cloudinary.com/v1_1/$name/image/upload")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            val preset = BuildConfig.CLOUDINARY_UPLOAD_PRESET
            val body = buildMultipart(boundary, preset, data)
            conn.outputStream.use { it.write(body) }
            if (conn.responseCode !in 200..299) throw IllegalStateException("upload failed ${conn.responseCode}")
            val text = conn.inputStream.bufferedReader().readText()
            val json = org.json.JSONObject(text)
            return json.getString("secure_url")
        } finally {
            conn.disconnect()
        }
    }

    private fun buildMultipart(boundary: String, preset: String, data: ByteArray): ByteArray {
        val sb = StringBuilder()
        sb.append("--").append(boundary).append("\r\n")
        sb.append("Content-Disposition: form-data; name=\"upload_preset\"\r\n\r\n")
        sb.append(preset).append("\r\n")
        sb.append("--").append(boundary).append("\r\n")
        sb.append("Content-Disposition: form-data; name=\"file\"; filename=\"avatar\"\r\n")
        sb.append("Content-Type: application/octet-stream\r\n\r\n")
        val head = sb.toString().toByteArray(Charsets.UTF_8)
        val tail = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
        val out = ByteArray(head.size + data.size + tail.size)
        System.arraycopy(head, 0, out, 0, head.size)
        System.arraycopy(data, 0, out, head.size, data.size)
        System.arraycopy(tail, 0, out, head.size + data.size, tail.size)
        return out
    }

    private fun saveLocal(data: ByteArray): String {
        val dir = File(Ghost.context.filesDir, "avatars").apply { mkdirs() }
        val file = File(dir, "avatar-${System.currentTimeMillis()}.png")
        file.writeBytes(data)
        return file.absolutePath
    }

    fun localAvatarAsDataUrl(path: String?): String? {
        if (path == null) return null
        val file = File(path)
        if (!file.exists()) return null
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(file.readBytes())
    }
}
