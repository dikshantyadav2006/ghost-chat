package com.dikshant.ghostchat.core.session

import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.db.RoomRow
import com.dikshant.ghostchat.core.protocol.Identity
import com.dikshant.ghostchat.core.protocol.normalizeRoomCode
import com.dikshant.ghostchat.core.signal.RoomAckResult
import com.dikshant.ghostchat.core.signal.SignalListener
import com.dikshant.ghostchat.core.signal.SocketManager
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.coroutines.resume

/**
 * App-level session manager (port of initSessionManager/openRoom/openAllRooms
 * from apps/chat/src/lib/session.ts). Owns one RoomSession per room and wires
 * socket events to them.
 */
class SessionManager : SignalListener {

    private val sessions = mutableMapOf<String, RoomSession>()
    private val pendingOpens = mutableMapOf<String, Deferred<RoomSession>>()
    private val reconnectJobs = mutableMapOf<String, Job>()
    private var initialized = false
    private var identity: Identity? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    fun getSession(roomId: String): RoomSession? = sessions[roomId]

    fun setSessionIdentity(id: Identity?) {
        identity = id
    }

    fun init() {
        if (initialized) return
        initialized = true
        Ghost.socketManager.addListener(this)
    }

    /** Connects the socket and registers the identity once online. */
    fun connect(identity: Identity) {
        init()
        this.identity = identity
        Ghost.socketManager.connect()
    }

    // ---- SignalListener ----

    override fun onSocketConnected() {
        val id = identity
        if (id != null) {
            Ghost.socketManager.register(id)
            AppState.setSignalOnline(true)
            scope.launch { reestablishAll() }
            // Also start the watchdog for rooms where the peer may be stale.
            for (roomId in sessions.keys) {
                if (sessions[roomId]?.connected != true) {
                    watchReconnect(roomId)
                }
            }
        }
    }

    override fun onSocketDisconnect() {
        AppState.setSignalOnline(false)
        for (session in sessions.values) {
            AppState.emit(AppEvent.Online(session.roomId, false))
            AppState.emit(AppEvent.Typing(session.roomId, false))
            session.onSocketDown()
        }
    }

    override fun onRoomError(message: String) {
        for (roomId in sessions.keys) AppState.emit(AppEvent.Typing(roomId, false))
        AppState.emit(AppEvent.Error(message))
    }

    override fun onSignalAck(signalId: String, stage: String) {
        for (session in sessions.values) session.onSignalAck(signalId, stage)
    }

    override fun onSignal(roomId: String, from: String, data: com.dikshant.ghostchat.core.protocol.SignalData) {
        val session = sessions[roomId] ?: findSessionByPeer(from) ?: return
        scope.launch { session.handleSignal(data, from) }
    }

    override fun onPeerJoined(roomId: String, peer: com.dikshant.ghostchat.core.signal.PeerPresence, role: String) {
        val session = sessions[roomId] ?: return
        AppState.emit(AppEvent.Typing(roomId, false))
        val changed = session.onPeerPresence(SessionPeer(peer.userId, peer.name, peer.publicKey), peer.sessionId)
        scope.launch { session.ensurePeerConnection(role, changed) }
        if (session.connected) stopWatch(roomId)
    }

    override fun onPeerSessionChanged(roomId: String, userId: String, sessionId: String) {
        val session = sessions[roomId] ?: return
        val info = session.peerPresence ?: return
        if (info.userId != userId) return
        val changed = session.onPeerPresence(info, sessionId)
        if (changed) {
            scope.launch { session.ensurePeerConnection(session.peerRole ?: "offerer", true) }
        }
    }

    override fun onRoomState(roomId: String, peers: List<com.dikshant.ghostchat.core.signal.PeerPresence>) {
        val session = sessions[roomId] ?: return
        val peer = peers.firstOrNull()
        if (peer == null) {
            AppState.emit(AppEvent.Online(roomId, false))
            AppState.emit(AppEvent.Typing(roomId, false))
            return
        }
        val changed = session.onPeerPresence(SessionPeer(peer.userId, peer.name, peer.publicKey), peer.sessionId)
        val peerState = sessionPeerState(roomId)
        val force = changed || peerState == "failed"
        if (force) session.resetRebuildBudget()
        scope.launch { session.ensurePeerConnection(session.peerRole ?: "answerer", force) }
        if (session.connected) stopWatch(roomId)
    }

