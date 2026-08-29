package com.dikshant.ghostchat.core.util

import com.dikshant.ghostchat.BuildConfig
import org.webrtc.PeerConnection.IceServer

/** ICE servers from build config + public STUN fallbacks (port of lib/ice.ts). */
object Ice {
    private val defaultStun = listOf(
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
    )

    fun getIceServers(): List<IceServer> {
        val servers = mutableListOf<IceServer>()
        for (url in defaultStun) {
            servers.add(IceServer.builder(url).createIceServer())
        }
        val turn = BuildConfig.TURN_URLS.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        if (turn.isNotEmpty()) {
            val builder = IceServer.builder(turn)
            if (BuildConfig.TURN_USERNAME.isNotEmpty()) {
                builder.setUsername(BuildConfig.TURN_USERNAME)
                builder.setPassword(BuildConfig.TURN_CREDENTIAL)
            }
            servers.add(builder.createIceServer())
        }
        return servers
    }
}
