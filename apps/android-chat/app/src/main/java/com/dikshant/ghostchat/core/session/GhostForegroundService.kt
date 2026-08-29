package com.dikshant.ghostchat.core.session

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import com.dikshant.ghostchat.MainActivity
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.util.Net
import com.dikshant.ghostchat.core.util.Notify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps the signaling socket + all room sessions alive while the app is
 * backgrounded, mirroring WhatsApp/Instagram's always-on connection. Watches
 * connectivity and force-reconnects the socket the moment the network is back,
 * so the app is always "ready to connect" in the background.
 */
class GhostForegroundService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var watchJob: Job? = null
    private var statusJob: Job? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val contentIntent: PendingIntent by lazy {
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    override fun onCreate() {
        super.onCreate()
        registerNetworkWatcher()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        GhostCore.ensureSessions(this)
        startWatchdog()
        startStatusNotifier()
        return START_STICKY
    }

    override fun onDestroy() {
        watchJob?.cancel()
        statusJob?.cancel()
        unregisterNetworkWatcher()
        stopForegroundCompat()
        super.onDestroy()
    }

    /** Snap back online the instant connectivity returns. */
    private fun registerNetworkWatcher() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Ghost.socketManager.reconnectNow()
                GhostCore.ensureSessions(this@GhostForegroundService)
            }
        }
        try {
            cm.registerDefaultNetworkCallback(networkCallback!!)
        } catch (e: Exception) {
            networkCallback = null
        }
    }

    private fun unregisterNetworkWatcher() {
        val cb = networkCallback ?: return
        networkCallback = null
        try {
            (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager)
                .unregisterNetworkCallback(cb)
        } catch (e: Exception) {
            // already unregistered
        }
    }

    /** Safety net: if the socket ever drops while offline, reconnect on its own. */
    private fun startWatchdog() {
        if (watchJob != null) return
        watchJob = scope.launch {
            while (isActive) {
                delay(15_000)
                if (!Ghost.socketManager.isConnected() && Net.isOnline(this@GhostForegroundService)) {
                    Ghost.socketManager.reconnectNow()
                    GhostCore.ensureSessions(this@GhostForegroundService)
                }
            }
        }
    }

    /** Keep the notification honest: "Connected · n chats ready" vs "Reconnecting…". */
    private fun startStatusNotifier() {
        if (statusJob != null) return
        statusJob = scope.launch {
            Ghost.socketManager.connected.collect { online ->
                if (online) {
                    // Let openAllRooms finish so the room count is accurate.
                    delay(1500)
                    val count = try {
                        Ghost.repo.getRooms().size
                    } catch (e: Exception) {
                        0
                    }
                    updateStatusNotification("Connected · $count chat${if (count == 1) "" else "s"} ready")
                } else {
                    updateStatusNotification("Reconnecting…")
                }
            }
        }
    }

    private fun updateStatusNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification: Notification = Notify.foregroundBuilder(
            this,
            Notify.CHANNEL_CONNECTION,
            "",
            text,
        )
            .setContentIntent(contentIntent)
            .build()
        nm.notify(1, notification)
    }

    private fun startForegroundCompat() {
        val channel = NotificationChannel(
            Notify.CHANNEL_CONNECTION,
            "Connection",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Keeps your chats connected in the background"
            setShowBadge(false)
        }
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(channel)

        val notification: Notification = Notify.foregroundBuilder(
            this,
            Notify.CHANNEL_CONNECTION,
            "",
            "",
        )
            .setContentIntent(contentIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, notification)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }
}

/** Shared logic for (re)opening all stored rooms when the FGS starts. */
object GhostCore {
    fun ensureSessions(context: Context) {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope.launch {
            val id = com.dikshant.ghostchat.core.Ghost.repo.getIdentity() ?: return@launch
            val protocolId = com.dikshant.ghostchat.core.protocol.Identity(
                userId = id.userId,
                name = id.name,
                publicKey = id.publicKey,
            )
            com.dikshant.ghostchat.core.Ghost.sessionManager.connect(protocolId)
            com.dikshant.ghostchat.core.Ghost.sessionManager.openAllRooms(protocolId)
        }
    }
}
