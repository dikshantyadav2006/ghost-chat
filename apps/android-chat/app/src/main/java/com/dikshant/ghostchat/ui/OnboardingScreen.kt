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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.util.IdentityUtil
import kotlinx.coroutines.launch

private val emojis = listOf("🦊", "🐼", "🦁", "🐸", "🦄", "🐙", "🦋", "🐝", "🦉", "🐳")
private val colors = listOf(
    "#00a884", "#00b5c4", "#008069", "#ee2f2f", "#8e24aa",
    "#3f51b5", "#f57c00", "#009688", "#e91e63", "#ff6d00",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(onDone: (LocalIdentity) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var emoji by remember { mutableStateOf(emojis.first()) }
    var color by remember { mutableStateOf(colors.first()) }
    var busy by remember { mutableStateOf(false) }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(64.dp))
            Text("Ghost Chat", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "End-to-end encrypted · no accounts · no servers storing messages",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(40.dp))

            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(parseColor(color)),
                contentAlignment = Alignment.Center,
            ) {
                Text(emoji, fontSize = 44.sp)
            }
            Spacer(Modifier.height(8.dp))

            Text("Pick an avatar", style = MaterialTheme.typography.labelLarge)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                emojis.forEach { e ->
                    Text(
                        e,
                        fontSize = 26.sp,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (e == emoji) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { emoji = e }
                            .padding(6.dp),
                    )
                }
            }
            Text("Pick a color", style = MaterialTheme.typography.labelLarge)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                colors.forEach { c ->
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(parseColor(c))
                            .clickable { color = c }
                            .then(
                                if (c == color) Modifier.padding(3.dp).background(MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier,
                            ),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(40) },
                label = { Text("Your name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = {
                    if (name.trim().isNotEmpty() && !busy) {
                        busy = true
                        scope.launch {
                            val identity = IdentityUtil.createIdentity(name, emoji, color)
                            IdentityUtil.save(identity)
                            onDone(identity)
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = name.trim().isNotEmpty() && !busy,
            ) {
                Text("Start chatting")
            }
        }
    }
}
