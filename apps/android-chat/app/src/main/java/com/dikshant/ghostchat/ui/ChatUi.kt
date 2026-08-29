package com.dikshant.ghostchat.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.db.FileRow
import com.dikshant.ghostchat.core.db.MessageRow
import com.dikshant.ghostchat.core.db.ReactionRow
import com.dikshant.ghostchat.core.db.RoomRow
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.formatRoomCode
import com.dikshant.ghostchat.core.session.RoomSession
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.Format
import com.dikshant.ghostchat.core.util.IdentityUtil
import com.dikshant.ghostchat.core.util.Qr
import com.dikshant.ghostchat.ui.theme.GhostBlue
import com.dikshant.ghostchat.ui.theme.GhostBubbleIn
import com.dikshant.ghostchat.ui.theme.GhostBubbleOut
import kotlinx.coroutines.launch
import java.io.File

// ---- URI helpers ----

fun Uri.displayName(context: Context): String {
    var name = "file"
    context.contentResolver.query(this, null, null, null, null)?.use { c ->
        val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        if (idx >= 0 && c.moveToFirst()) name = c.getString(idx)
    }
    return name
}

fun Uri.size(context: Context): Long {
    var size = 0L
    context.contentResolver.query(this, null, null, null, null)?.use { c ->
        val idx = c.getColumnIndex(android.provider.OpenableColumns.SIZE)
        if (idx >= 0 && c.moveToFirst()) size = c.getLong(idx)
    }
    return size
}

fun Uri.mime(context: Context): String? = context.contentResolver.getType(this)

fun Uri.copyToPersistent(context: Context): File? {
    return try {
        val dir = File(context.filesDir, "sent").apply { mkdirs() }
        val file = File(dir, "file-${System.currentTimeMillis()}-${displayName(context)}")
        context.contentResolver.openInputStream(this)?.use { input ->
            file.outputStream().use { input.copyTo(it) }
        }
        if (file.exists() && file.length() > 0) file else null
    } catch (e: Exception) {
        null
    }
}

