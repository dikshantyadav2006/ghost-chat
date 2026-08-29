package com.dikshant.ghostchat.core.session

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.dikshant.ghostchat.MainActivity
import com.dikshant.ghostchat.core.util.Notify

/** Foreground service held during an active voice/video call. */
class CallConnectionService : Service() {

    private var video = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        video = intent?.getBooleanExtra("video", false) ?: false
        startCallNotification()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun startCallNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel("ghost_call", "Calls", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while a call is in progress"
                setShowBadge(false)
            },
        )
        val contentIntent = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = Notify.foregroundBuilder(
            this,
            "ghost_call",
            "Ghost Chat call",
            "Call in progress",
        )
            .setContentIntent(contentIntent)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val type = if (video) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(2, notification, type)
        } else {
            startForeground(2, notification)
        }
    }

    companion object {
        fun start(context: Context, video: Boolean) {
            val intent = Intent(context, CallConnectionService::class.java).putExtra("video", video)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallConnectionService::class.java))
        }
    }
}
