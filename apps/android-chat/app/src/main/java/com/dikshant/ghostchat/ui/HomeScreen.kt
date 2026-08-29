package com.dikshant.ghostchat.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.db.RoomRow
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.formatRoomCode
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.Format
import kotlinx.coroutines.launch

data class HomeItem(
    val room: RoomRow,
    val lastText: String,
    val lastTs: Long,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    identity: LocalIdentity,
    onOpenRoom: (String) -> Unit,
    onNewChat: () -> Unit,
    onScan: () -> Unit,
    onSettings: () -> Unit,
) {
    var rooms by remember { mutableStateOf<List<HomeItem>>(emptyList()) }
    var online by remember { mutableStateOf(mapOf<String, Boolean>()) }
    var typing by remember { mutableStateOf(mapOf<String, Boolean>()) }
    var peerStates by remember { mutableStateOf(mapOf<String, String>()) }
    var signalOnline by remember { mutableStateOf(AppState.signalOnline.value) }
    var search by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        fun reload() {
            val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO)
            scope.launch {
                val items = Ghost.repo.getRooms().map { room ->
                    val last = Ghost.repo.getLastMessage(room.id)
                    HomeItem(
                        room = room,
                        lastText = Format.messagePreview(last?.kind ?: "", last?.text, last?.voice ?: false, null),
                        lastTs = last?.ts ?: room.lastActivity,
                    )
                }
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    rooms = items
                }
            }
        }
        reload()
        AppState.events.collect { event ->
            when (event) {
                AppEvent.DataChanged -> reload()
                is AppEvent.Online -> online = online + (event.roomId to event.online)
                is AppEvent.Typing -> typing = typing + (event.roomId to event.active)
                is AppEvent.PeerState -> peerStates = peerStates + (event.roomId to event.state)
                is AppEvent.SignalOnline -> signalOnline = event.online
                else -> {}
            }
        }
    }

    val filtered = if (search.isBlank()) rooms else rooms.filter {
        (it.room.peerName ?: "").contains(search, ignoreCase = true) ||
            it.room.code.contains(search.filter { c -> c.isLetterOrDigit() }, ignoreCase = true)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Ghost Chat", fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            shape = CircleShape,
                            color = if (signalOnline) com.dikshant.ghostchat.ui.theme.GhostMint.copy(alpha = 0.18f)
                            else MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (signalOnline) com.dikshant.ghostchat.ui.theme.GhostMint
                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                        ),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    if (signalOnline) "signal" else "offline",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (signalOnline) com.dikshant.ghostchat.ui.theme.GhostMint
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onScan) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan a QR code")
                    }
                    IconButton(onClick = onSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNewChat) {
                Icon(Icons.Default.ChatBubble, contentDescription = "New chat")
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search chats") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (search.isNotEmpty()) {
                        IconButton(onClick = { search = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear")
                        }
                    }
                },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
            if (filtered.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(88.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("👻", style = MaterialTheme.typography.displayMedium)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (search.isNotBlank()) "No chats match your search."
                        else "No conversations yet. Create a room and share the code — or the QR code — with someone you trust. Both of you need to be online to chat.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 32.dp),
                    )
                    if (search.isBlank()) {
                        Spacer(Modifier.height(20.dp))
                        Button(onClick = onNewChat) {
                            Text("Start chatting")
                        }
                    }
                }
            } else {
                LazyColumn {
                    items(filtered, key = { it.room.id }) { item ->
                        HomeRow(
                            item = item,
                            isUnread = item.room.unreadCount > 0,
                            isOnline = online[item.room.id] == true,
                            peerState = peerStates[item.room.id],
                            isTyping = typing[item.room.id] == true,
                            onClick = { onOpenRoom(item.room.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeRow(item: HomeItem, isUnread: Boolean, isOnline: Boolean, peerState: String?, isTyping: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Avatar(
                emoji = nameEmoji(item.room.peerName),
                color = nameColor(item.room.peerName),
                photo = null,
                size = 48.dp,
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(presenceColor(isOnline, peerState)),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.room.peerName ?: formatRoomCode(item.room.code),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (isUnread) FontWeight.Bold else FontWeight.SemiBold,
                    color = if (isUnread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = if (item.lastTs > 0) Format.dayLabel(item.lastTs) else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isUnread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (isUnread) FontWeight.Medium else FontWeight.Normal,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = when {
                        isTyping -> "typing…"
                        item.lastText.isEmpty() -> "Messages are end-to-end encrypted"
                        else -> item.lastText
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = when {
                        isTyping -> MaterialTheme.colorScheme.primary
                        isUnread -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    fontWeight = if (isUnread) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                if (item.room.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = item.room.unreadCount.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun presenceColor(isOnline: Boolean, peerState: String?): androidx.compose.ui.graphics.Color =
    when {
        !isOnline -> MaterialTheme.colorScheme.surfaceVariant
        peerState == "connected" -> com.dikshant.ghostchat.ui.theme.GhostMint
        peerState == "connecting" || peerState == "reconnecting" || peerState == "disconnected" ->
            androidx.compose.ui.graphics.Color(0xFFF59E0B)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

/** Deterministic emoji + color for peers (they only share a name). */fun nameEmoji(name: String?): String {
    val list = listOf("🦊", "🐼", "🦁", "🐸", "🦄", "🐙", "🦋", "🐝", "🦉", "🐳", "🐧", "🐨")
    return list[Math.floorMod(name.hashCode(), list.size)]
}

fun nameColor(name: String?): String {
    val list = listOf(
        "#00a884", "#00b5c4", "#008069", "#ee2f2f", "#8e24aa",
        "#3f51b5", "#f57c00", "#009688", "#e91e63", "#ff6d00", "#546e7a", "#d32f2f",
    )
    return list[Math.floorMod(name.hashCode(), list.size)]
}
