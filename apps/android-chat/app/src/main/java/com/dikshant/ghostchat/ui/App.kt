package com.dikshant.ghostchat.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.normalizeRoomCode
import com.dikshant.ghostchat.core.state.AppEvent
import com.dikshant.ghostchat.core.state.AppState
import com.dikshant.ghostchat.core.util.IdentityUtil
import com.dikshant.ghostchat.ui.call.CallOverlay
import kotlinx.coroutines.launch

@Composable
fun AppRoot(initialJoinCode: String?) {
    val context = LocalContext.current
    var identity by remember { mutableStateOf<LocalIdentity?>(null) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        identity = IdentityUtil.get()
        loaded = true
    }

    if (!loaded) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {}
        return
    }

    val existing = identity
    if (existing == null || !Ghost.prefs.onboardingComplete) {
        OnboardingScreen(onDone = { saved -> identity = saved })
        return
    }

    val navController = rememberNavController()
    var joinCode by remember { mutableStateOf(initialJoinCode ?: com.dikshant.ghostchat.MainActivity.joinCode) }

    LaunchedEffect(existing) {
        val protocol = IdentityUtil.toProtocol(existing)
        Ghost.sessionManager.connect(protocol)
        Ghost.sessionManager.openAllRooms(protocol)
    }

    LaunchedEffect(joinCode) {
        val code = joinCode ?: return@LaunchedEffect
        val normalized = normalizeRoomCode(code)
        if (normalized != null) {
            navController.navigate("chat/$normalized") { launchSingleTop = true }
        }
        joinCode = null
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = "home",
        ) {
            composable("home") {
                HomeScreen(
                    identity = existing,
                    onOpenRoom = { code -> navController.navigate("chat/$code") { launchSingleTop = true } },
                    onNewChat = { navController.navigate("new") },
                    onScan = { navController.navigate("scan") },
                    onSettings = { navController.navigate("settings") },
                )
            }
            composable("new") {
                NewChatScreen(
                    identity = existing,
                    onOpenRoom = { code ->
                        navController.navigate("chat/$code") { popUpTo("new") { inclusive = true } }
                    },
                    onScan = { navController.navigate("scan") },
                    onBack = { navController.popBackStack() },
                )
            }
            composable("chat/{code}") { entry ->
                val code = entry.arguments?.getString("code") ?: return@composable
                ChatScreen(
                    identity = existing,
                    code = code,
                    onBack = { navController.popBackStack() },
                    onOpenMedia = { fileId -> navController.navigate("media/$fileId") },
                    onScan = { navController.navigate("scan") },
                )
            }
            composable("settings") {
                SettingsScreen(
                    identity = existing,
                    onBack = { navController.popBackStack() },
                    onIdentityChanged = { identity = it },
                )
            }
            composable("scan") {
                QrScannerScreen(
                    onScanned = { code ->
                        navController.popBackStack()
                        navController.navigate("chat/$code") { launchSingleTop = true }
                    },
                    onBack = { navController.popBackStack() },
                )
            }
            composable("media/{fileId}") { entry ->
                val fileId = entry.arguments?.getString("fileId") ?: return@composable
                MediaViewerScreen(fileId = fileId, onBack = { navController.popBackStack() })
            }
        }

        CallOverlay(identity = existing)

        ToastHost()
    }
}

@Composable
fun ToastHost() {
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var emoji by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        AppState.events.collect { event ->
            when (event) {
                is AppEvent.Toast -> {
                    emoji = event.emoji
                    isError = false
                    scope.launch { snackbarHostState.showSnackbar(event.message) }
                }
                is AppEvent.Error -> {
                    emoji = "⚠️"
                    isError = true
                    scope.launch { snackbarHostState.showSnackbar(event.message) }
                }
                else -> {}
            }
        }
    }
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        SnackbarHost(
            hostState = snackbarHostState,
            snackbar = { data ->
                val bg = if (isError) MaterialTheme.colorScheme.errorContainer
                else MaterialTheme.colorScheme.surfaceVariant
                val fg = if (isError) MaterialTheme.colorScheme.onErrorContainer
                else MaterialTheme.colorScheme.onSurface
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = bg,
                    shadowElevation = 8.dp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(emoji, fontSize = 20.sp)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            data.visuals.message,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = fg,
                            modifier = Modifier.weight(1f),
                        )
                        data.visuals.actionLabel?.let {
                            Spacer(Modifier.width(8.dp))
                            TextButton(onClick = { data.dismiss(); data.performAction() }) {
                                Text(it, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            },
        )
    }
}
