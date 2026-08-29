package com.dikshant.ghostchat.core

import android.app.Application
import android.content.Context
import com.dikshant.ghostchat.BuildConfig
import com.dikshant.ghostchat.core.db.Repository
import com.dikshant.ghostchat.core.session.RtcFactory
import com.dikshant.ghostchat.core.session.SessionManager
import com.dikshant.ghostchat.core.signal.SocketManager
import com.dikshant.ghostchat.core.util.Prefs

/** Process-wide container; initialized from GhostChatApp.onCreate. */
object Ghost {
    lateinit var context: Context
        private set
    lateinit var prefs: Prefs
        private set
    lateinit var repo: Repository
        private set
    lateinit var socketManager: SocketManager
        private set
    lateinit var sessionManager: SessionManager
        private set

    val signalUrl: String get() = BuildConfig.SIGNAL_URL
    val appOrigin: String get() = BuildConfig.APP_ORIGIN

    fun init(app: Application) {
        context = app.applicationContext
        prefs = Prefs(context)
        repo = Repository(context)
        socketManager = SocketManager()
        sessionManager = SessionManager()
        RtcFactory.init(context)
    }
}
