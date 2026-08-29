package com.dikshant.ghostchat.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.db.FileRow
import com.dikshant.ghostchat.core.db.MessageRow
import com.dikshant.ghostchat.core.db.ReactionRow
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.formatRoomCode
import com.dikshant.ghostchat.core.session.RoomSession
import com.dikshant.ghostchat.core.session.SessionCallbacks
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.Format
import com.dikshant.ghostchat.core.util.IdentityUtil
import com.dikshant.ghostchat.core.util.Qr
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.launch
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    identity: LocalIdentity,
    code: String,
    onBack: () -> Unit,
    onOpenMedia: (String) -> Unit,
    onScan: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    var session by remember { mutableStateOf<RoomSession?>(Ghost.sessionManager.getSession(code)) }
    var messages by remember { mutableStateOf<List<MessageRow>>(emptyList()) }
    var files by remember { mutableStateOf(mapOf<String, FileRow>()) }
    var reactions by remember { mutableStateOf(mapOf<String, List<ReactionRow>>()) }
    var online by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }
    var peerState by remember { mutableStateOf("none") }
    var signalOnline by remember { mutableStateOf(true) }

    var composer by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<MessageRow?>(null) }
    var editingId by remember { mutableStateOf<String?>(null) }
    var searchActive by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var actionMessage by remember { mutableStateOf<MessageRow?>(null) }
    var showEmoji by remember { mutableStateOf(false) }
    var showQr by remember { mutableStateOf(false) }
    var showSafety by remember { mutableStateOf(false) }
    var showConnection by remember { mutableStateOf(false) }
    var showDetails by remember { mutableStateOf(false) }
    var showForward by remember { mutableStateOf(false) }
    var forwardId by remember { mutableStateOf<String?>(null) }
    var recording by remember { mutableStateOf(false) }
    var recordElapsed by remember { mutableStateOf(0L) }
    val recorder = remember { VoiceRecorder() }
    var scrollTarget by remember { mutableStateOf<String?>(null) }
    val requestPermissions = rememberPermissionRequester()

    suspend fun reload() {
        messages = Ghost.repo.getMessages(code)
        val fileMap = mutableMapOf<String, FileRow>()
        for (f in Ghost.repo.getFiles(code)) fileMap[f.id] = f
        files = fileMap
        val reactionMap = mutableMapOf<String, List<ReactionRow>>()
        for (r in Ghost.repo.getReactions(code)) {
            reactionMap[r.messageId] = (reactionMap[r.messageId] ?: emptyList()) + r
        }
        reactions = reactionMap
        online = Ghost.sessionManager.getSession(code)?.connected == true
    }

    LaunchedEffect(code) {
        val existing = Ghost.sessionManager.getSession(code)
        if (existing != null) {
            session = existing
        } else {
            val row = Ghost.repo.getRoomByCode(code)
            val mode = row?.mode ?: "join"
            try {
                Ghost.sessionManager.openRoom(
                    code,
                    mode,
                    IdentityUtil.toProtocol(identity),
                    callbacks = object : SessionCallbacks {
                        override fun onError(roomId: String, message: String) {
                            AppState.emit(AppEvent.Error(message))
                        }
                    },
                )
                session = Ghost.sessionManager.getSession(code)
            } catch (e: Exception) {
                AppState.emit(AppEvent.Error(e.message ?: "Failed to open room"))
            }
        }
        AppState.setActiveRoomId(code)
        reload()
        // Mark the chat as read: notify the peer and clear the unread badge.
        val s = Ghost.sessionManager.getSession(code)
        if (s != null) {
            s.markAllRead()
        } else {
            Ghost.repo.markRoomRead(code)
        }
        AppState.events.collect { event ->
            when (event) {
                AppEvent.DataChanged -> reload()
                is AppEvent.Online -> if (event.roomId == code) online = event.online
                is AppEvent.Typing -> if (event.roomId == code) typing = event.active
                is AppEvent.PeerState -> if (event.roomId == code) peerState = event.state
                is AppEvent.SignalOnline -> signalOnline = event.online
                else -> {}
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            if (AppState.activeRoomId.value == code) AppState.setActiveRoomId(null)
        }
    }

    // Re-mark the chat read when returning from the background so messages
    // that arrived while we were away clear their unread state.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch {
                    Ghost.sessionManager.getSession(code)?.markAllRead()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val activeSession = session

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            if (searchActive) {
                SearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    onClose = { searchActive = false; searchQuery = "" },
                )
            } else {
                ChatHeader(
                    peerName = activeSession?.peerPresence?.name ?: formatRoomCode(code),
                    online = online,
                    typing = typing,
                    peerState = peerState,
                    onBack = onBack,
                    onSearch = { searchActive = true },
                    onVoiceCall = {
                        scope.launch {
                            val ok = requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO))
                            if (!ok) {
                                AppState.emit(AppEvent.Error("Microphone permission is required for calls"))
                                return@launch
                            }
                            try {
                                activeSession?.startCall(video = false)
                            } catch (e: Exception) {
                                AppState.emit(AppEvent.Error(e.message ?: "Call failed"))
                            }
                        }
                    },
                    onVideoCall = {
                        scope.launch {
                            val ok = requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO, android.Manifest.permission.CAMERA))
                            if (!ok) {
                                AppState.emit(AppEvent.Error("Microphone and camera permissions are required for video calls"))
                                return@launch
                            }
                            try {
                                activeSession?.startCall(video = true)
                            } catch (e: Exception) {
                                AppState.emit(AppEvent.Error(e.message ?: "Call failed"))
                            }
                        }
                    },
                    onDetails = { showDetails = true },
                    onConnection = { showConnection = true },
                    onEncryption = { showSafety = true },
                    onInvite = { showQr = true },
                    onScan = onScan,
                )
            }
        },
        bottomBar = {
            Composer(
                value = composer,
                onValueChange = { composer = it },
                replyTo = replyTo,
                onCancelReply = { replyTo = null },
                editing = editingId != null,
                onCancelEdit = { editingId = null },
                onSend = {
                    val s = activeSession
                    val text = composer.trim()
                    if (text.isEmpty()) return@Composer
                    val editing = editingId
                    scope.launch {
                        if (editing != null) {
                            s?.sendEdit(editing, text)
                            editingId = null
                        } else {
                            s?.sendText(text, replyTo?.id)
                        }
                        composer = ""
                        replyTo = null
                        if (Ghost.prefs.sound) com.dikshant.ghostchat.core.util.Sound.playSend()
                    }
                },
                onAttach = { uri ->
                    scope.launch {
                        val s = activeSession ?: return@launch
                        val name = uri.displayName(context)
                        val size = uri.size(context)
                        val mime = uri.mime(context) ?: "application/octet-stream"
                        val src = uri.copyToPersistent(context)
                        if (src != null) s.sendFile(src.absolutePath, name, mime, size)
                    }
                },
                onEmoji = { showEmoji = true },
                onStartRecord = {
                    scope.launch {
                        val ok = requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO))
                        if (!ok) {
                            AppState.emit(AppEvent.Error("Microphone permission is required to record voice messages"))
                            return@launch
                        }
                        if (activeSession != null) {
                            recorder.start()
                            recording = true
                            recordElapsed = 0
                        }
                    }
                },
                onStopRecord = { sendIt ->
                    recording = false
                    val file = recorder.stop()
                    if (sendIt && file != null && activeSession != null) {
                        scope.launch { activeSession!!.sendVoice(file.absolutePath, "audio/mp4") }
                    }
                },
                recording = recording,
                recordElapsed = recordElapsed,
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            val listState = rememberLazyListState()
            val grouped = remember(messages) { groupByDay(messages) }

            val atBottom by remember {
                derivedStateOf {
                    val info = listState.layoutInfo
                    info.totalItemsCount == 0 ||
                        (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - 1
                }
            }

            // First open: jump straight to the latest messages. Later: follow
            // new messages, but only when we're already near the bottom or the
            // last message is ours — never yank the user out of history.
            var initialized by remember { mutableStateOf(false) }
            LaunchedEffect(grouped.size, messages.lastOrNull()?.id) {
                if (grouped.isEmpty()) return@LaunchedEffect
                if (!initialized) {
                    initialized = true
                    listState.scrollToItem(grouped.size - 1)
                    return@LaunchedEffect
                }
                val info = listState.layoutInfo
                val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: -1
                val lastMsg = messages.lastOrNull()
                if (lastMsg?.isMine == true || lastVisible >= info.totalItemsCount - 2) {
                    listState.animateScrollToItem(grouped.size - 1)
                }
            }

            // Reply jump: scroll to the referenced message.
            LaunchedEffect(scrollTarget) {
                val target = scrollTarget
                if (target == null) return@LaunchedEffect
                val index = messages.indexOfFirst { it.id == target }
                if (index >= 0) {
                    var running = 0
                    for ((gi, g) in grouped.withIndex()) {
                        if (index < running + g.items.size) {
                            listState.animateScrollToItem(gi)
                            break
                        }
                        running += g.items.size
                    }
                }
                scrollTarget = null
            }

            // When the keyboard opens, keep the latest message visible above it.
            val imeBottom = WindowInsets.ime.getBottom(LocalDensity.current)
            LaunchedEffect(imeBottom) {
                if (imeBottom > 0 && grouped.isNotEmpty() && atBottom) {
                    listState.animateScrollToItem(grouped.size - 1)
                }
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            ) {
                itemsIndexed(grouped) { _, group ->
                    Column {
                        Text(
                            group.dayLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .align(Alignment.CenterHorizontally)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                        group.items.forEach { m ->
                            MessageBubble(
                                message = m,
                                isMine = m.isMine,
                                file = files[m.fileId],
                                reactions = reactions[m.id] ?: emptyList(),
                                searchQuery = searchQuery.takeIf { searchActive && searchQuery.isNotBlank() },
                                allMessages = messages,
                                onLongPress = { actionMessage = m },
                                onClick = {
                                    if (m.kind == "file" && m.fileId != null) {
                                        val f = files[m.fileId]
                                        val media = f?.path?.let { File(it) } ?: f?.sourcePath?.let { File(it) }
                                        if (media != null && (f?.mime?.startsWith("image/") == true || f?.mime?.startsWith("video/") == true)) {
                                            onOpenMedia(m.fileId!!)
                                        } else if (f?.mime?.startsWith("audio/") == true && f.path != null) {
                                            GhostAudioPlayer.toggle(f.path!!)
                                        }
                                    }
                                },
                                onReplyClick = {
                                    if (m.replyTo != null) scrollTarget = m.replyTo
                                },
                            )
                        }
                    }
                }
            }

            if (peerState != "connected" && peerState != "none") {
                Row(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 4.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = when (peerState) {
                            "connecting", "reconnecting" -> "Connecting…"
                            "disconnected" -> "Peer offline"
                            else -> "Reconnecting…"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            if (!atBottom && !searchActive) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 12.dp, bottom = 12.dp),
                ) {
                    FloatingActionButton(
                        onClick = { scope.launch { listState.animateScrollToItem(grouped.size - 1) } },
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    ) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Jump to latest")
                    }
                }
            }
        }
    }

    // ---- dialogs ----
    if (actionMessage != null) {
        MessageActionsSheet(
            message = actionMessage!!,
            canEdit = actionMessage!!.isMine && actionMessage!!.kind == "text",
            onDismiss = { actionMessage = null },
            onReact = { emoji, add ->
                scope.launch { activeSession?.sendReaction(actionMessage!!.id, emoji, add) }
                actionMessage = null
            },
            onReply = { replyTo = actionMessage; actionMessage = null },
            onForward = { forwardId = actionMessage?.id; showForward = true; actionMessage = null },
            onCopy = {
                val text = actionMessage?.text ?: ""
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("message", text))
                actionMessage = null
            },
            onEdit = { editingId = actionMessage?.id; composer = actionMessage?.text ?: ""; actionMessage = null },
            onDelete = {
                scope.launch { activeSession?.sendDelete(actionMessage!!.id) }
                actionMessage = null
            },
        )
    }

    if (showEmoji) {
        EmojiPickerDialog(onPick = { composer += it }, onDismiss = { showEmoji = false })
    }

    if (showQr) {
        QrDialog(roomCode = code, onDismiss = { showQr = false })
    }

    if (showSafety) {
        SafetyCodeDialog(
            roomId = code,
            onDismiss = { showSafety = false },
        )
    }

    if (showConnection) {
        ConnectionDialog(
            roomId = code,
            session = activeSession,
            peerState = peerState,
            signalOnline = signalOnline,
            onDismiss = { showConnection = false },
        )
    }

    if (showDetails) {
        DetailsDialog(
            roomId = code,
            session = activeSession,
            onDismiss = { showDetails = false },
            onOpenMedia = onOpenMedia,
        )
    }

    if (showForward) {
        ForwardDialog(
            identity = identity,
            messageId = forwardId,
            onDismiss = { showForward = false },
            onDone = { showForward = false },
        )
    }

    LaunchedEffect(recording) {
        while (recording) {
            recordElapsed = recorder.elapsedMs()
            if (recordElapsed >= recorder.maxDurationMs) {
                recorder.stop()?.let { file ->
                    scope.launch { activeSession?.sendVoice(file.absolutePath, "audio/mp4") }
                }
                recording = false
                break
            }
            kotlinx.coroutines.delay(250)
        }
    }
}

// ---- helpers ----

private fun groupByDay(messages: List<MessageRow>): List<MessageGroup> {
    val out = mutableListOf<MessageGroup>()
    var lastDay: String? = null
    var current: MutableList<MessageRow>? = null
    for (m in messages) {
        val day = Format.dayLabel(m.ts)
        if (day != lastDay) {
            lastDay = day
            current = mutableListOf()
            out.add(MessageGroup(day, current))
        }
        current?.add(m)
    }
    return out
}

private data class MessageGroup(val dayLabel: String, val items: List<MessageRow>)
