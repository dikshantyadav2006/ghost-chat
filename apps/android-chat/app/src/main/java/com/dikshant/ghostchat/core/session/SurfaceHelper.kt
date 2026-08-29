package com.dikshant.ghostchat.core.session

import org.webrtc.SurfaceTextureHelper

/** Shared SurfaceTextureHelper used by camera capturers for call video. */
object SurfaceHelper {
    private var helper: SurfaceTextureHelper? = null

    fun surfaceTextureHelper(): SurfaceTextureHelper {
        val egl = RtcFactory.eglBase
        if (egl == null) throw IllegalStateException("EGL not initialized")
        return helper ?: SurfaceTextureHelper.create("GhostCapture", egl.eglBaseContext).also {
            helper = it
        }
    }
}
