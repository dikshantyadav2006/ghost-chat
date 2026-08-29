package com.dikshant.ghostchat.core.signal

import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.protocol.SignalData
import com.dikshant.ghostchat.core.protocol.SignalEvents
import com.dikshant.ghostchat.core.protocol.SignalJson
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

/** Result of a room:create / room:join ack. */
sealed class RoomAckResult {
    data class Success(val code: String, val peer: PeerPresence?, val role: String) : RoomAckResult()
    data class Error(val message: String) : RoomAckResult()
}

data class PeerPresence(
    val userId: String,
    val name: String,
    val publicKey: String,
    val sessionId: String,
)

interface SignalListener {
    fun onSignal(roomId: String, from: String, data: SignalData)
    fun onSignalAck(signalId: String, stage: String)
    fun onPeerJoined(roomId: String, peer: PeerPresence, role: String)
    fun onPeerSessionChanged(roomId: String, userId: String, sessionId: String)
    fun onPeerLeft(roomId: String, userId: String, sessionId: String)
    fun onRoomState(roomId: String, peers: List<PeerPresence>)
    fun onRoomError(message: String)
    fun onSocketDisconnect()
    fun onSocketConnected()
}

/**
 * Signaling socket wrapper (port of apps/chat/src/lib/signal.ts). Owns the
 * Socket.IO connection and dispatches server events to the session manager.
 */
class SocketManager {
    private var socket: Socket? = null
    private var registered = false
    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    private val listeners = mutableListOf<SignalListener>()

    fun addListener(l: SignalListener) {
        listeners.add(l)
    }

    fun removeListener(l: SignalListener) {
        listeners.remove(l)
    }

    fun connect() {
        if (socket != null) return
        val opts = IO.Options().apply {
            transports = arrayOf("websocket", "polling")
            reconnection = true
            reconnectionDelay = 500
            reconnectionDelayMax = 8000
            randomizationFactor = 0.5
            timeout = 20000
            forceNew = true
        }
        val s = IO.socket(Ghost.signalUrl, opts)
        s.on(Socket.EVENT_CONNECT) {
            _connected.value = true
            for (l in listeners) l.onSocketConnected()
        }
        s.on(Socket.EVENT_DISCONNECT) {
            _connected.value = false
            registered = false
            for (l in listeners) l.onSocketDisconnect()
        }
        s.on(SignalEvents.SERVER_ROOM_ERROR) { args ->
            val message = (args.firstOrNull() as? JSONObject)?.optString("message") ?: "error"
            for (l in listeners) l.onRoomError(message)
        }
        s.on(SignalEvents.SERVER_ROOM_STATE) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val roomId = o.optString("roomId")
            val peers = parsePeers(o.optJSONArray("peers"))
            for (l in listeners) l.onRoomState(roomId, peers)
        }
        s.on(SignalEvents.SERVER_PEER_JOINED) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val roomId = o.optString("roomId")
            val role = o.optString("role")
            val peer = parsePresence(o.optJSONObject("peer")) ?: return@on
            for (l in listeners) l.onPeerJoined(roomId, peer, role)
        }
        s.on(SignalEvents.SERVER_PEER_SESSION_CHANGED) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            for (l in listeners) l.onPeerSessionChanged(
                o.optString("roomId"),
                o.optString("userId"),
                o.optString("sessionId"),
            )
        }
        s.on(SignalEvents.SERVER_PEER_LEFT) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            for (l in listeners) l.onPeerLeft(
                o.optString("roomId"),
                o.optString("userId"),
                o.optString("sessionId"),
            )
        }
        s.on(SignalEvents.SERVER_SIGNAL) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val roomId = o.optString("roomId")
            val from = o.optString("from")
            val data = o.optJSONObject("data")?.let { SignalJson.signalFromJson(it) } ?: return@on
            for (l in listeners) l.onSignal(roomId, from, data)
        }
        s.on(SignalEvents.SERVER_SIGNAL_ACK) { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val signalId = o.optString("signalId")
            val stage = o.optString("stage")
            for (l in listeners) l.onSignalAck(signalId, stage)
        }
        socket = s
        s.connect()
    }

    fun isConnected(): Boolean = socket?.connected() == true

    /**
     * Forces an immediate reconnect. Used when connectivity returns so the app
     * snaps back online instead of waiting for the socket's retry backoff.
     */
    fun reconnectNow() {
        val s = socket
        if (s == null) {
            connect()
            return
        }
        if (s.connected()) return
        s.disconnect()
        s.connect()
    }

    /** Registers the local identity on the server (idempotent per connection). */
    fun register(identity: ProtocolIdentity) {
        if (!isConnected()) return
        val payload = JSONObject()
            .put("userId", identity.userId)
            .put("name", identity.name)
            .put("publicKey", identity.publicKey)
        socket?.emit(SignalEvents.CLIENT_IDENTITY, payload)
        registered = true
    }

    fun createRoom(userId: String, code: String, sessionId: String, onResult: (RoomAckResult) -> Unit) {
        val payload = JSONObject()
            .put("selfId", userId)
            .put("code", code)
            .put("sessionId", sessionId)
        socket?.emit(SignalEvents.CLIENT_ROOM_CREATE, payload, Ack { args ->
            val res = args.firstOrNull() as? JSONObject
            onResult(parseAck(res))
        })
    }

    fun joinRoom(userId: String, code: String, sessionId: String, onResult: (RoomAckResult) -> Unit) {
        val payload = JSONObject()
            .put("code", code)
            .put("selfId", userId)
            .put("sessionId", sessionId)
        socket?.emit(SignalEvents.CLIENT_ROOM_JOIN, payload, Ack { args ->
            val res = args.firstOrNull() as? JSONObject
            onResult(parseAck(res))
        })
    }

    fun peerSync(roomId: String) {
        if (!isConnected()) return
        socket?.emit(SignalEvents.CLIENT_PEER_SYNC, JSONObject().put("roomId", roomId))
    }

    fun sendSignal(to: String, data: SignalData) {
        if (!isConnected()) return
        socket?.emit(
            SignalEvents.CLIENT_SIGNAL,
            JSONObject().put("to", to).put("data", SignalJson.signalToJson(data)),
        )
    }

    fun sendSignalAck(to: String, signalId: String) {
        if (!isConnected()) return
        socket?.emit(
            SignalEvents.CLIENT_SIGNAL_ACK,
            JSONObject().put("to", to).put("signalId", signalId),
        )
    }

    private fun parseAck(o: JSONObject?): RoomAckResult {
        if (o == null) return RoomAckResult.Error("no response")
        if (o.has("error")) return RoomAckResult.Error(o.optString("error"))
        val role = o.optString("role")
        val code = o.optString("code")
        val peer = o.optJSONObject("peer")?.let { parsePresence(it) }
        return RoomAckResult.Success(code, peer, role)
    }

    private fun parsePresence(o: JSONObject?): PeerPresence? {
        if (o == null) return null
        return PeerPresence(
            userId = o.optString("userId"),
            name = o.optString("name"),
            publicKey = o.optString("publicKey"),
            sessionId = o.optString("sessionId"),
        )
    }

    private fun parsePeers(a: org.json.JSONArray?): List<PeerPresence> {
        if (a == null) return emptyList()
        val out = mutableListOf<PeerPresence>()
        for (i in 0 until a.length()) {
            parsePresence(a.optJSONObject(i))?.let { out.add(it) }
        }
        return out
    }
}

/** Type alias to avoid clashing with protocol PeerPresence in RoomSession. */
typealias ProtocolIdentity = com.dikshant.ghostchat.core.protocol.Identity
