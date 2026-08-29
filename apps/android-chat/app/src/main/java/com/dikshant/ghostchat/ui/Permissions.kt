package com.dikshant.ghostchat.ui

import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred

/**
 * Returns a suspend function that requests the given runtime permissions and
 * resumes with true only if all of them were granted. Permissions that are
 * already granted are skipped without showing the system dialog.
 */
@Composable
fun rememberPermissionRequester(): suspend (Array<String>) -> Boolean {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<CompletableDeferred<Boolean>?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        pending?.complete(result.values.all { it })
        pending = null
    }
    return remember(context, launcher) {
        val request: suspend (Array<String>) -> Boolean = { permissions ->
            val missing = permissions.filter {
                ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
            }.toTypedArray()
            if (missing.isEmpty()) {
                true
            } else {
                val deferred = CompletableDeferred<Boolean>()
                pending = deferred
                launcher.launch(missing)
                deferred.await()
            }
        }
        request
    }
}