package com.dikshant.ghostchat.core.protocol

import java.security.SecureRandom

const val ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const val ROOM_CODE_LENGTH = 8
const val ROOM_CODE_GROUP_LENGTH = 4

private val ALPHABET_SET: Set<Char> = ROOM_CODE_ALPHABET.toSet()
private val random = SecureRandom()

fun generateRoomCode(): String {
    val sb = StringBuilder(ROOM_CODE_LENGTH)
    repeat(ROOM_CODE_LENGTH) {
        sb.append(ROOM_CODE_ALPHABET[random.nextInt(ROOM_CODE_ALPHABET.length)])
    }
    return sb.toString()
}

fun formatRoomCode(code: String): String {
    val clean = normalizeRoomCode(code) ?: return ""
    return clean.chunked(ROOM_CODE_GROUP_LENGTH).joinToString("-")
}

/** Normalizes user input into a canonical room code, or null when invalid. */
fun normalizeRoomCode(input: String): String? {
    val cleaned = input.filter { it.isLetterOrDigit() }.uppercase()
    if (cleaned.length != ROOM_CODE_LENGTH) return null
    for (c in cleaned) {
        if (c !in ALPHABET_SET) return null
    }
    return cleaned
}
