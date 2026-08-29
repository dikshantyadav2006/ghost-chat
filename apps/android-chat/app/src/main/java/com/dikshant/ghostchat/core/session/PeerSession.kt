package com.dikshant.ghostchat.core.session

import com.dikshant.ghostchat.core.protocol.IceCandidateData
import com.dikshant.ghostchat.core.protocol.ROLE_OFFERER
import com.dikshant.ghostchat.core.protocol.SignalData
import com.dikshant.ghostchat.core.protocol.newId
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

typealias PeerConnectionState = String
typealias PeerTransportType = String

object PeerStates {
    const val NEW = "new"
    const val CONNECTING = "connecting"
    const val CONNECTED = "connected"
    const val DISCONNECTED = "disconnected"
    const val RECONNECTING = "reconnecting"
    const val FAILED = "failed"
    const val CLOSED = "closed"
}

object PeerTransports {
    const val DIRECT = "direct"
    const val RELAY = "relay"
    const val UNKNOWN = "unknown"
}

interface PeerHandlers {
    fun onOpen()
    fun onClose()
    fun onFrame(frame: ByteArray)
    fun onSignal(signal: SignalData)
    fun onStateChange(state: String)
    fun onRemoteStream(stream: MediaStream)
    fun onTransport(type: String)
}

data class PeerConfig(
    val role: String,
    val polite: () -> Boolean,
    val ephemeralPub: String,
    val handlers: PeerHandlers,
    val iceServers: List<PeerConnection.IceServer>,
    val iceCandidatePoolSize: Int = 4,
    val signalConnectionId: String? = null,
    val provisional: Boolean = false,
)

const val MAX_ICE_RESTARTS = 2
const val DISCONNECTED_RECOVERY_MS = 5000L
const val BUFFER_HIGH_WATER = 4 * 1024 * 1024L
const val BUFFER_LOW_WATER = 1 * 1024 * 1024L

private fun defaultIceServers(): List<PeerConnection.IceServer> = listOf(
    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
    PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer(),
)

/**
 * Encrypted-signaling peer (port of @ghost/webrtc/peer.ts). Drives the
 * offer/answer dance with the MDN perfect-negotiation pattern, buffers ICE
 * candidates until a remote description exists, and recovers from
 * disconnected/failed via ICE restart.
 */
class PeerSession(config: PeerConfig) {

    private val pc: PeerConnection
    private val ephemeralPub = config.ephemeralPub
    private val handlers = config.handlers
    private val isPolite: () -> Boolean = config.polite
    private var channel: DataChannel? = null
    private var closed = false
    private val pendingCandidates = mutableListOf<IceCandidateData>()
    private var makingOffer = false
    private var pendingNegotiation = false
    private var restartCount = 0
    private var disconnectedTimer: kotlinx.coroutines.Job? = null
    private var pairConnectionId: String
    private val pinnedConnectionId: Boolean
    private var armed: Boolean
    private val scope = SessionScope.scope

    // ---- observers ----

    private val channelObserver = object : DataChannel.Observer {
        override fun onBufferedAmountChange(previousAmount: Long) {
            bufferedAmount = channel?.bufferedAmount() ?: previousAmount
        }

        override fun onStateChange() {
            when (channel?.state()) {
                DataChannel.State.OPEN -> handlers.onOpen()
                DataChannel.State.CLOSED -> handlers.onClose()
                DataChannel.State.CLOSING -> {}
                DataChannel.State.CONNECTING -> {}
                else -> {}
            }
        }

        override fun onMessage(buffer: DataChannel.Buffer) {
            val bytes = ByteArray(buffer.data.remaining())
            buffer.data.get(bytes)
            try {
                handlers.onFrame(bytes)
            } catch (e: Exception) {
                // ignore malformed frames
            }
        }
    }

