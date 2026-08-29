package com.dikshant.ghostchat.core.util

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.compose.ui.graphics.toArgb
import com.dikshant.ghostchat.MainActivity
import com.dikshant.ghostchat.R
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.ui.theme.GhostMint

/** Incoming-message notifications (port of lib/notify.ts). */
object Notify {

    const val CHANNEL_MESSAGES = "ghost_messages"
    const val CHANNEL_MESSAGES_NO_SOUND = "ghost_messages_no_sound"
    const val CHANNEL_MESSAGES_NO_VIBRATE = "ghost_messages_no_vibrate"
    const val CHANNEL_MESSAGES_MUTED = "ghost_messages_muted"
    const val CHANNEL_CALLS = "ghost_calls"
    const val CHANNEL_CONNECTION = "ghost_fg"

    fun ensureChannels(context: Context) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Default channel: sound + vibration, following the device profile
        // (normal → ring, vibrate → vibrate only, silent → nothing).
        val messages = NotificationChannel(
            CHANNEL_MESSAGES,
            "Messages",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New messages and voice notes from your contacts"
            enableVibration(true)
        }

        val noSound = NotificationChannel(
            CHANNEL_MESSAGES_NO_SOUND,
            "Messages (vibrate only)",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New messages with sound disabled"
            setSound(null, null)
            enableVibration(true)
        }

        val noVibrate = NotificationChannel(
            CHANNEL_MESSAGES_NO_VIBRATE,
            "Messages (sound only)",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New messages with vibration disabled"
            enableVibration(false)
        }

        val muted = NotificationChannel(
            CHANNEL_MESSAGES_MUTED,
            "Messages (silent)",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New messages with sound and vibration disabled"
            setSound(null, null)
            enableVibration(false)
        }

        val calls = NotificationChannel(
            CHANNEL_CALLS,
            "Calls",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Incoming and ongoing calls"
            enableVibration(true)
        }

        val connection = NotificationChannel(
            CHANNEL_CONNECTION,
            "Connection",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Keeps your chats connected in the background"
            setShowBadge(false)
        }

        nm.createNotificationChannel(messages)
        nm.createNotificationChannel(noSound)
        nm.createNotificationChannel(noVibrate)
        nm.createNotificationChannel(muted)
        nm.createNotificationChannel(calls)
        nm.createNotificationChannel(connection)
    }

    /**
     * Posts a notification for an incoming message. Uses per-room stacking:
     * new messages for the same contact replace the previous one so the tray
     * doesn't flood, while the BigText style keeps long messages readable.
     */
    fun notifyIncoming(roomId: String, peerName: String, text: String) {
        if (!Ghost.prefs.notifications) return
        val context = Ghost.context
        ensureChannels(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("roomId", roomId)
            putExtra("joinCode", roomId)
        }
        val pending = PendingIntent.getActivity(
            context,
            roomId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val style: NotificationCompat.Style? = if (text.length > 60) {
            NotificationCompat.BigTextStyle().bigText(text)
        } else {
            null
        }

        val builder = NotificationCompat.Builder(context, channelId())
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(GhostMint.toArgb())
            .setColorized(true)
            .setContentTitle(peerName)
            .setContentText(text)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setOnlyAlertOnce(false)

        try {
            NotificationManagerCompat.from(context).notify(roomId.hashCode(), builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted — silent
        }
    }

    /** Picks the channel matching the user's sound/haptics prefs. */
    private fun channelId(): String = when {
        Ghost.prefs.sound && Ghost.prefs.haptics -> CHANNEL_MESSAGES
        !Ghost.prefs.sound && Ghost.prefs.haptics -> CHANNEL_MESSAGES_NO_SOUND
        Ghost.prefs.sound && !Ghost.prefs.haptics -> CHANNEL_MESSAGES_NO_VIBRATE
        else -> CHANNEL_MESSAGES_MUTED
    }

    fun cancelForRoom(roomId: String) {
        val nm = Ghost.context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(roomId.hashCode())
    }

    /** Convenience for building consistent FGS notifications. */
    fun foregroundBuilder(
        context: Context,
        channelId: String,
        title: String,
        text: String,
    ): NotificationCompat.Builder = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(GhostMint.toArgb())
        .setColorized(true)
        .setContentTitle(title)
        .setContentText(text)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setSilent(true)
        .setBadgeIconType(NotificationCompat.BADGE_ICON_NONE)
        .setNumber(0)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
}
