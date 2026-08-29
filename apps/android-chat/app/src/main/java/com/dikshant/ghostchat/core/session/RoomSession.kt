package com.dikshant.ghostchat.core.session

import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.crypto.Crypto
import com.dikshant.ghostchat.core.db.FileRow
import com.dikshant.ghostchat.core.db.MessageRow
import com.dikshant.ghostchat.core.db.RoomRow
import com.dikshant.ghostchat.core.protocol.ChatMessage
import com.dikshant.ghostchat.core.protocol.ChunkRange
import com.dikshant.ghostchat.core.protocol.ChannelMessage
import com.dikshant.ghostchat.core.protocol.FileChunk
import com.dikshant.ghostchat.core.protocol.FileMeta
import com.dikshant.ghostchat.core.protocol.ROLE_ANSWERER
import com.dikshant.ghostchat.core.protocol.ROLE_OFFERER
import com.dikshant.ghostchat.core.protocol.SignalData
import com.dikshant.ghostchat.core.protocol.SignalJson
import com.dikshant.ghostchat.core.protocol.decodeCipherFrame
import com.dikshant.ghostchat.core.protocol.decodeFileChunkFrame
import com.dikshant.ghostchat.core.protocol.decodeFrame
import com.dikshant.ghostchat.core.protocol.encodeCipherFrame
import com.dikshant.ghostchat.core.protocol.encodeFileChunkFrame
import com.dikshant.ghostchat.core.protocol.encodeJSONFrame
import com.dikshant.ghostchat.core.protocol.formatRoomCode
import com.dikshant.ghostchat.core.protocol.missingRanges
import com.dikshant.ghostchat.core.protocol.newId
import com.dikshant.ghostchat.core.protocol.rangeCount
import com.dikshant.ghostchat.core.protocol.rangesFromChunks
import com.dikshant.ghostchat.core.signal.PeerPresence
import com.dikshant.ghostchat.core.signal.SocketManager
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.state.CallState
import com.dikshant.ghostchat.core.util.Format
import com.dikshant.ghostchat.core.util.Notify
import com.dikshant.ghostchat.core.util.Sound
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.webrtc.AudioSource
import org.webrtc.MediaStream
import java.io.File

const val SIGNAL_RETRY_MS = 800L
const val MAX_SIGNAL_ATTEMPTS = 5
const val MAX_PEER_REBUILDS = 2
val PEER_REBUILD_BACKOFF_MS = longArrayOf(0, 1200, 3500)
const val RING_TIMEOUT_MS = 30000L

class SessionPeer(
    val userId: String,
    val name: String,
    val publicKey: String,
)

interface SessionCallbacks {
    fun onError(roomId: String, message: String)
}

private class PendingSignal(
    val signal: SignalData,
    var attempts: Int = 0,
    var serverAccepted: Boolean = false,
    var timer: Job? = null,
)

private val sendScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

