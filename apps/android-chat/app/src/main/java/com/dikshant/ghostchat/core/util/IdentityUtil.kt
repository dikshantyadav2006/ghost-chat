package com.dikshant.ghostchat.core.util

import com.dikshant.ghostchat.core.Ghost
import com.dikshant.ghostchat.core.crypto.Crypto
import com.dikshant.ghostchat.core.protocol.Avatar
import com.dikshant.ghostchat.core.protocol.Identity
import com.dikshant.ghostchat.core.protocol.LocalIdentity
import com.dikshant.ghostchat.core.protocol.newId

/** Identity creation / persistence (port of apps/chat/src/lib/identity.ts). */
object IdentityUtil {

    private val emojiPool = listOf("🦊", "🐼", "🦁", "🐸", "🦄", "🐙", "🦋", "🐝", "🦉", "🐳")
    private val colorPool = listOf(
        "#00a884", "#00b5c4", "#008069", "#ee2f2f", "#8e24aa", "#3f51b5", "#f57c00", "#009688",
        "#e91e63", "#ff6d00",
    )

    fun createIdentity(name: String, emoji: String? = null, color: String? = null): LocalIdentity {
        val (pub, priv) = Crypto.generateKeyPair()
        return LocalIdentity(
            userId = newId("u"),
            name = name.trim().take(40).ifEmpty { "ghost" },
            publicKey = pub,
            privateKey = priv,
            avatar = Avatar(
                emoji = emoji ?: emojiPool.random(),
                color = color ?: colorPool.random(),
                photo = null,
            ),
            createdAt = System.currentTimeMillis(),
        )
    }

    suspend fun save(local: LocalIdentity): LocalIdentity {
        Ghost.repo.setIdentity(local)
        Ghost.prefs.onboardingComplete = true
        return local
    }

    suspend fun get(): LocalIdentity? = Ghost.repo.getIdentity()

    fun toProtocol(local: LocalIdentity): Identity =
        Identity(local.userId, local.name, local.publicKey)
}
