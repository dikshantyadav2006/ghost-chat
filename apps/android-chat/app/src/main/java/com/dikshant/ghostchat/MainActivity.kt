package com.dikshant.ghostchat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.dikshant.ghostchat.core.util.Notify
import com.dikshant.ghostchat.ui.AppRoot
import com.dikshant.ghostchat.ui.theme.GhostChatTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Notify.ensureChannels(this)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            GhostChatTheme {
                val initialJoinCode = remember { extractJoinCode(intent) }
                AppRoot(initialJoinCode = initialJoinCode)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        joinCode = extractJoinCode(intent)
    }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    private fun extractJoinCode(intent: Intent?): String? {
        val data = intent?.data ?: return null
        val path = data.path ?: return null
        return when {
            path.startsWith("/join/") -> path.removePrefix("/join/")
            else -> path.removePrefix("/")
        }
    }

    companion object {
        var joinCode: String? = null
    }
}
