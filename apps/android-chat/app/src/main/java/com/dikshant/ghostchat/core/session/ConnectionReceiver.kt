package com.dikshant.ghostchat.core.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.dikshant.ghostchat.ForegroundService
import com.dikshant.ghostchat.core.Ghost

/**
 * Restarts the background connection after a reboot or app update, matching
 * WhatsApp/Instagram behaviour. CONNECTIVITY_CHANGE isn't handled here because
 * manifest receivers for it are unreliable on modern Android; instead the FGS
 * watches the network while it runs and reconnects the moment it's back.
 */
class ConnectionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                if (!Ghost.prefs.onboardingComplete) return
                if (!Ghost.prefs.backgroundConnection) return
                ForegroundService.start(context)
            }
        }
    }
}
