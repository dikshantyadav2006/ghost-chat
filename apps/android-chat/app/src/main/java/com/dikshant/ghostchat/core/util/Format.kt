package com.dikshant.ghostchat.core.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Text formatting helpers mirroring apps/chat/src/lib/format.ts. */
object Format {

    private val timeFmt = SimpleDateFormat("h:mm a", Locale.US)
    private val dateFmt = SimpleDateFormat("d MMM", Locale.US)
    private val fullDateFmt = SimpleDateFormat("d MMM yyyy, h:mm a", Locale.US)

    fun time(ts: Long): String = timeFmt.format(Date(ts))

    fun dayLabel(ts: Long): String {
        val now = System.currentTimeMillis()
        val startOfToday = startOfDay(now)
        return when {
            ts >= startOfToday -> "Today"
            ts >= startOfToday - 86_400_000L -> "Yesterday"
            else -> dateFmt.format(Date(ts))
        }
    }

    fun fullDate(ts: Long): String = fullDateFmt.format(Date(ts))

    private fun startOfDay(ts: Long): Long {
        val cal = java.util.Calendar.getInstance()
        cal.timeInMillis = ts
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    fun fileSize(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format(Locale.US, "%.0f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format(Locale.US, "%.1f MB", mb)
        val gb = mb / 1024.0
        return String.format(Locale.US, "%.2f GB", gb)
    }

    fun duration(ms: Long): String {
        val totalSec = ms / 1000
        val m = totalSec / 60
        val s = totalSec % 60
        return String.format(Locale.US, "%d:%02d", m, s)
    }

    fun messagePreview(kind: String, text: String?, voice: Boolean, fileName: String?): String =
        when {
            kind == "file" && voice -> "🎤 Voice message"
            kind == "file" -> "📎 ${fileName ?: "File"}"
            else -> text ?: ""
        }

    /** Truncates a long text to a single-line preview. */
    fun clip(text: String, max: Int = 40): String =
        if (text.length <= max) text else text.take(max - 1) + "…"
}
