package com.dikshant.ghostchat

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.session.GhostForegroundService

class GhostChatApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Ghost.init(this)
        // Keep the connection alive while the user is logged in (WhatsApp-style):
        // the FGS already runs when the app goes to the background or is swiped
        // away, so the socket never drops. Also recover after process death via
        // the boot/update receiver + START_STICKY restart.
        if (Ghost.prefs.onboardingComplete && Ghost.prefs.backgroundConnection) {
            ForegroundService.start(this)
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_STOP &&
                    Ghost.prefs.onboardingComplete &&
                    Ghost.prefs.backgroundConnection
                ) {
                    ForegroundService.start(this)
                }
            }
        )
    }
}

/**
 * Starts/stops the keep-alive foreground service. The connection service runs
 * whenever the user is logged in with "Background connection" enabled, so the
 * signaling socket survives closing/swiping the app — like WhatsApp.
 */
object ForegroundService {
    fun start(context: Context) {
        val intent = Intent(context, GhostForegroundService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        } catch (e: Exception) {
            // Background FGS start restrictions (Android 12+) — the boot/update
            // receiver or lifecycle fallback will retry in an allowed state.
        }
    }

    fun stop(context: Context) {
        context.stopService(Intent(context, GhostForegroundService::class.java))
    }
}