    private val observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState?) {
            // Renegotiation (e.g. call media added) can be requested while a
            // previous negotiation is still in flight. When the transaction
            // settles back to `stable`, retry any deferred negotiation so media
            // m-lines are never silently dropped.
            if (closed) return
            if (state == PeerConnection.SignalingState.STABLE && pendingNegotiation) {
                pendingNegotiation = false
                kotlinx.coroutines.CoroutineScope(scope).launch { negotiate() }
            }
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
            onIceConnectionState()
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) {}

        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}

        override fun onIceCandidate(candidate: IceCandidate) {
            if (closed) return
            val payload = SignalData.Ice(
                signalId = newId("s"),
                candidate = IceCandidateData(
                    candidate = candidate.sdp,
                    sdpMid = candidate.sdpMid,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                    usernameFragment = candidate.sdp,
                ),
                connectionId = pairConnectionId,
            )
            handlers.onSignal(payload)
        }

        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}

        @Deprecated("Deprecated in Java")
        override fun onAddStream(stream: MediaStream) {
            handlers.onRemoteStream(stream)
        }

        @Deprecated("Deprecated in Java")
        override fun onRemoveStream(stream: MediaStream) {}

        override fun onDataChannel(dc: DataChannel) {
            channel = dc
            dc.registerObserver(channelObserver)
        }

        override fun onRenegotiationNeeded() {
            kotlinx.coroutines.CoroutineScope(scope).launch { negotiate() }
        }

        override fun onAddTrack(receiver: org.webrtc.RtpReceiver?, streams: Array<out MediaStream>) {
            val stream = streams.firstOrNull() ?: return
            val track = receiver?.track()
            if (track is VideoTrack) {
                try {
                    stream.addTrack(track)
                } catch (e: Exception) {
                    // track already added
                }
            }
            // Only surface the stream once it actually carries video; the same
            // stream object is reused across track additions and StateFlow
            // de-duplicates identical references, which would skip the
            // recomposition needed to attach the new track to the renderer.
            if (stream.videoTracks.isNotEmpty()) {
                handlers.onRemoteStream(stream)
            }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState?) {
            if (state == PeerConnection.PeerConnectionState.CLOSED) onIceConnectionState()
        }
    }

    init {
        this.pairConnectionId = config.signalConnectionId ?: newId("conn")
        this.pinnedConnectionId = config.signalConnectionId != null
        this.armed = !config.provisional

        val rtcConfig = PeerConnection.RTCConfiguration(config.iceServers.ifEmpty { defaultIceServers() })
        rtcConfig.iceCandidatePoolSize = config.iceCandidatePoolSize

        pc = RtcFactory.get()
            .createPeerConnection(rtcConfig, observer)
            ?: throw IllegalStateException("createPeerConnection failed")

        if (config.role == ROLE_OFFERER) {
            val init = DataChannel.Init()
            init.ordered = true
            channel = pc.createDataChannel("ghostchat", init)
            channel?.registerObserver(channelObserver)
        }
    }

    val provisioned: Boolean get() = !armed && !closed
    val ready: Boolean get() = channel?.state() == DataChannel.State.OPEN

    fun maxMessageSize(): Int? {
        // Android SDK doesn't expose sctp.maxMessageSize directly; keep null so
        // senders pick the default chunk size.
        return null
    }

    // ---- negotiation ----

    suspend fun start() {
        negotiate()
    }

    suspend fun arm(role: String) {
        if (closed || armed) return
        armed = true
        if (role == ROLE_OFFERER) negotiate()
    }

    suspend fun sendOffer() {
        negotiate()
    }

    fun restartIce() {
        if (closed) return
        if (pc.signalingState() == PeerConnection.SignalingState.STABLE ||
            pc.iceConnectionState() == PeerConnection.IceConnectionState.FAILED
        ) {
            escalateIce()
        }
    }

    private suspend fun negotiate() {
        if (closed || !armed) return
        if (makingOffer || pc.signalingState() != PeerConnection.SignalingState.STABLE) {
            // A negotiation is already in flight. Remember the request and
            // re-run it once signaling returns to `stable` (see onSignalingChange).
            pendingNegotiation = true
            return
        }
        makingOffer = true
        var offer: SessionDescription? = null
        try {
            offer = createOffer()
            setLocalDescription(offer)
        } catch (e: Exception) {
            return
        } finally {
            makingOffer = false
        }
        if (offer?.type == SessionDescription.Type.OFFER) {
            handlers.onSignal(
                SignalData.Offer(
                    signalId = newId("s"),
                    sdp = offer.description,
                    ephemeralPub = ephemeralPub,
                    connectionId = pairConnectionId,
                ),
            )
        }
    }

    suspend fun handleSignal(signal: SignalData) {
        when (signal) {
            is SignalData.Offer -> handleOffer(signal)
            is SignalData.Answer -> handleAnswer(signal)
            is SignalData.Ice -> handleIce(signal)
        }
    }

    private suspend fun handleOffer(signal: SignalData.Offer) {
        if (pinnedConnectionId && signal.connectionId != null && signal.connectionId != pairConnectionId) return
        if (makingOffer || pc.signalingState() != PeerConnection.SignalingState.STABLE) {
            if (!isPolite()) return
            // Polite side: accept the incoming offer. The native stack performs
            // an implicit rollback of our in-flight local offer on
            // setRemoteDescription; if it fails we log and move on.
            try {
                setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, signal.sdp))
                if (signal.connectionId != null) pairConnectionId = signal.connectionId
                flushPendingCandidates()
                return
            } catch (e: Exception) {
                return
            }
        }
        if (signal.connectionId != null) pairConnectionId = signal.connectionId
        try {
            setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, signal.sdp))
            flushPendingCandidates()
            val answer = createAnswer()
            setLocalDescription(answer)
            if (answer.type == SessionDescription.Type.ANSWER) {
                handlers.onSignal(
                    SignalData.Answer(
                        signalId = newId("s"),
                        sdp = answer.description,
                        ephemeralPub = ephemeralPub,
                        connectionId = pairConnectionId,
                    ),
                )
            }
        } catch (e: Exception) {
            return
        }
    }

    private suspend fun handleAnswer(signal: SignalData.Answer) {
        if (!acceptsSignal(signal.connectionId)) return
        if (pc.signalingState() != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) return
        try {
            setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, signal.sdp))
            flushPendingCandidates()
        } catch (e: Exception) {
            return
        }
    }

    private suspend fun handleIce(signal: SignalData.Ice) {
        if (!acceptsSignal(signal.connectionId)) return
        if (pc.remoteDescription == null) {
            pendingCandidates.add(signal.candidate)
            return
        }
        addIceCandidate(signal.candidate)
    }

    private suspend fun flushPendingCandidates() {
        val queued = pendingCandidates.toList()
        pendingCandidates.clear()
        for (candidate in queued) addIceCandidate(candidate)
    }

    private fun acceptsSignal(connectionId: String?): Boolean {
        if (connectionId == null) return true
        return connectionId == pairConnectionId
    }

    // ---- media ----

    fun addMediaStream(stream: MediaStream) {
        for (track in stream.videoTracks) {
            try {
                pc.addTrack(track, listOf(stream.id))
            } catch (e: Exception) {
                // already added
            }
        }
        for (track in stream.audioTracks) {
            try {
                pc.addTrack(track, listOf(stream.id))
            } catch (e: Exception) {
                // already added
            }
        }
    }

    fun addVideoTrack(track: VideoTrack, stream: MediaStream) {
        try {
            pc.addTrack(track, listOf(stream.id))
        } catch (e: Exception) {
            // already added
        }
    }

    // ---- data channel ----

    suspend fun sendFrame(frame: ByteArray) {
        val ch = channel
        if (ch == null || ch.state() != DataChannel.State.OPEN) throw IllegalStateException("channel not open")
        drainGate()
        val buf = ByteBuffer.wrap(frame)
        try {
            ch.send(DataChannel.Buffer(buf, true))
        } catch (e: Exception) {
            drainGate()
            ch.send(DataChannel.Buffer(ByteBuffer.wrap(frame), true))
        }
    }

    private var bufferedAmount = 0L
    private val drainLock = Object()

    private suspend fun drainGate() {
        if (bufferedAmount <= BUFFER_HIGH_WATER) return
        // Poll until drained below low-water mark.
        while (bufferedAmount > BUFFER_LOW_WATER && !closed) {
            kotlinx.coroutines.delay(150)
        }
    }

    fun close() {
        if (closed) return
        closed = true
        disconnectedTimer?.cancel()
        try {
            channel?.close()
        } catch (e: Exception) {
            // already closed
        }
        pc.close()
    }

    // ---- stats ----

    fun getRttMs(onResult: (Long?) -> Unit) {
        if (closed) {
            onResult(null)
            return
        }
        pc.getStats(object : RTCStatsCollectorCallback {
            override fun onStatsDelivered(report: RTCStatsReport) {
                var rtt: Long? = null
                val statsMap = report.statsMap
                for (stats in statsMap.values) {
                    if (stats.type != "candidate-pair") continue
                    val members = stats.members
                    val selected = members["selected"] as? Boolean ?: false
                    val currentRtt = members["currentRoundTripTime"] as? Number
                    if (selected && currentRtt != null && currentRtt.toDouble() > 0) {
                        rtt = kotlin.math.round(currentRtt.toDouble() * 1000).toLong()
                        break
                    }
                }
                onResult(rtt)
            }
        })
    }

    fun updateTransportType() {
        pc.getStats(object : RTCStatsCollectorCallback {
            override fun onStatsDelivered(report: RTCStatsReport) {
                var type = PeerTransports.UNKNOWN
                val statsMap = report.statsMap
                for (stats in statsMap.values) {
                    if (stats.type != "transport") continue
                    val members = stats.members
                    val pairId = members["selectedCandidatePairId"] as? String ?: continue
                    val pair = statsMap[pairId] ?: continue
                    val localId = pair.members["localCandidateId"] as? String ?: continue
                    val local = statsMap[localId] ?: continue
                    val candidateType = local.members["candidateType"] as? String
                    if (candidateType != null) {
                        type = if (candidateType == "relay") PeerTransports.RELAY else PeerTransports.DIRECT
                        break
                    }
                }
                handlers.onTransport(type)
            }
        })
    }

    // ---- suspend bridges ----

    private suspend fun createOffer(): SessionDescription = suspendCancellableCoroutine { cont ->
        pc.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
            override fun onCreateFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(IllegalStateException(error))
            }
            override fun onSetSuccess() {}
            override fun onSetFailure(error: String) {}
        }, MediaConstraints())
    }

    private suspend fun createAnswer(): SessionDescription = suspendCancellableCoroutine { cont ->
        pc.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
            override fun onCreateFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(IllegalStateException(error))
            }
            override fun onSetSuccess() {}
            override fun onSetFailure(error: String) {}
        }, MediaConstraints())
    }

    private suspend fun setLocalDescription(desc: SessionDescription) = suspendCancellableCoroutine<Unit> { cont ->
        pc.setLocalDescription(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) {}
            override fun onCreateFailure(error: String) {}
            override fun onSetSuccess() {
                if (cont.isActive) cont.resume(Unit)
            }
            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(IllegalStateException(error))
            }
        }, desc)
    }

    private suspend fun setRemoteDescription(desc: SessionDescription) = suspendCancellableCoroutine<Unit> { cont ->
        pc.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) {}
            override fun onCreateFailure(error: String) {}
            override fun onSetSuccess() {
                if (cont.isActive) cont.resume(Unit)
            }
            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(IllegalStateException(error))
            }
        }, desc)
    }

    private suspend fun addIceCandidate(candidate: IceCandidateData) {
        val ice = IceCandidate(
            candidate.sdpMid,
            candidate.sdpMLineIndex ?: 0,
            candidate.candidate,
        )
        pc.addIceCandidate(ice)
    }

    // ---- observers ----

    private fun onIceConnectionState() {
        if (closed) return
        when (pc.iceConnectionState()) {
            PeerConnection.IceConnectionState.CHECKING ->
                handlers.onStateChange(PeerStates.CONNECTING)
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED -> {
                disconnectedTimer?.cancel()
                restartCount = 0
                if (channel?.state() == DataChannel.State.OPEN) {
                    handlers.onStateChange(PeerStates.CONNECTED)
                }
                updateTransportType()
            }
            PeerConnection.IceConnectionState.DISCONNECTED -> {
                handlers.onStateChange(PeerStates.DISCONNECTED)
                armDisconnectedRecovery()
            }
            PeerConnection.IceConnectionState.FAILED -> escalateIce()
            PeerConnection.IceConnectionState.CLOSED -> {
                disconnectedTimer?.cancel()
                handlers.onStateChange(PeerStates.CLOSED)
            }
            else -> {}
        }
    }

    private fun armDisconnectedRecovery() {
        if (disconnectedTimer != null) return
        disconnectedTimer = kotlinx.coroutines.CoroutineScope(scope).launch {
            kotlinx.coroutines.delay(DISCONNECTED_RECOVERY_MS)
            disconnectedTimer = null
            if (closed) return@launch
            val state = pc.iceConnectionState()
            if (state == PeerConnection.IceConnectionState.DISCONNECTED ||
                state == PeerConnection.IceConnectionState.FAILED
            ) {
                escalateIce()
            }
        }
    }

    private fun escalateIce() {
        disconnectedTimer?.cancel()
        if (restartCount >= MAX_ICE_RESTARTS) {
            handlers.onStateChange(PeerStates.FAILED)
            return
        }
        restartCount += 1
        handlers.onStateChange(PeerStates.RECONNECTING)
        try {
            pc.restartIce()
        } catch (e: Exception) {
            handlers.onStateChange(PeerStates.FAILED)
        }
    }
}

object SessionScope {
    val scope = kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main.immediate
}