class RoomSession(
    var roomId: String,
    val mode: String,
    private val identity: com.dikshant.ghostchat.core.protocol.Identity,
    private val callbacks: SessionCallbacks,
) {
    private val repo = Ghost.repo
    private val socket = Ghost.socketManager

    private var peer: PeerSession? = null
    private var role: String? = null
    private var roomKey: ByteArray? = null
    private var roomKeyPeerPub: String? = null
    private var roomKeyShared: ByteArray? = null
    private val eph = Crypto.generateKeyPair()
    private var peerInfo: SessionPeer? = null
    private var peerSessionId: String? = null
    private val assemblers = mutableMapOf<String, FileAssembler>()
    private val activeSends = mutableMapOf<String, SendControl>()
    private val receivedChunks = mutableMapOf<String, MutableSet<Int>>()
    private val signalBuffer = mutableListOf<SignalData>()
    private var localCallStream: MediaStream? = null
    private var localCapturer: org.webrtc.VideoCapturer? = null
    private var activeCallId: String? = null
    private var ringTimeout: Job? = null
    private val seenSignals = LinkedHashSet<String>()
    private val pendingSignals = mutableMapOf<String, PendingSignal>()
    private var rebuildCount = 0
    private var rebuildTimer: Job? = null
    private var closing = false
    private var closed = false

    private val chunkStore = object : ChunkStore {
        override suspend fun putChunk(chunk: FileChunk) = repo.putChunk(chunk.fileId, chunk.seq, chunk.data)
        override suspend fun countChunks(fileId: String) = repo.countChunks(fileId)
        override suspend fun getChunk(fileId: String, seq: Int) = repo.getChunk(fileId, seq)
        override suspend fun chunkSeqs(fileId: String) = repo.chunkSeqs(fileId)
    }

    val peerUserId: String? get() = peerInfo?.userId
    val peerPresence: SessionPeer? get() = peerInfo
    val peerRole: String? get() = role
    val peerSession: String? get() = peerSessionId
    val connected: Boolean get() = peer?.ready == true

    // ---- presence ----

    fun onPeerPresence(peer: SessionPeer, sessionId: String?): Boolean {
        val previous = peerSessionId
        peerInfo = peer
        if (sessionId != null) peerSessionId = sessionId
        AppState.emit(AppEvent.Online(roomId, true))
        runSync { persistRoom(peer) }
        val changed = previous != null && sessionId != null && sessionId != previous
        return changed
    }

    fun setPeer(peer: SessionPeer, sessionId: String?) {
        onPeerPresence(peer, sessionId)
    }

    fun requestPeerSync() {
        if (!socket.isConnected()) return
        socket.peerSync(roomId)
    }

    fun resetRebuildBudget() {
        rebuildCount = 0
    }

    private fun runSync(block: suspend () -> Unit) {
        sendScope.launch { block() }
    }

    suspend fun persistRoom(peer: SessionPeer?) {
        val existing = repo.getRoom(roomId)
        val row = RoomRow(
            id = roomId,
            code = formatRoomCode(roomId),
            mode = mode,
            peerUserId = peer?.userId ?: existing?.peerUserId,
            peerName = peer?.name ?: existing?.peerName,
            peerPublicKey = peer?.publicKey ?: existing?.peerPublicKey,
            safetyCode = existing?.safetyCode,
            createdAt = existing?.createdAt ?: System.currentTimeMillis(),
            lastActivity = System.currentTimeMillis(),
            sessionId = existing?.sessionId ?: peerSessionId,
            unreadCount = existing?.unreadCount ?: 0,
        )
        repo.putRoom(row)
        AppState.dataChanged()
    }

    // ---- peer wiring ----

    suspend fun ensurePeerConnection(role: String, force: Boolean = false) {
        this.role = role
        if (!force) {
            if (peer?.ready == true) return
            // Don't tear down a peer that is mid-negotiation.  This matches
            // the web side (session.ts) and prevents the watchReconnect loop
            // from destroying in-progress connections every 3 s.
            val state = AppState.getPeerState(roomId)
            if (state == "connecting" || state == "reconnecting" || state == "disconnected") {
                return
            }
            if (peer?.provisioned == true) {
                peer?.arm(role)
                return
            }
        } else {
            resetRebuildBudget()
            closePeer()
        }
        initPeer(role)
    }

    private fun buildPeerConfig(role: String): PeerConfig = PeerConfig(
        role = role,
        polite = { identity.userId > (peerInfo?.userId ?: "") },
        ephemeralPub = eph.first,
        iceServers = com.dikshant.ghostchat.core.util.Ice.getIceServers(),
        handlers = object : PeerHandlers {
            override fun onOpen() = runSync { this@RoomSession.onOpen() }
            override fun onClose() = onPeerClosed()
            override fun onFrame(frame: ByteArray) = runSync { this@RoomSession.onFrame(frame) }
            override fun onSignal(signal: SignalData) = relay(signal)
            override fun onStateChange(state: String) = onPeerState(state)
            override fun onRemoteStream(stream: MediaStream) {
                val call = AppState.call.value
                if (call?.roomId == roomId) {
                    AppState.setCall(call.copy(phase = call.phase))
                    updateCallRemote(stream)
                }
            }
            override fun onTransport(type: String) {
                AppState.emit(AppEvent.Transport(roomId, type))
            }
        },
        signalConnectionId = peerSessionId?.let {
            SignalJson.computePairConnectionId(SESSION_ID, it)
        },
    )

    private fun updateCallRemote(stream: MediaStream) {
        val call = AppState.call.value ?: return
        AppState.emit(AppEvent.Call(call.copy(phase = call.phase)))
        AppState.setCallRemote(stream)
    }

    fun provisionPeer(role: String) {
        if (peer != null) return
        this.role = role
        peer = PeerSession(
            buildPeerConfig(role).copy(provisional = true),
        )
    }

    private suspend fun initPeer(role: String) {
        if (rebuildCount >= MAX_PEER_REBUILDS) {
            AppState.emit(AppEvent.PeerState(roomId, "failed"))
            return
        }
        this.role = role
        rebuildCount += 1
        clearRebuildTimer()
        closePeer()
        AppState.emit(AppEvent.PeerState(roomId, "connecting"))
        peer = PeerSession(buildPeerConfig(role))
        if (role == ROLE_OFFERER) {
            peer?.start()
        }
        val buffered = signalBuffer.toList()
        signalBuffer.clear()
        for (signal in buffered) {
            peer?.handleSignal(signal)
        }
    }

    fun closePeer() {
        clearRebuildTimer()
        cleanupCall()
        for ((_, entry) in pendingSignals) entry.timer?.cancel()
        pendingSignals.clear()
        peer?.let {
            closing = true
            it.close()
            peer = null
            closing = false
        }
        AppState.emit(AppEvent.PeerState(roomId, "none"))
    }

    fun onSocketDown() {
        for ((_, entry) in pendingSignals) entry.timer?.cancel()
        pendingSignals.clear()
    }

    // ---- state/rebuild ----

    private fun onPeerState(state: String) {
        val ui = when (state) {
            "new" -> "connecting"
            "closed" -> "none"
            else -> state
        }
        AppState.emit(AppEvent.PeerState(roomId, ui))
        if (state == "connected") {
            clearRebuildTimer()
            rebuildCount = 0
        } else if (state == "failed") {
            clearRebuildTimer()
            scheduleRebuild()
        }
    }

    private fun onPeerClosed() {
        if (closing) return
        clearRebuildTimer()
        AppState.emit(AppEvent.PeerState(roomId, "none"))
        runSync {
            ensurePeerConnection(role ?: ROLE_ANSWERER)
            failStuckTransfers()
        }
        cleanupCall()
    }

    private fun scheduleRebuild() {
        if (rebuildTimer != null) return
        if (rebuildCount >= MAX_PEER_REBUILDS) {
            AppState.emit(AppEvent.PeerState(roomId, "failed"))
            return
        }
        val delay = PEER_REBUILD_BACKOFF_MS.getOrElse(rebuildCount) { 0 }
        rebuildTimer = CoroutineScope(SessionScope.scope).launch {
            delay(delay)
            rebuildTimer = null
            runSync { ensurePeerConnection(role ?: ROLE_ANSWERER) }
        }
    }

    private fun clearRebuildTimer() {
        rebuildTimer?.cancel()
        rebuildTimer = null
    }

    // ---- signaling ----

    private fun relay(signal: SignalData) {
        val peerId = peerInfo?.userId ?: return
        val signalId = signal.signalId
        if (signalId.isEmpty()) return
        if (pendingSignals.containsKey(signalId)) return
        pendingSignals[signalId] = PendingSignal(signal)
        sendSignal(signalId)
    }

    private fun sendSignal(signalId: String) {
        val entry = pendingSignals[signalId] ?: return
        val peerId = peerInfo?.userId ?: return
        if (!socket.isConnected()) return
        socket.sendSignal(peerId, entry.signal)
        entry.attempts += 1
        if (entry.attempts > MAX_SIGNAL_ATTEMPTS) {
            pendingSignals.remove(signalId)
            return
        }
        entry.timer?.cancel()
        entry.timer = CoroutineScope(SessionScope.scope).launch {
            delay(SIGNAL_RETRY_MS)
            if (pendingSignals.containsKey(signalId)) sendSignal(signalId)
        }
    }

    fun onSignalAck(signalId: String, stage: String) {
        val entry = pendingSignals[signalId] ?: return
        if (stage == "serverAccepted") {
            entry.serverAccepted = true
            return
        }
        entry.timer?.cancel()
        pendingSignals.remove(signalId)
    }

    suspend fun handleSignal(signal: SignalData, from: String) {
        val signalId = signal.signalId
        if (signalId.isEmpty()) return
        if (seenSignals.contains(signalId)) {
            sendSignalAck(from, signalId)
            return
        }
        seenSignals.add(signalId)
        if (seenSignals.size > 512) {
            seenSignals.remove(seenSignals.first())
        }
        sendSignalAck(from, signalId)

        val ephemeralPub = when (signal) {
            is SignalData.Offer -> signal.ephemeralPub
            is SignalData.Answer -> signal.ephemeralPub
            else -> ""
        }
        if (ephemeralPub.isNotEmpty()) {
            val peerPub = ephemeralPub
            if (roomKey == null || peerPub != roomKeyPeerPub) {
                val shared = Crypto.getSharedSecret(eph.second, peerPub)
                roomKeyShared = shared
                roomKey = Crypto.deriveRoomKey(eph.second, peerPub, roomId)
                roomKeyPeerPub = peerPub
                updateSafetyCode()
            }
        }
        val p = peer ?: run {
            signalBuffer.add(signal)
            return
        }
        p.handleSignal(signal)
    }

    private fun sendSignalAck(to: String, signalId: String) {
        socket.sendSignalAck(to, signalId)
    }

    private suspend fun updateSafetyCode() {
        val peer = peerInfo ?: return
        val shared = roomKeyShared ?: return
        val code = Crypto.computeSafetyCode(shared, identity.publicKey, peer.publicKey)
        repo.setRoomSafetyCode(roomId, code)
        AppState.dataChanged()
    }

    // ---- channel ----

    private suspend fun onOpen() {
        clearRebuildTimer()
        rebuildCount = 0
        AppState.emit(AppEvent.Online(roomId, true))
        AppState.emit(AppEvent.PeerState(roomId, "connected"))
        val hello = com.dikshant.ghostchat.core.protocol.Identity(identity.userId, identity.name, identity.publicKey)
        sendEncrypted(encodeJSONFrame(ChannelMessage.Hello(hello)))
        resumeInboundFiles()
        flushOutbox()
    }

    private suspend fun sendEncrypted(
        frame: ByteArray,
        kind: String = "other",
        queue: Boolean = true,
    ): String {
        val key = roomKey ?: return "skipped"
        if (peer?.ready == true) {
            val (iv, data) = Crypto.encryptToB64(key, frame)
            val out = encodeJSONFrame(ChannelMessage.Cipher(com.dikshant.ghostchat.core.protocol.EncryptedPayload(iv, data)))
            peer?.sendFrame(out)
            return "sent"
        }
        if (!queue) return "queued"
        repo.enqueueOutbox(roomId, kind, newId("o"), frame)
        return "queued"
    }

    suspend fun flushOutbox() {
        if (peer?.ready != true || roomKey == null) return
        val items = repo.getOutbox(roomId)
        for (item in items) {
            try {
                val (iv, data) = Crypto.encryptToB64(roomKey!!, item.envelope)
                val out = encodeJSONFrame(ChannelMessage.Cipher(com.dikshant.ghostchat.core.protocol.EncryptedPayload(iv, data)))
                peer?.sendFrame(out)
                if (item.kind == "message") {
                    repo.updateMessageStatus(item.id, "sent")
                } else {
                    repo.removeFromOutbox(item.id)
                }
            } catch (e: Exception) {
                return
            }
        }
        AppState.dataChanged()
    }

    private suspend fun enqueueMessage(message: ChatMessage) {
        repo.putMessage(
            MessageRow(
                id = message.id,
                roomId = roomId,
                isMine = true,
                kind = message.kind,
                ts = message.ts,
                status = "sending",
                text = message.text,
                fileId = message.file?.id,
                replyTo = message.replyTo,
                edited = message.edited ?: false,
                deleted = false,
                voice = message.voice ?: false,
                forwarded = message.forwarded ?: false,
            ),
        )
        repo.touchRoom(roomId, message.ts)
        repo.enqueueOutbox(roomId, "message", message.id, encodeJSONFrame(ChannelMessage.Message(message)))
        AppState.dataChanged()
        flushOutbox()
    }

    suspend fun sendText(text: String, replyTo: String? = null, forwarded: Boolean = false) {
        val message = ChatMessage(
            id = newId("m"),
            kind = "text",
            ts = System.currentTimeMillis(),
            text = text,
            replyTo = replyTo,
            forwarded = if (forwarded) true else null,
        )
        enqueueMessage(message)
    }

    suspend fun sendFile(
        sourcePath: String,
        name: String,
        mime: String,
        size: Long,
        replyTo: String? = null,
        voice: Boolean = false,
        forwarded: Boolean = false,
    ) {
        val file = File(sourcePath)
        val sha256 = withContext(Dispatchers.IO) { hashFile(file) }
        val fileId = newId("f")
        val chunkSize = pickChunkSize(peer?.maxMessageSize())
        val totalChunks = maxOf(1, kotlin.math.ceil(file.length().toDouble() / chunkSize).toInt())
        val fileMeta = FileMeta(
            id = fileId,
            name = name,
            mime = mime.ifEmpty { "application/octet-stream" },
            size = file.length(),
            sha256 = sha256,
            chunkSize = chunkSize,
            totalChunks = totalChunks,
        )
        val message = ChatMessage(
            id = newId("m"),
            kind = "file",
            ts = System.currentTimeMillis(),
            file = fileMeta,
            replyTo = replyTo,
            voice = if (voice) true else null,
            forwarded = if (forwarded) true else null,
        )
        repo.putFile(
            FileRow(
                id = fileId,
                roomId = roomId,
                name = name,
                mime = fileMeta.mime,
                size = fileMeta.size,
                sha256 = sha256,
                chunkSize = chunkSize,
                totalChunks = totalChunks,
                direction = "out",
                status = "transferring",
                progress = 0f,
                receivedChunks = 0,
                lastSentChunk = -1,
                receivedRanges = emptyList(),
                path = null,
                sourcePath = sourcePath,
                preview = null,
                uploaded = false,
            ),
        )
        enqueueMessage(message)
        runOutboundSend(fileId, file, chunkSize, totalChunks, listOf(0 to (totalChunks - 1)), 0)
    }

    private suspend fun runOutboundSend(
        fileId: String,
        file: File,
        chunkSize: Int,
        totalChunks: Int,
        ranges: List<ChunkRange>,
        startCount: Int,
    ) {
        val control = SendControl()
        activeSends[fileId]?.cancelled = true
        activeSends[fileId] = control
        var count = startCount
        try {
            withContext(Dispatchers.IO) {
                forEachChunkInRanges(file, fileId, chunkSize, ranges, totalChunks, control) { chunk ->
                    if (control.cancelled) return@forEachChunkInRanges
                    sendCipherChunk(chunk)
                    count = chunk.seq + 1
                    repo.updateFileLastSent(fileId, chunk.seq)
                    repo.updateFileTransfer(fileId, "transferring", count.toFloat() / totalChunks, count)
                    if (count % 8 == 0) {
                        AppState.emit(AppEvent.FileProgress(roomId, fileId, count.toFloat() / totalChunks))
                    }
                }
            }
            if (control.cancelled) return
            sendEncrypted(encodeJSONFrame(ChannelMessage.FileReady(fileId)))
            repo.updateFileTransfer(fileId, "done", 1f, count)
        } catch (e: Exception) {
            if (control.cancelled) {
                repo.updateFileTransfer(fileId, "paused", count.toFloat() / totalChunks, count)
                return
            }
            repo.updateFileTransfer(fileId, "interrupted", count.toFloat() / totalChunks, count)
            callbacks.onError(roomId, "File send interrupted")
        } finally {
            if (activeSends[fileId] === control) activeSends.remove(fileId)
        }
        AppState.dataChanged()
    }

    suspend fun pauseFile(fileId: String) {
        val file = repo.getFile(fileId) ?: return
        if (file.status == "done" || file.status == "error") return
        if (file.direction == "out") {
            activeSends[fileId]?.cancelled = true
        }
        repo.updateFileTransfer(fileId, "paused", file.progress, file.receivedChunks)
        sendEncrypted(encodeJSONFrame(ChannelMessage.FilePause(fileId)))
        AppState.dataChanged()
    }

    suspend fun resumeFile(fileId: String) {
        val file = repo.getFile(fileId) ?: return
        if (file.status == "done") return
        if (file.direction == "out") {
            val source = file.sourcePath?.let { File(it) }
            if (source == null || !source.exists()) {
                callbacks.onError(roomId, "File no longer on this device — peer can request resend")
                return
            }
            val chunkSize = file.chunkSize.let { if (it > 0) it else DEFAULT_CHUNK_SIZE }
            val total = if (file.totalChunks > 0) file.totalChunks else maxOf(1, kotlin.math.ceil(file.size.toDouble() / chunkSize).toInt())
            activeSends[fileId]?.cancelled = true
            val startSeq = file.lastSentChunk + 1
            repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks)
            runOutboundSend(fileId, source, chunkSize, total, listOf(startSeq to (total - 1)), startSeq)
            return
        }
        val ranges = getReceivedRanges(fileId)
        val row = repo.getFile(fileId)
        repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks)
        sendEncrypted(
            encodeJSONFrame(
                ChannelMessage.FileResume(fileId, row?.totalChunks ?: 0, ranges),
            ),
        )
        AppState.dataChanged()
    }

    suspend fun getLinkStats(): Pair<Long?, String?> {
        val p = peer ?: return (null to null)
        var rtt: Long? = null
        var transport: String? = null
        p.getRttMs { rtt = it }
        return (rtt to transport)
    }

    private suspend fun resumeInboundFiles() {
        val files = repo.getFiles(roomId)
        for (file in files) {
            if (file.direction == "in" &&
                (file.status == "pending" || file.status == "transferring" || file.status == "interrupted")
            ) {
                val ranges = getReceivedRanges(file.id)
                sendEncrypted(
                    encodeJSONFrame(
                        ChannelMessage.FileResume(file.id, file.totalChunks, ranges),
                    ),
                )
            }
        }
    }

    private suspend fun getReceivedRanges(fileId: String): List<ChunkRange> {
        val set = receivedChunks[fileId]
        if (set != null && set.isNotEmpty()) {
            val ranges = rangesFromChunks(set.sorted())
            persistRanges(fileId)
            return ranges
        }
        val row = repo.getFile(fileId)
        return row?.receivedRanges ?: emptyList()
    }

    private suspend fun persistRanges(fileId: String) {
        val set = receivedChunks[fileId] ?: return
        if (set.isEmpty()) return
        val ranges = rangesFromChunks(set.sorted())
        repo.setFileRanges(fileId, ranges.joinToString(";") { "${it.first}-${it.second}" })
    }

    private suspend fun handlePeerResume(fileId: String, receivedRanges: List<ChunkRange>, totalChunks: Int) {
        val file = repo.getFile(fileId) ?: return
        if (file.direction != "out") return
        if (file.status == "done") {
            sendEncrypted(encodeJSONFrame(ChannelMessage.FileReady(fileId)))
            return
        }
        val source = file.sourcePath?.let { File(it) }
        if (source == null || !source.exists()) {
            callbacks.onError(roomId, "File no longer on this device — unable to resume transfer")
            return
        }
        val chunkSize = if (file.chunkSize > 0) file.chunkSize else DEFAULT_CHUNK_SIZE
        val total = if (totalChunks > 0) totalChunks else if (file.totalChunks > 0) file.totalChunks else maxOf(1, kotlin.math.ceil(file.size.toDouble() / chunkSize).toInt())
        val ranges: List<ChunkRange> =
            if (receivedRanges.isNotEmpty()) missingRanges(total, receivedRanges)
            else listOf(0 to (total - 1))
        val startCount = total - rangeCount(ranges)
        repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks)
        runOutboundSend(fileId, source, chunkSize, total, ranges, startCount)
    }

    private suspend fun handlePeerPause(fileId: String) {
        val file = repo.getFile(fileId) ?: return
        if (file.direction == "out") {
            activeSends[fileId]?.cancelled = true
        }
        repo.updateFileTransfer(fileId, "paused", file.progress, file.receivedChunks)
        AppState.dataChanged()
    }

    suspend fun sendVoice(path: String, mime: String) {
        val f = File(path)
        val ext = when {
            mime == "audio/mp4" -> "m4a"
            mime == "audio/ogg" -> "ogg"
            else -> "webm"
        }
        sendFile(path, "voice-${System.currentTimeMillis()}.$ext", mime, f.length(), voice = true)
    }

    // ---- calls ----

    suspend fun startCall(video: Boolean) {
        val p = peer
        if (p?.ready != true) throw IllegalStateException("Peer not connected")
        if (AppState.call.value != null) throw IllegalStateException("Call already in progress")
        val stream = createLocalStream(video)
        localCallStream = stream
        AppState.setCallLocal(stream)
        activeCallId = newId("c")
        AppState.setCall(
            CallState(
                roomId = roomId,
                phase = "ringing",
                direction = "outgoing",
                video = video,
                callId = activeCallId,
                peerName = peerInfo?.name ?: "",
            ),
        )
        sendEncrypted(encodeJSONFrame(ChannelMessage.Call("ring", activeCallId!!, video)))
        if (Ghost.prefs.sound) Sound.playRingtone()
    }

    suspend fun acceptCall() {
        val call = AppState.call.value ?: return
        if (call.roomId != roomId) return
        Sound.stopRingtone()
        val stream = createLocalStream(call.video)
        localCallStream = stream
        AppState.setCallLocal(stream)
        peer?.addMediaStream(stream)
        CallConnectionService.start(Ghost.context, call.video)
        AppState.setCall(call.copy(phase = "active"))
        sendEncrypted(encodeJSONFrame(ChannelMessage.Call("accept", activeCallId ?: "")))
    }

    suspend fun rejectCall() {
        Sound.stopRingtone()
        sendEncrypted(encodeJSONFrame(ChannelMessage.Call("reject", activeCallId ?: "")))
        cleanupCall()
    }

    suspend fun endCall() {
        Sound.stopRingtone()
        sendEncrypted(encodeJSONFrame(ChannelMessage.Call("end", activeCallId ?: "")))
        cleanupCall()
    }

    fun toggleMute() {
        val track = localCallStream?.audioTracks?.firstOrNull() ?: return
        track.setEnabled(!track.enabled())
    }

    /** Start the call foreground service (audio focus + ongoing notification). */
    fun ensureCallService(context: android.content.Context) {
        CallConnectionService.start(context, AppState.call.value?.video ?: false)
    }

    fun toggleVideo() {
        val track = localCallStream?.videoTracks?.firstOrNull() ?: return
        track.setEnabled(!track.enabled())
    }

    private fun createLocalStream(video: Boolean): MediaStream {
        val factory = RtcFactory
        val stream = factory.createLocalMediaStream("local" + newId("s"))
        val audioSource: AudioSource = factory.createAudioSource()
        val audioTrack = factory.createAudioTrack("audio" + newId("s"), audioSource)
        stream.addTrack(audioTrack)
        if (video) {
            try {
                val capturer = factory.createCameraCapturer()
                if (capturer != null) {
                    localCapturer = capturer
                    val videoSource = factory.createVideoSource(capturer)
                    capturer.initialize(
                        com.dikshant.ghostchat.core.session.SurfaceHelper.surfaceTextureHelper(),
                        Ghost.context,
                        videoSource.capturerObserver,
                    )
                    capturer.startCapture(1280, 720, 30)
                    val videoTrack = factory.createVideoTrack("video" + newId("s"), videoSource)
                    stream.addTrack(videoTrack)
                }
            } catch (e: Exception) {
                // camera unavailable — audio-only fallback
            }
        }
        return stream
    }

    private fun cleanupCall() {
        Sound.stopRingtone()
        ringTimeout?.cancel()
        ringTimeout = null
        // Always release the camera so the next call can open it again.
        runCatching { localCapturer?.stopCapture() }
        localCapturer?.dispose()
        localCapturer = null
        localCallStream?.dispose()
        localCallStream = null
        CallConnectionService.stop(Ghost.context)
        AppState.setCallLocal(null)
        activeCallId = null
        val call = AppState.call.value
        if (call?.roomId == roomId) AppState.setCall(null)
    }

    private suspend fun sendCipherChunk(chunk: FileChunk) {
        val p = peer ?: throw IllegalStateException("channel not ready")
        val key = roomKey ?: throw IllegalStateException("channel not ready")
        if (!p.ready) throw IllegalStateException("channel not ready")
        val inner = encodeFileChunkFrame(chunk)
        val frame = Crypto.encrypt(key, inner)
        p.sendFrame(encodeCipherFrame(frame))
    }

    private suspend fun failStuckTransfers() {
        val files = repo.getFiles(roomId)
        for (file in files) {
            if (file.status == "pending" || file.status == "transferring") {
                if (file.direction == "in") {
                    persistRanges(file.id)
                }
                repo.updateFileTransfer(file.id, "interrupted", file.progress, file.receivedChunks)
            }
        }
        AppState.dataChanged()
    }

    suspend fun sendTyping(active: Boolean) {
        if (peer?.ready != true || roomKey == null) return
        sendEncrypted(encodeJSONFrame(ChannelMessage.Typing(active)))
    }

    suspend fun sendReaction(messageId: String, emoji: String, add: Boolean) {
        repo.applyReactionLocal(messageId, emoji, add)
        repo.setReactionRoomId(messageId, roomId)
        sendEncrypted(encodeJSONFrame(ChannelMessage.Reaction(messageId, emoji, add)))
        AppState.dataChanged()
    }

    suspend fun sendEdit(messageId: String, text: String) {
        repo.applyEdit(messageId, text, System.currentTimeMillis())
        sendEncrypted(encodeJSONFrame(ChannelMessage.Edit(messageId, text, System.currentTimeMillis())))
        AppState.dataChanged()
    }

    suspend fun sendDelete(messageId: String) {
        repo.applyTombstone(messageId, System.currentTimeMillis())
        sendEncrypted(encodeJSONFrame(ChannelMessage.Delete(messageId, System.currentTimeMillis())))
        AppState.dataChanged()
    }

    suspend fun markAllRead() {
        val messages = repo.getMessages(roomId)
        for (m in messages) {
            if (!m.isMine && (m.status == "received" || m.status == "delivered")) {
                sendEncrypted(
                    encodeJSONFrame(ChannelMessage.Ack(m.id, "read", System.currentTimeMillis())),
                )
                repo.updateMessageStatus(m.id, "read")
            }
        }
        repo.setRoomUnread(roomId, 0)
        AppState.dataChanged()
    }

    // ---- frames ----

    private suspend fun onFrame(frame: ByteArray) {
        if (frame.isEmpty()) return
        try {
            when (frame[0].toInt() and 0xff) {
                com.dikshant.ghostchat.core.protocol.FRAME_CIPHER -> {
                    val key = roomKey ?: return
                    try {
                        val payload = decodeCipherFrame(frame)
                        val inner = Crypto.decrypt(key, payload)
                        onFrame(inner)
                    } catch (e: Exception) {
                        // bad MAC or malformed payload — drop silently
                    }
                }
                com.dikshant.ghostchat.core.protocol.FRAME_JSON -> {
                    val decoded = com.dikshant.ghostchat.core.protocol.decodeJSONFrame(frame)
                    onChannelMessage(decoded)
                }
                com.dikshant.ghostchat.core.protocol.FRAME_FILE_CHUNK -> {
                    val chunk = decodeFileChunkFrame(frame)
                    onFileChunk(chunk)
                }
            }
        } catch (e: Exception) {
            // malformed frame — ignore
        }
    }

    private suspend fun onChannelMessage(msg: ChannelMessage) {
        when (msg) {
            is ChannelMessage.Hello -> {
                val peer = peerInfo
                val match = peer != null &&
                    msg.identity.userId == peer.userId &&
                    msg.identity.publicKey == peer.publicKey
                if (!match) {
                    callbacks.onError(roomId, "Security warning: unexpected peer identity")
                }
                flushOutbox()
            }
            is ChannelMessage.Cipher -> {
                val key = roomKey ?: return
                try {
                    val inner = Crypto.decryptFromB64(key, msg.payload.iv, msg.payload.data)
                    onFrame(inner)
                } catch (e: Exception) {
                    // drop silently
                }
            }
            is ChannelMessage.Message -> {
                val m = msg.message
                repo.putMessage(
                    MessageRow(
                        id = m.id,
                        roomId = roomId,
                        isMine = false,
                        kind = m.kind,
                        ts = m.ts,
                        status = "received",
                        text = m.text,
                        fileId = m.file?.id,
                        replyTo = m.replyTo,
                        edited = m.edited ?: false,
                        deleted = m.deleted ?: false,
                        voice = m.voice ?: false,
                        forwarded = m.forwarded ?: false,
                    ),
                )
                if (m.kind == "file" && m.file != null) {
                    val meta = m.file
                    if (repo.getFile(meta.id) == null) {
                        repo.putFile(
                            FileRow(
                                id = meta.id,
                                roomId = roomId,
                                name = meta.name,
                                mime = meta.mime,
                                size = meta.size,
                                sha256 = meta.sha256,
                                chunkSize = meta.chunkSize,
                                totalChunks = meta.totalChunks,
                                direction = "in",
                                status = "pending",
                                progress = 0f,
                                receivedChunks = 0,
                                lastSentChunk = -1,
                                receivedRanges = emptyList(),
                                path = null,
                                sourcePath = null,
                                preview = null,
                                uploaded = false,
                            ),
                        )
                    }
                    assemblers[meta.id] = FileAssembler(
                        meta.id,
                        chunkStore,
                        meta.totalChunks,
                        meta.size,
                        meta.sha256,
                    )
                }
                repo.touchRoom(roomId, System.currentTimeMillis())
                val visible = AppState.activeRoomId.value == roomId
                val peerName = peerInfo?.name ?: ""
                val preview = Format.messagePreview(m.kind, m.text, m.voice ?: false, m.file?.name)
                Notify.notifyIncoming(roomId, peerName, preview)
                if (Ghost.prefs.sound && !visible) Sound.playReceive()
                sendEncrypted(
                    encodeJSONFrame(
                        ChannelMessage.Ack(m.id, if (visible) "read" else "delivered", System.currentTimeMillis()),
                    ),
                )
                repo.updateMessageStatus(m.id, if (visible) "read" else "received")
                if (!visible) {
                    val unread = repo.unreadForRoom(roomId) + 1
                    repo.setRoomUnread(roomId, unread)
                }
                AppState.dataChanged()
            }
            is ChannelMessage.Ack -> {
                repo.updateMessageStatus(msg.messageId, msg.status)
                repo.removeFromOutbox(msg.messageId)
                AppState.dataChanged()
            }
            is ChannelMessage.Typing -> {
                AppState.emit(AppEvent.Typing(roomId, msg.active))
            }
            is ChannelMessage.Edit -> {
                repo.applyEdit(msg.messageId, msg.text, msg.ts)
                AppState.dataChanged()
            }
            is ChannelMessage.Delete -> {
                repo.applyTombstone(msg.messageId, msg.ts)
                AppState.dataChanged()
            }
            is ChannelMessage.FileReady -> {
                val file = repo.getFile(msg.fileId)
                if (file != null && file.status != "done") {
                    repo.updateFileTransfer(msg.fileId, "done", 1f, file.receivedChunks)
                }
                AppState.dataChanged()
            }
            is ChannelMessage.FileResume -> handlePeerResume(msg.fileId, msg.receivedRanges, msg.totalChunks)
            is ChannelMessage.FilePause -> handlePeerPause(msg.fileId)
            is ChannelMessage.Reaction -> {
                repo.applyReactionRemote(msg.messageId, msg.emoji, msg.add)
                repo.setReactionRoomId(msg.messageId, roomId)
                AppState.dataChanged()
            }
            is ChannelMessage.Call -> onCallMessage(msg)
            else -> {}
        }
    }

    private suspend fun onCallMessage(msg: ChannelMessage.Call) {
        if (msg.callId != activeCallId && msg.phase != "ring") return
        when (msg.phase) {
            "ring" -> {
                if (activeCallId != null) return
                if (AppState.call.value != null) {
                    sendEncrypted(encodeJSONFrame(ChannelMessage.Call("reject", msg.callId)))
                    return
                }
                activeCallId = msg.callId
                AppState.setCall(
                    CallState(
                        roomId = roomId,
                        phase = "ringing",
                        direction = "incoming",
                        video = msg.video,
                        callId = msg.callId,
                        peerName = peerInfo?.name ?: "",
                    ),
                )
                if (Ghost.prefs.sound) Sound.playRingtone()
                ringTimeout = CoroutineScope(SessionScope.scope).launch {
                    delay(RING_TIMEOUT_MS)
                    val call = AppState.call.value
                    if (call?.roomId == roomId && call.phase == "ringing") {
                        rejectCall()
                        AppState.pushToast("Missed call", "📵")
                    }
                }
            }
            "accept" -> {
                Sound.stopRingtone()
                localCallStream?.let { peer?.addMediaStream(it) }
                peer?.sendOffer()
                val call = AppState.call.value
                if (call?.roomId == roomId) {
                    AppState.setCall(call.copy(phase = "active"))
                }
            }
            "reject" -> {
                if (msg.callId == activeCallId) {
                    cleanupCall()
                    AppState.pushToast("Call declined", "📵")
                }
            }
            "end" -> {
                if (msg.callId == activeCallId) {
                    cleanupCall()
                    AppState.pushToast("Call ended", "📞")
                }
            }
        }
    }

    private suspend fun onFileChunk(chunk: FileChunk) {
        var assembler = assemblers[chunk.fileId]
        if (assembler == null) {
            val row = repo.getFile(chunk.fileId)
            if (row == null || row.direction != "in") return
            assembler = FileAssembler(chunk.fileId, chunkStore, chunk.total, row.size, row.sha256)
            assemblers[chunk.fileId] = assembler
        }
        assembler.add(chunk)
        var receivedSet = receivedChunks[chunk.fileId]
        if (receivedSet == null) {
            receivedSet = mutableSetOf()
            for (seq in chunkStore.chunkSeqs(chunk.fileId)) receivedSet.add(seq)
            receivedChunks[chunk.fileId] = receivedSet
        }
        receivedSet.add(chunk.seq)
        val fileRow = repo.getFile(chunk.fileId)
        if (fileRow != null) {
            val received = repo.countChunks(chunk.fileId)
            repo.updateFileTransfer(chunk.fileId, "transferring", received.toFloat() / chunk.total, received)
            if (received % 8 == 0) {
                AppState.emit(AppEvent.FileProgress(roomId, chunk.fileId, received.toFloat() / chunk.total))
            }
            if (received % 128 == 0) persistRanges(chunk.fileId)
        }
        if (!assembler.isComplete()) return
        persistRanges(chunk.fileId)
        val outFile = File(Ghost.context.filesDir, "received").let {
            it.mkdirs()
            File(it, "${chunk.fileId}-${fileRow?.name ?: "file"}")
        }
        val valid = assembler.assemble(outFile)
        if (valid) {
            repo.setFileDone(chunk.fileId, outFile.absolutePath)
            sendEncrypted(encodeJSONFrame(ChannelMessage.FileReady(chunk.fileId)))
        } else {
            repo.updateFileTransfer(chunk.fileId, "error", 0f, repo.countChunks(chunk.fileId))
        }
        assemblers.remove(chunk.fileId)
        receivedChunks.remove(chunk.fileId)
        AppState.dataChanged()
    }

    fun close() {
        closed = true
        closePeer()
    }

    companion object {
        val SESSION_ID: String = newId("sess")
    }
}