// ---- header ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatHeader(
    peerName: String,
    online: Boolean,
    typing: Boolean,
    peerState: String,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onVoiceCall: () -> Unit,
    onVideoCall: () -> Unit,
    onDetails: () -> Unit,
    onConnection: () -> Unit,
    onEncryption: () -> Unit,
    onInvite: () -> Unit,
    onScan: () -> Unit,
) {
    TopAppBar(
        title = {
            Column(modifier = Modifier.clickable(onClick = onDetails)) {
                Text(peerName, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    text = when {
                        typing -> "typing…"
                        online -> "online"
                        peerState == "connected" -> "end-to-end encrypted"
                        else -> "connecting…"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = when {
                        typing || online -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
        },
        actions = {
            IconButton(onClick = onVoiceCall) {
                Icon(Icons.Default.Call, contentDescription = "Voice call")
            }
            IconButton(onClick = onVideoCall) {
                Icon(Icons.Default.Videocam, contentDescription = "Video call")
            }
            IconButton(onClick = onSearch) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
            var menuOpen by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "More")
                }
                androidx.compose.material3.DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Media") }, onClick = { menuOpen = false; onDetails() })
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Details") }, onClick = { menuOpen = false; onDetails() })
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Connection") }, onClick = { menuOpen = false; onConnection() })
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Encryption") }, onClick = { menuOpen = false; onEncryption() })
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Invite via QR") }, onClick = { menuOpen = false; onInvite() })
                    androidx.compose.material3.DropdownMenuItem(text = { Text("Scan QR") }, onClick = { menuOpen = false; onScan() })
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.background,
        ),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchBar(query: String, onQueryChange: (String) -> Unit, onClose: () -> Unit) {
    TopAppBar(
        title = {
            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = { Text("Search in chat") },
                singleLine = true,
            )
        },
        navigationIcon = {
            IconButton(onClick = onClose) {
                Icon(Icons.Default.Close, contentDescription = "Close search")
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.background,
        ),
    )
}

// ---- composer ----

@Composable
fun Composer(
    value: String,
    onValueChange: (String) -> Unit,
    replyTo: MessageRow?,
    onCancelReply: () -> Unit,
    editing: Boolean,
    onCancelEdit: () -> Unit,
    onSend: () -> Unit,
    onAttach: (Uri) -> Unit,
    onEmoji: () -> Unit,
    onStartRecord: () -> Unit,
    onStopRecord: (Boolean) -> Unit,
    recording: Boolean,
    recordElapsed: Long,
) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) onAttach(uri)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .imePadding()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
        if (replyTo != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Replying to", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(
                        replyTo.text ?: if (replyTo.kind == "file") "📎 file" else "",
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = onCancelReply) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel reply")
                }
            }
        }
        if (editing) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Editing message", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                IconButton(onClick = onCancelEdit) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel edit")
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            IconButton(onClick = { launcher.launch(arrayOf("*/*")) }) {
                Icon(Icons.Default.AttachFile, contentDescription = "Attach", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!recording) {
                Box(modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        value = value,
                        onValueChange = onValueChange,
                        placeholder = { Text("Message") },
                        maxLines = 5,
                        shape = RoundedCornerShape(24.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            disabledBorderColor = Color.Transparent,
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                IconButton(onClick = onEmoji) {
                    Icon(Icons.Default.EmojiEmotions, contentDescription = "Emoji", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (value.isNotBlank()) {
                    SendButton(onClick = onSend)
                } else {
                    PressToRecord(onStart = onStartRecord, onStop = { onStopRecord(true) }, onCancel = { onStopRecord(false) })
                }
            } else {
                Row(
                    modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Default.Mic, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(8.dp))
                    Text("Recording ${Format.duration(recordElapsed)}", style = MaterialTheme.typography.bodyMedium)
                }
                IconButton(onClick = { onStopRecord(true) }) {
                    Icon(Icons.Default.Stop, contentDescription = "Stop", tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun SendButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .padding(start = 2.dp, end = 6.dp)
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Default.Send,
            contentDescription = "Send",
            tint = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun PressToRecord(onStart: () -> Unit, onStop: () -> Unit, onCancel: () -> Unit) {
    var pressed by remember { mutableStateOf(false) }
    IconButton(
        onClick = {
            // fallback tap = start/stop
            if (pressed) onStop()
        },
        modifier = Modifier.pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown()
                onStart()
                pressed = true
                val up = waitForUpOrCancellation()
                pressed = false
                if (up != null) onStop() else onCancel()
            }
        },
    ) {
        Icon(Icons.Default.Mic, contentDescription = "Record voice")
    }
}

// ---- bubbles ----

@Composable
fun MessageBubble(
    message: MessageRow,
    isMine: Boolean,
    file: FileRow?,
    reactions: List<ReactionRow>,
    searchQuery: String?,
    allMessages: List<MessageRow>,
    onLongPress: () -> Unit,
    onClick: () -> Unit,
    onReplyClick: () -> Unit,
) {
    val bubbleColor = if (isMine) GhostBubbleOut else GhostBubbleIn
    val shape = if (isMine) {
        RoundedCornerShape(topStart = 14.dp, topEnd = 4.dp, bottomEnd = 14.dp, bottomStart = 14.dp)
    } else {
        RoundedCornerShape(topStart = 4.dp, topEnd = 14.dp, bottomEnd = 14.dp, bottomStart = 14.dp)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
    ) {
        Box {
            Box(
                modifier = Modifier
                    .align(if (isMine) Alignment.TopEnd else Alignment.TopStart)
                    .offset(x = if (isMine) 3.dp else (-3).dp)
                    .size(9.dp)
                    .graphicsLayer { rotationZ = 45f }
                    .background(bubbleColor),
            )
            Box(
                modifier = Modifier
                    .clip(shape)
                    .background(bubbleColor)
                    .combinedClickable(onClick = onClick, onLongClick = onLongPress)
                    .padding(horizontal = 10.dp, vertical = 6.dp)
                    .widthIn(max = 320.dp),
            ) {
                Column {
                    if (message.forwarded) {
                        Text(
                            "Forwarded",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (message.replyTo != null) {
                        val reply = allMessages.firstOrNull { it.id == message.replyTo }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0x22FFFFFF))
                                .clickable(onClick = onReplyClick)
                                .padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(3.dp)
                                    .height(28.dp)
                                    .background(MaterialTheme.colorScheme.primary),
                            )
                            Spacer(Modifier.width(6.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (reply?.isMine == true) "You" else "",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Text(
                                    reply?.text ?: if (reply?.kind == "file") "📎 file" else "Message not found",
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }

                    when {
                        message.deleted -> {
                            Text("This message was deleted", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        message.kind == "file" -> {
                            FileBubble(message = message, file = file, onOpen = onClick)
                        }
                        else -> {
                            Text(message.text ?: "", style = MaterialTheme.typography.bodyLarge)
                            if (message.edited) {
                                Text("Edited", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.align(Alignment.End),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (isMine) {
                            Text(
                                text = when (message.status) {
                                    "sending" -> "🕓"
                                    "sent" -> "✓"
                                    "delivered" -> "✓✓"
                                    "read" -> "✓✓"
                                    else -> ""
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (message.status == "read") GhostBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.width(4.dp))
                        }
                        Text(Format.time(message.ts), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (reactions.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .padding(top = 2.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                reactions.forEach { r ->
                    Text(
                        if (r.count > 1) "${r.emoji}×${r.count}" else r.emoji,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun FileBubble(message: MessageRow, file: FileRow?, onOpen: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isDone = file?.status == "done"
    val isImage = file?.mime?.startsWith("image/") == true
    val isVideo = file?.mime?.startsWith("video/") == true
    val isVoice = message.voice == true
    val progress = file?.progress ?: 0f

    Column {
        val preview = file?.path?.let { File(it) }?.takeIf { it.exists() }
            ?: file?.sourcePath?.let { File(it) }?.takeIf { it.exists() }
        if (preview != null && (isImage || isVideo)) {
            AsyncImage(
                model = preview,
                contentDescription = null,
                modifier = Modifier
                    .padding(vertical = 4.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .size(width = 200.dp, height = 200.dp),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            if (isVoice) {
                val playing = GhostAudioPlayer.currentPath == file?.path
                IconButton(
                    onClick = { file?.path?.let { GhostAudioPlayer.toggle(it) } },
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = "Play",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
                Text("Voice message", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.width(8.dp))
                if (file != null) {
                    Text(
                        Format.fileSize(file.size),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                Icon(
                    Icons.Default.AttachFile,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(file?.name ?: "file", fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        Format.fileSize(file?.size ?: 0),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (!isDone && file != null) {
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when (file.status) {
                        "paused" -> "Paused"
                        "interrupted" -> "Interrupted"
                        "error" -> "Failed"
                        else -> "${(progress * 100).toInt()}%"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = {
                    val s = Ghost.sessionManager.getSession(message.roomId)
                    if (s != null) {
                        scope.launch {
                            if (file.status == "paused" || file.status == "interrupted") s.resumeFile(file.id)
                            else s.pauseFile(file.id)
                        }
                    }
                }) {
                    Text(if (file.status == "paused" || file.status == "interrupted") "Resume" else "Pause")
                }
            }
        }
    }
}

// ---- message actions ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageActionsSheet(
    message: MessageRow,
    canEdit: Boolean,
    onDismiss: () -> Unit,
    onReact: (String, Boolean) -> Unit,
    onReply: () -> Unit,
    onForward: () -> Unit,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val quickReactions = listOf("👍", "❤️", "😂", "😮", "😢", "🙏")
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                quickReactions.forEach { emoji ->
                    Text(
                        emoji,
                        fontSize = 26.sp,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { onReact(emoji, true) }
                            .padding(8.dp),
                    )
                }
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            ActionRow("Reply", onClick = onReply)
            ActionRow("Forward", onClick = onForward)
            if (message.kind == "text") ActionRow("Copy", onClick = onCopy)
            if (canEdit) ActionRow("Edit", onClick = onEdit)
            if (message.isMine) ActionRow("Delete", onClick = onDelete, destructive = true)
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ActionRow(label: String, onClick: () -> Unit, destructive: Boolean = false) {
    Text(
        label,
        style = MaterialTheme.typography.bodyLarge,
        color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
    )
}

// ---- dialogs ----

@Composable
fun EmojiPickerDialog(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val emojis = listOf("😀", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "🙃", "😴", "😭", "😡", "🥳", "🤯", "😇", "🫡", "👍", "👎", "👏", "🙏", "💪", "🔥", "❤️", "💯", "🎉", "✨", "🚀", "🎧", "📎")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Emoji") },
        text = {
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                modifier = Modifier.height(300.dp),
            ) {
                items(emojis) { e ->
                    Text(
                        e,
                        fontSize = 26.sp,
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable { onPick(e) }
                            .padding(8.dp),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Done") }
        },
    )
}

@Composable
fun QrDialog(roomCode: String, onDismiss: () -> Unit) {
    val bitmap = remember(roomCode) { Qr.generateJoinQr(roomCode, 512) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invite to this chat") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Image(bitmap = bitmap.asImageBitmap(), contentDescription = "Join QR", modifier = Modifier.size(260.dp))
                Spacer(Modifier.height(12.dp))
                Text(formatRoomCode(roomCode), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Scan or share the code. Messages stay end-to-end encrypted.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

@Composable
fun SafetyCodeDialog(roomId: String, onDismiss: () -> Unit) {
    var code by remember { mutableStateOf<String?>(null) }
    var peerName by remember { mutableStateOf("") }
    LaunchedEffect(roomId) {
        val room = Ghost.repo.getRoom(roomId)
        code = room?.safetyCode
        peerName = room?.peerName ?: ""
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Encryption") },
        text = {
            Column {
                Text(
                    "Messages in this chat are secured with end-to-end encryption. Verify that your chat with $peerName is protected by comparing the security code.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    code ?: "…",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

@Composable
fun ConnectionDialog(
    roomId: String,
    session: RoomSession?,
    peerState: String,
    signalOnline: Boolean,
    onDismiss: () -> Unit,
) {
    var rtt by remember { mutableStateOf<Long?>(null) }
    var peerName by remember { mutableStateOf("") }
    var safetyCode by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(roomId) {
        val room = Ghost.repo.getRoom(roomId)
        peerName = room?.peerName ?: ""
        safetyCode = room?.safetyCode
        val result = session?.getLinkStats()
        rtt = result?.first
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Connection") },
        text = {
            Column {
                InfoRow("Peer", peerName)
                InfoRow("Status", peerState)
                InfoRow("Signal server", if (signalOnline) "Connected" else "Offline")
                InfoRow("Round-trip", rtt?.let { "$it ms" } ?: "—")
                InfoRow("Encryption", "End-to-end (X25519 + AES-256-GCM)")
                InfoRow("Safety code", safetyCode ?: "—")
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(110.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailsDialog(
    roomId: String,
    session: RoomSession?,
    onDismiss: () -> Unit,
    onOpenMedia: (String) -> Unit,
) {
    var files by remember { mutableStateOf<List<FileRow>>(emptyList()) }
    var roomName by remember { mutableStateOf("") }
    var safetyCode by remember { mutableStateOf<String?>(null) }
    var peerName by remember { mutableStateOf("") }
    LaunchedEffect(roomId) {
        files = Ghost.repo.getFiles(roomId).filter { it.status == "done" || it.path != null }
        val room = Ghost.repo.getRoom(roomId)
        peerName = room?.peerName ?: ""
        safetyCode = room?.safetyCode
        roomName = room?.code ?: ""
    }
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text(peerName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Room code: ${formatRoomCode(roomName)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            InfoRow("Encryption", "End-to-end (X25519 + AES-256-GCM)")
            InfoRow("Safety code", safetyCode ?: "—")
            Spacer(Modifier.height(12.dp))
            Text("Media & files", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            if (files.isEmpty()) {
                Text("No media shared yet", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.height(240.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    items(files) { f ->
                        val preview = f.path?.let { File(it) }?.takeIf { it.exists() }
                            ?: f.sourcePath?.let { File(it) }?.takeIf { it.exists() }
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { onOpenMedia(f.id) },
                        ) {
                            if (preview != null) {
                                AsyncImage(model = preview, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                            } else {
                                Text("📎", modifier = Modifier.align(Alignment.Center))
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Close") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForwardDialog(
    identity: LocalIdentity,
    messageId: String?,
    onDismiss: () -> Unit,
    onDone: () -> Unit,
) {
    var rooms by remember { mutableStateOf<List<RoomRow>>(emptyList()) }
    var message by remember { mutableStateOf<MessageRow?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        rooms = Ghost.repo.getRooms()
        message = messageId?.let { Ghost.repo.getMessage(it) }
    }
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            Text("Forward to", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                items(rooms) { room ->
                    val current = message?.roomId == room.id
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !current) {
                                val msg = message
                                if (msg != null) {
                                    scope.launch {
                                        try {
                                            Ghost.sessionManager.sendForward(room, IdentityUtil.toProtocol(identity), msg)
                                            AppState.pushToast("Forwarded", "↪️")
                                        } catch (e: Exception) {
                                            AppState.emit(com.dikshant.ghostchat.core.state.AppEvent.Error(e.message ?: "Forward failed"))
                                        }
                                        onDone()
                                    }
                                }
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(nameEmoji(room.peerName), nameColor(room.peerName), null, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            room.peerName ?: formatRoomCode(room.code),
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        if (current) Text("current", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
