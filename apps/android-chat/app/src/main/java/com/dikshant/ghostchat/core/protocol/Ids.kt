package com.dikshant.ghostchat.core.protocol

import java.security.SecureRandom

private const val ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
private val random = SecureRandom()

/**
 * Crypto-random id used for messages, files, signals, sessions, identities and
 * rooms. Matches @ghost/protocol's newId() shape: "<prefix>-" + 12 url-safe
 * chars. The receiver never validates beyond length, so modulo bias is fine.
 */
fun newId(prefix: String): String {
    val sb = StringBuilder(prefix.length + 1 + 12)
    sb.append(prefix).append('-')
    repeat(12) {
        sb.append(ID_ALPHABET[random.nextInt(ID_ALPHABET.length)])
    }
    return sb.toString()
}
