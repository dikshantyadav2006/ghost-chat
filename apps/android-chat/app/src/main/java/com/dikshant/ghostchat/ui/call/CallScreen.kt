package com.dikshant.ghostchat.ui.call

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.session.RtcFactory
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.ui.rememberPermissionRequester
import kotlinx.coroutines.launch
import org.webrtc.MediaStream
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/** Full-screen call UI, rendered above the app whenever AppState.call is set. */
@Composable
fun CallOverlay(identity: LocalIdentity) {
    val call by AppState.call.collectAsState()
    val call2 = call ?: return
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val session = Ghost.sessionManager.getSession(call2.roomId)

    var muted by remember { mutableStateOf(false) }
    var cameraOn by remember { mutableStateOf(true) }
    val localStream by AppState.localStream.collectAsState()
    val remoteStream by AppState.remoteStream.collectAsState()

    // The remote stream object is reused as it gains tracks; bump a version on
    // every call event so the renderer re-reads the track and re-sinks it.
    var streamVersion by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        AppState.events.collect { ev ->
            if (ev is AppEvent.Call) streamVersion++
        }
    }

    val phase = call2.phase
    val direction = call2.direction
    val requestPermissions = rememberPermissionRequester()

    LaunchedEffect(phase) {
        if (phase == "active") {
            val s = Ghost.sessionManager.getSession(call2.roomId)
            s?.ensureCallService(context)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF111B21)),
    ) {
        if (call2.video) {
            VideoSurface(remoteStream, isLocal = false, refreshKey = streamVersion, modifier = Modifier.fillMaxSize())
            if (localStream != null) {
                VideoSurface(localStream, isLocal = true, modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .size(110.dp, 150.dp))
            }
        } else {
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                androidx.compose.material3.Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(120.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(call2.peerName.take(1).ifEmpty { "?" }, style = MaterialTheme.typography.displayLarge)
                    }
                }
                Spacer(Modifier.height(24.dp))
                Text(call2.peerName, style = MaterialTheme.typography.headlineMedium, color = Color.White, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Text(
                    text = when (phase) {
                        "ringing" -> if (direction == "incoming") "Incoming call…" else "Ringing…"
                        "active" -> if (muted) "Muted" else "In call"
                        else -> "…"
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color(0xFFB0BEC5),
                )
            }
        }

        // Controls
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (phase == "ringing" && direction == "incoming") {
                Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                    CallButton(Icons.Default.CallEnd, "Reject") {
                        scope.launch { session?.rejectCall() }
                    }
                    CallButton(Icons.Default.Call, "Accept", tint = MaterialTheme.colorScheme.primary) {
                        scope.launch {
                            val perms = if (call2.video) {
                                arrayOf(android.Manifest.permission.RECORD_AUDIO, android.Manifest.permission.CAMERA)
                            } else {
                                arrayOf(android.Manifest.permission.RECORD_AUDIO)
                            }
                            if (requestPermissions(perms)) session?.acceptCall()
                        }
                    }
                }
            } else if (phase == "active") {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    CallButton(if (muted) Icons.Default.MicOff else Icons.Default.Mic, "Mute", tint = if (muted) MaterialTheme.colorScheme.error else Color.White) {
                        muted = !muted
                        session?.toggleMute()
                    }
                    CallButton(Icons.Default.CallEnd, "End", tint = MaterialTheme.colorScheme.error) {
                        scope.launch { session?.endCall() }
                    }
                    if (call2.video) {
                        CallButton(if (cameraOn) Icons.Default.Videocam else Icons.Default.VideocamOff, "Camera", tint = if (cameraOn) Color.White else MaterialTheme.colorScheme.error) {
                            cameraOn = !cameraOn
                            session?.toggleVideo()
                        }
                    }
                }
            } else {
                // outgoing ringing
                CallButton(Icons.Default.CallEnd, "Cancel", tint = MaterialTheme.colorScheme.error) {
                    scope.launch { session?.endCall() }
                }
            }
        }
    }
}

@Composable
private fun CallButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color = Color.White, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick, modifier = Modifier.size(64.dp).clip(CircleShape).background(Color(0x33FFFFFF))) {
            Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(30.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFFB0BEC5))
    }
}

@Composable
private fun VideoSurface(stream: MediaStream?, isLocal: Boolean, modifier: Modifier = Modifier, refreshKey: Int = 0) {
    val track = remember(stream, refreshKey) { stream?.videoTracks?.firstOrNull() }
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            SurfaceViewRenderer(ctx).apply {
                init(RtcFactory.eglBase?.eglBaseContext, null)
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                setMirror(isLocal)
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                track?.addSink(this)
                tag = track
            }
        },
        update = { view ->
            // The remote stream often arrives after the view is created; re-sink
            // whenever the attached track changes so video actually renders.
            val current = view.tag as? VideoTrack
            if (current !== track) {
                current?.removeSink(view)
                track?.addSink(view)
                view.tag = track
            }
        },
        onRelease = { view ->
            (view.tag as? VideoTrack)?.removeSink(view)
            view.release()
        },
    )
}
