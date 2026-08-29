package com.dikshant.ghostchat.core.util

import android.graphics.Bitmap
import com.dikshant.ghostchat.core.Ghost
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.dikshant.ghostchat.core.protocol.ROOM_CODE_ALPHABET

/**
 * QR generation (ZXing) + join-code extraction, matching the web: the QR
 * encodes `https://<origin>/join/<code>` and the scanner accepts a full join
 * URL or a bare code.
 */
object Qr {

    fun generateJoinQr(code: String, size: Int = 512): Bitmap {
        val content = "${Ghost.appOrigin}/join/${code.removePrefix("ghostchat://join/")}"
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (matrix[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            }
        }
        return bitmap
    }

    /** Extracts a canonical room code from a scanned QR payload. */
    fun extractJoinCode(raw: String): String? {
        val text = raw.trim()
        val urlMatch = Regex("(?:ghostchat://join/|https?://[^/]+/join/)([A-Za-z0-9-]+)").find(text)
        if (urlMatch != null) {
            val candidate = urlMatch.groupValues[1].uppercase().filter { it.isLetterOrDigit() }
            return normalize(candidate)
        }
        return normalize(text)
    }

    private fun normalize(code: String): String? {
        val cleaned = code.uppercase().filter { it.isLetterOrDigit() }
        if (cleaned.length != 8) return null
        for (c in cleaned) if (c !in ROOM_CODE_ALPHABET) return null
        return cleaned
    }
}
