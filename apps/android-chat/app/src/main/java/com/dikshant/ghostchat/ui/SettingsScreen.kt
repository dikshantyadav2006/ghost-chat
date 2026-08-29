package com.dikshant.ghostchat.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.IdentityUtil
import kotlinx.coroutines.launch
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    identity: LocalIdentity,
    onBack: () -> Unit,
    onIdentityChanged: (LocalIdentity) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val emojiPool = listOf("🦊", "🐼", "🦁", "🐸", "🦄", "🐙", "🦋", "🐝", "🦉", "🐳")
    val colorPool = listOf(
        "#00a884", "#00b5c4", "#008069", "#ee2f2f", "#8e24aa", "#3f51b5", "#f57c00", "#009688",
        "#e91e63", "#ff6d00",
    )

    var name by remember { mutableStateOf(identity.name) }
    var emoji by remember { mutableStateOf(identity.avatar.emoji) }
    var color by remember { mutableStateOf(identity.avatar.color) }
    var sound by remember { mutableStateOf(Ghost.prefs.sound) }
    var haptics by remember { mutableStateOf(Ghost.prefs.haptics) }
    var notifications by remember { mutableStateOf(Ghost.prefs.notifications) }
    var backgroundConnection by remember { mutableStateOf(Ghost.prefs.backgroundConnection) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    var hasChanges by remember { mutableStateOf(false) }

    fun markChanged() { hasChanges = true }

    fun notificationGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                Ghost.context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            notifications = true
            Ghost.prefs.notifications = true
        } else {
            notifications = false
            AppState.pushToast("Notification permission denied", "🔕")
        }
    }

    fun setNotifications(enabled: Boolean) {
        if (!enabled) {
            notifications = false
            Ghost.prefs.notifications = false
        } else if (notificationGranted()) {
            notifications = true
            Ghost.prefs.notifications = true
        } else {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Profile & settings", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (hasChanges) {
                        TextButton(onClick = {
                            val updated = identity.copy(
                                name = name.trim().take(40).ifEmpty { "ghost" },
                                avatar = identity.avatar.copy(emoji = emoji, color = color),
                            )
                            scope.launch {
                                IdentityUtil.save(updated)
                                val protocol = IdentityUtil.toProtocol(updated)
                                Ghost.sessionManager.setSessionIdentity(protocol)
                                if (Ghost.socketManager.isConnected()) {
                                    Ghost.socketManager.register(protocol)
                                }
                                onIdentityChanged(updated)
                                AppState.pushToast("Profile saved", "✅")
                            }
                        }) { Text("Save") }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(emoji, color, identity.avatar.photo, 72.dp)
                Spacer(Modifier.width(16.dp))
                Column {
                    Text(name.ifEmpty { "ghost" }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "End-to-end encrypted",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it; markChanged() },
                label = { Text("Display name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(16.dp))
            Text("Emoji", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                emojiPool.forEach { e ->
                    Text(
                        e,
                        fontSize = 26.sp,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(
                                if (e == emoji) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant,
                            )
                            .clickable { emoji = e; markChanged() }
                            .padding(8.dp),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("Color", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                colorPool.forEach { c ->
                    val selected = c == color
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (selected) MaterialTheme.colorScheme.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent)
                            .clickable { color = c; markChanged() }
                            .padding(3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = androidx.compose.ui.graphics.Color.White,
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(parseColor(c)),
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))

            SettingToggle("Sounds", sound, { sound = it; Ghost.prefs.sound = it })
            SettingToggle("Haptics", haptics, { haptics = it; Ghost.prefs.haptics = it })
            SettingToggle("Notifications", notifications, ::setNotifications)
            SettingToggle(
                "Background connection",
                backgroundConnection,
                {
                    backgroundConnection = it
                    Ghost.prefs.backgroundConnection = it
                    if (it) com.dikshant.ghostchat.ForegroundService.start(Ghost.context)
                    else com.dikshant.ghostchat.ForegroundService.stop(Ghost.context)
                },
            )
            Text(
                "Keep connecting in the background so you receive messages and calls the moment internet is available, like WhatsApp.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            if (notifications && !notificationGranted()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Permission denied. Allow notifications for GhostChat in your system settings.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))

            Text(
                "Delete all chats",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { confirmDelete = true }
                    .padding(vertical = 12.dp),
            )
            Text(
                "Reset everything",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { confirmReset = true }
                    .padding(vertical = 12.dp),
            )
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete all chats") },
            text = { Text("Delete every conversation and its files from this device? This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        Ghost.sessionManager.closeAllSessions()
                        Ghost.repo.deleteAllRooms()
                        Ghost.prefs.lastActiveRoomId = null
                        AppState.dataChanged()
                        AppState.pushToast("All chats deleted", "🗑")
                    }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Cancel") }
            },
        )
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset everything") },
            text = { Text("This will erase your identity and all data on this device. You can create a new identity afterwards. Continue?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmReset = false
                    scope.launch {
                        Ghost.sessionManager.closeAllSessions()
                        val ctx = Ghost.context
                        com.dikshant.ghostchat.ForegroundService.stop(ctx)
                        Ghost.prefs.clearAll()
                        ctx.deleteDatabase("ghostchat.db")
                        File(ctx.filesDir, "received").deleteRecursively()
                        File(ctx.filesDir, "avatars").deleteRecursively()
                        File(ctx.cacheDir, "outbound").deleteRecursively()
                        AppState.pushToast("All data erased", "🧹")
                    }
                }) { Text("Reset", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmReset = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun SettingToggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