    override fun onPeerLeft(roomId: String, userId: String, sessionId: String) {
        val session = sessions[roomId] ?: return
        val peerSession = session.peerSession
        if (peerSession != null && sessionId.isNotEmpty() && sessionId != peerSession) return
        AppState.emit(AppEvent.Online(roomId, false))
        AppState.emit(AppEvent.Typing(roomId, false))
        session.closePeer()
        session.requestPeerSync()
        watchReconnect(roomId)
    }

    private fun sessionPeerState(roomId: String): String = AppState.getPeerState(roomId)

    // ---- opening rooms ----

    suspend fun openRoom(
        roomId: String,
        mode: String,
        identity: Identity,
        callbacks: SessionCallbacks,
        preload: Boolean = false,
    ): RoomSession {
        init()
        this.identity = identity
        ensureRegistered(identity)

        sessions[roomId]?.let { return it }

        val deferred = scope.async {
            doOpenRoom(roomId, mode, identity, callbacks, preload)
        }
        pendingOpens[roomId] = deferred
        try {
            return deferred.await()
        } finally {
            if (pendingOpens[roomId] === deferred) pendingOpens.remove(roomId)
        }
    }

    private suspend fun doOpenRoom(
        roomId: String,
        mode: String,
        identity: Identity,
        callbacks: SessionCallbacks,
        preload: Boolean,
    ): RoomSession {
        val s = Ghost.socketManager
        val session = RoomSession(roomId, mode, identity, callbacks)
        sessions[roomId] = session

        if (mode == "create") {
            val res = createRoomAck(s, identity, roomId)
            when (res) {
                is RoomAckResult.Error -> {
                    sessions.remove(roomId)
                    throw IllegalStateException(res.message)
                }
                is RoomAckResult.Success -> {
                    val normalized = normalizeRoomCode(res.code)
                    if (normalized != null && normalized != roomId) {
                        sessions.remove(roomId)
                        sessions[normalized] = session
                        session.roomId = normalized
                    }
                    val peer = res.peer
                    if (peer != null) {
                        session.setPeer(SessionPeer(peer.userId, peer.name, peer.publicKey), peer.sessionId)
                        session.ensurePeerConnection(res.role)
                        stopWatch(session.roomId)
                    } else {
                        session.persistRoom(null)
                        if (!preload) session.provisionPeer(res.role)
                    }
                }
            }
            return session
        }

        val res = joinRoomAck(s, identity, roomId)
        when (res) {
            is RoomAckResult.Error -> {
                sessions.remove(roomId)
                throw IllegalStateException(res.message)
            }
            is RoomAckResult.Success -> {
                val peer = res.peer
                if (peer != null) {
                    session.setPeer(SessionPeer(peer.userId, peer.name, peer.publicKey), peer.sessionId)
                    session.ensurePeerConnection(res.role)
                    stopWatch(session.roomId)
                }
                session.persistRoom(null)
                if (peer == null && !preload) session.provisionPeer(res.role)
            }
        }
        return session
    }

    private suspend fun awaitSignal(timeoutMs: Long = 10000): Boolean {
        if (Ghost.socketManager.isConnected()) return true
        return withTimeoutOrNull(timeoutMs) {
            Ghost.socketManager.connected.first { it }
            true
        } ?: false
    }

    private suspend fun createRoomAck(
        s: SocketManager,
        identity: Identity,
        code: String,
    ): RoomAckResult {
        if (!awaitSignal()) return RoomAckResult.Error("Not connected to signal server")
        return withTimeoutOrNull(15000) {
            suspendCancellableCoroutine { cont ->
                s.createRoom(identity.userId, code, RoomSession.SESSION_ID) { res ->
                    if (cont.isActive) cont.resume(res)
                }
            }
        } ?: RoomAckResult.Error("Signal server timed out")
    }

    private suspend fun joinRoomAck(
        s: SocketManager,
        identity: Identity,
        code: String,
    ): RoomAckResult {
        if (!awaitSignal()) return RoomAckResult.Error("Not connected to signal server")
        return withTimeoutOrNull(15000) {
            suspendCancellableCoroutine { cont ->
                s.joinRoom(identity.userId, code, RoomSession.SESSION_ID) { res ->
                    if (cont.isActive) cont.resume(res)
                }
            }
        } ?: RoomAckResult.Error("Signal server timed out")
    }

    suspend fun openAllRooms(identity: Identity) {
        init()
        this.identity = identity
        ensureRegistered(identity)
        val rooms = Ghost.repo.getRooms()
        for (room in rooms) {
            try {
                openRoom(
                    room.id,
                    room.mode,
                    identity,
                    callbacks = object : SessionCallbacks {
                        override fun onError(roomId: String, message: String) {}
                    },
                    preload = false,
                )
            } catch (e: Exception) {
                // room failed to open — skip
            }
        }
        val last = Ghost.prefs.lastActiveRoomId
        if (last != null && rooms.none { it.id == last }) {
            Ghost.prefs.lastActiveRoomId = null
        }
    }

