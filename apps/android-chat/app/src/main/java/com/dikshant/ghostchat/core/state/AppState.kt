package com.dikshant.ghostchat.core.state

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.util.concurrent.ConcurrentHashMap

data class CallState(
    val roomId: String,
    val phase: String,
    val direction: String,
    val video: Boolean,
    val callId: String? = null,
    val peerName: String = "",
)

sealed class AppEvent {
    data class SignalOnline(val online: Boolean) : AppEvent()
    data class Online(val roomId: String, val online: Boolean) : AppEvent()
    data class PeerState(val roomId: String, val state: String) : AppEvent()
    data class Typing(val roomId: String, val active: Boolean) : AppEvent()
    data class Transport(val roomId: String, val type: String) : AppEvent()
    data class Call(val call: CallState?) : AppEvent()
    data class Error(val message: String) : AppEvent()
    data class Toast(val message: String, val emoji: String) : AppEvent()
    data class FileProgress(val roomId: String, val fileId: String, val progress: Float) : AppEvent()
    data object DataChanged : AppEvent()
    data object IdentityChanged : AppEvent()
}

/**
 * App-level reactive state, mirroring the web's useApp() zustand store. UI
 * collects [events] and re-queries the repository when data changes.
 */
object AppState {

    private val _events = MutableSharedFlow<AppEvent>(extraBufferCapacity = 64)
    val events = _events.asSharedFlow()

    private val _signalOnline = MutableStateFlow(false)
    val signalOnline: StateFlow<Boolean> = _signalOnline

    private val _call = MutableStateFlow<CallState?>(null)
    val call: StateFlow<CallState?> = _call

    private val _activeRoomId = MutableStateFlow<String?>(null)
    val activeRoomId: StateFlow<String?> = _activeRoomId

    private val _peerStates = ConcurrentHashMap<String, String>()

    fun getPeerState(roomId: String): String = _peerStates[roomId] ?: "none"

    private val _localStream = MutableStateFlow<org.webrtc.MediaStream?>(null)
    val localStream: StateFlow<org.webrtc.MediaStream?> = _localStream

    private val _remoteStream = MutableStateFlow<org.webrtc.MediaStream?>(null)
    val remoteStream: StateFlow<org.webrtc.MediaStream?> = _remoteStream

    fun emit(event: AppEvent) {
        if (event is AppEvent.PeerState) {
            _peerStates[event.roomId] = event.state
        }
        _events.tryEmit(event)
    }

    fun setSignalOnline(online: Boolean) {
        _signalOnline.value = online
        emit(AppEvent.SignalOnline(online))
    }

    fun setCall(call: CallState?) {
        _call.value = call
        emit(AppEvent.Call(call))
    }

    fun setCallLocal(stream: org.webrtc.MediaStream?) {
        _localStream.value = stream
    }

    fun setCallRemote(stream: org.webrtc.MediaStream?) {
        _remoteStream.value = stream
    }

    fun setActiveRoomId(roomId: String?) {
        _activeRoomId.value = roomId
    }

    fun dataChanged() {
        emit(AppEvent.DataChanged)
    }

    fun identityChanged() {
        emit(AppEvent.IdentityChanged)
    }

    fun pushToast(message: String, emoji: String = "💬") {
        emit(AppEvent.Toast(message, emoji))
    }
}
