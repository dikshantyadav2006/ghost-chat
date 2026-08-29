package com.dikshant.ghostchat.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.formatRoomCode
import com.dikshant.ghostchat.core.protocol.generateRoomCode
import com.dikshant.ghostchat.core.protocol.normalizeRoomCode
import com.dikshant.ghostchat.core.session.SessionCallbacks
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.IdentityUtil
import com.dikshant.ghostchat.core.util.Qr
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class CopyTarget { Code, Link }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewChatScreen(
    identity: LocalIdentity,
    onOpenRoom: (String) -> Unit,
    onScan: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboard.current
    var codeInput by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf<CopyTarget?>(null) }

    fun createRoom() {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            val code = generateRoomCode()
            val protocol = IdentityUtil.toProtocol(identity)
            try {
                Ghost.sessionManager.openRoom(code, "create", protocol, callbacks = defaultCallbacks())
                created = code
            } catch (e: Exception) {
                error = e.message ?: "Could not create room"
            } finally {
                busy = false
            }
        }
    }

    fun joinWithCode() {
        val roomId = normalizeRoomCode(codeInput)
        if (roomId == null) {
            error = "That doesn't look like a valid room code (8 characters like ABCD-EFGH)."
            return
        }
        if (busy) return
        busy = true
        error = null
        scope.launch {
            val protocol = IdentityUtil.toProtocol(identity)
            try {
                Ghost.sessionManager.openRoom(roomId, "join", protocol, callbacks = defaultCallbacks())
                onOpenRoom(roomId)
            } catch (e: Exception) {
                error = e.message ?: "Could not join room"
            } finally {
                busy = false
            }
        }
    }

    fun copy(text: String, target: CopyTarget) {
        scope.launch {
            clipboard.setClipEntry(ClipEntry(android.content.ClipData.newPlainText("ghostchat", text)))
            copied = target
            delay(1500)
            copied = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New chat") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            val createdCode = created
            if (createdCode != null) {
                CreatedRoomContent(
                    code = createdCode,
                    copied = copied,
                    onCopyCode = { copy(createdCode, CopyTarget.Code) },
                    onCopyLink = { copy("${Ghost.appOrigin}/join/$createdCode", CopyTarget.Link) },
                    onOpen = { onOpenRoom(createdCode) },
                    onClose = { created = null },
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ActionCard(
                        icon = Icons.Default.Add,
                        title = "Create a room",
                        subtitle = "Get a code + QR to share",
                        modifier = Modifier.weight(1f),
                        onClick = ::createRoom,
                    )
                    ActionCard(
                        icon = Icons.Default.QrCodeScanner,
                        title = "Scan a QR",
                        subtitle = "Join by scanning someone's code",
                        modifier = Modifier.weight(1f),
                        onClick = onScan,
                    )
                }

                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    HorizontalDivider(modifier = Modifier.weight(1f))
                    Text(
                        "or join with a code",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp),
                    )
                    HorizontalDivider(modifier = Modifier.weight(1f))
                }

                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = codeInput,
                        onValueChange = { codeInput = it.take(12) },
                        placeholder = { Text("ABCD-EFGH") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = ::joinWithCode,
                        enabled = normalizeRoomCode(codeInput) != null && !busy,
                    ) {
                        Text("Join")
                    }
                }

                if (error != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        error!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Spacer(Modifier.height(16.dp))
                TextButton(onClick = onBack) { Text("Cancel") }
            }
        }
    }
}

@Composable
private fun ActionCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = modifier.heightIn(min = 108.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CreatedRoomContent(
    code: String,
    copied: CopyTarget?,
    onCopyCode: () -> Unit,
    onCopyLink: () -> Unit,
    onOpen: () -> Unit,
    onClose: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Room created", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Share this link — it works once, for one person.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Image(
            bitmap = Qr.generateJoinQr(code, 512).asImageBitmap(),
            contentDescription = "QR code to join room",
            modifier = Modifier.size(224.dp),
        )
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                formatRoomCode(code),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = onCopyCode) {
                Icon(
                    if (copied == CopyTarget.Code) Icons.Default.Check else Icons.Default.ContentCopy,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.padding(horizontal = 2.dp))
                Text(if (copied == CopyTarget.Code) "Copied!" else "Copy code")
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onCopyLink, modifier = Modifier.fillMaxWidth()) {
            Icon(
                if (copied == CopyTarget.Link) Icons.Default.Check else Icons.Default.Link,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.padding(horizontal = 4.dp))
            Text(if (copied == CopyTarget.Link) "Link copied!" else "Copy invite link")
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
            Text("Open chat")
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onClose) { Text("Close") }
    }
}

private fun defaultCallbacks() = object : SessionCallbacks {
    override fun onError(roomId: String, message: String) {
        AppState.emit(AppEvent.Error(message))
    }
}