    suspend fun sendForward(room: RoomRow, identity: Identity, message: com.dikshant.ghostchat.core.db.MessageRow) {
        val target = sessions[room.id] ?: openRoom(
            room.id,
            room.mode,
            identity,
            callbacks = object : SessionCallbacks {
                override fun onError(roomId: String, message: String) {
                    AppState.emit(AppEvent.Error(message))
                }
            },
        )
        if (message.kind == "text") {
            target.sendText(message.text ?: "", forwarded = true)
            return
        }
        val file = Ghost.repo.getFile(message.fileId ?: "")
        var source = file?.path?.let { File(it) }
        if ((source == null || !source.exists()) && file?.sourcePath != null) {
            source = File(file.sourcePath)
        }
        if (source == null || !source.exists() || file == null) throw IllegalStateException("File not downloaded yet")
        target.sendFile(
            sourcePath = source.absolutePath,
            name = file.name,
            mime = file.mime,
            size = file.size,
            voice = message.voice,
            forwarded = true,
        )
    }

    fun closeSession(roomId: String) {
        sessions.remove(roomId)?.close()
        stopWatch(roomId)
        AppState.dataChanged()
    }

    fun closeAllSessions() {
        for (roomId in sessions.keys.toList()) closeSession(roomId)
        identity = null
    }

    private fun ensureRegistered(identity: Identity) {
        if (Ghost.socketManager.isConnected()) {
            Ghost.socketManager.register(identity)
        }
    }

    private suspend fun reestablishAll() {
        for (session in sessions.values) {
            reestablishSession(session)
            session.requestPeerSync()
        }
    }

    private suspend fun reestablishSession(session: RoomSession): Boolean {
        val s = Ghost.socketManager
        val id = identity ?: return false
        return if (session.mode == "create") {
            when (val res = createRoomAck(s, id, session.roomId)) {
                is RoomAckResult.Error -> false
                is RoomAckResult.Success -> {
                    val peer = res.peer
                    if (peer != null) {
                        val changed = session.onPeerPresence(
                            SessionPeer(peer.userId, peer.name, peer.publicKey),
                            peer.sessionId,
                        )
                        session.ensurePeerConnection(res.role, changed)
                    } else {
                        AppState.emit(AppEvent.Online(session.roomId, false))
                    }
                    true
                }
            }
        } else {
            when (val res = joinRoomAck(s, id, session.roomId)) {
                is RoomAckResult.Error -> false
                is RoomAckResult.Success -> {
                    val peer = res.peer
                    if (peer != null) {
                        val changed = session.onPeerPresence(
                            SessionPeer(peer.userId, peer.name, peer.publicKey),
                            peer.sessionId,
                        )
                        session.ensurePeerConnection(res.role, changed)
                    } else {
                        AppState.emit(AppEvent.Online(session.roomId, false))
                    }
                    true
                }
            }
        }
    }

    private fun findSessionByPeer(userId: String): RoomSession? =
        sessions.values.firstOrNull { it.peerUserId == userId }

    private fun watchReconnect(roomId: String) {
        if (reconnectJobs.containsKey(roomId)) return
        reconnectJobs[roomId] = scope.launch {
            var stuckSince = System.currentTimeMillis()
            while (true) {
                kotlinx.coroutines.delay(3000)
                val session = sessions[roomId] ?: run { stopWatch(roomId); return@launch }
                if (!Ghost.socketManager.isConnected()) continue
                if (session.connected) {
                    stopWatch(roomId)
                    return@launch
                }
                // Reset timer whenever the state is not stuck.
                val state = AppState.getPeerState(roomId)
                if (state != "none" && state != "connecting") {
                    stuckSince = System.currentTimeMillis()
                }
                // If stuck in "none" or "connecting" for >10 s while signal is
                // connected, force-destroy the peer and rebuild from scratch.
                if (System.currentTimeMillis() - stuckSince > 10_000) {
                    stuckSince = System.currentTimeMillis()
                    scope.launch {
                        session.ensurePeerConnection(session.peerRole ?: "answerer", force = true)
                    }
                }
                session.requestPeerSync()
            }
        }
    }

    private fun stopWatch(roomId: String) {
        reconnectJobs.remove(roomId)?.cancel()
    }
}
