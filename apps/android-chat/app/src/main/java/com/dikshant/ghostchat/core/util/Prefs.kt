package com.dikshant.ghostchat.core.util

import android.content.Context
import android.content.SharedPreferences

/** Mirrors the web app's user preferences (sound/haptics/notifications). */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("ghost_prefs", Context.MODE_PRIVATE)

    var sound: Boolean
        get() = sp.getBoolean("sound", true)
        set(v) = sp.edit().putBoolean("sound", v).apply()

    var haptics: Boolean
        get() = sp.getBoolean("haptics", true)
        set(v) = sp.edit().putBoolean("haptics", v).apply()

    var notifications: Boolean
        get() = sp.getBoolean("notifications", true)
        set(v) = sp.edit().putBoolean("notifications", v).apply()

    var incomingCallsEnabled: Boolean
        get() = sp.getBoolean("incoming_calls", true)
        set(v) = sp.edit().putBoolean("incoming_calls", v).apply()

    var backgroundConnection: Boolean
        get() = sp.getBoolean("background_connection", true)
        set(v) = sp.edit().putBoolean("background_connection", v).apply()

    var onboardingComplete: Boolean
        get() = sp.getBoolean("onboarding_complete", false)
        set(v) = sp.edit().putBoolean("onboarding_complete", v).apply()

    var lastActiveRoomId: String?
        get() = sp.getString("last_active_room", null)
        set(v) = sp.edit().putString("last_active_room", v).apply()

    fun clearAll() {
        sp.edit().clear().apply()
    }
}
