package com.dikshant.ghostchat.core.protocol

/** A peer's stable public identity, shared over the socket + hello handshake. */
data class Identity(
    val userId: String,
    val name: String,
    val publicKey: String,
)

data class Avatar(
    val emoji: String,
    val color: String,
    val photo: String? = null,
)

data class LocalIdentity(
    val userId: String,
    val name: String,
    val publicKey: String,
    val privateKey: String,
    val avatar: Avatar,
    val createdAt: Long,
)

data class FileMeta(
    val id: String,
    val name: String,
    val mime: String,
    val size: Long,
    val sha256: String,
    val chunkSize: Int,
    val totalChunks: Int,
)

data class ChatMessage(
    val id: String,
    val kind: String,
    val ts: Long,
    val text: String? = null,
    val file: FileMeta? = null,
    val replyTo: String? = null,
    val edited: Boolean? = null,
    val deleted: Boolean? = null,
    val voice: Boolean? = null,
    val forwarded: Boolean? = null,
)

data class EncryptedPayload(
    val iv: String,
    val data: String,
)

/** Inclusive [start, end] chunk range. */
typealias ChunkRange = Pair<Int, Int>

const val MESSAGE_KIND_TEXT = "text"
const val MESSAGE_KIND_FILE = "file"

const val CALL_PHASE_RING = "ring"
const val CALL_PHASE_ACCEPT = "accept"
const val CALL_PHASE_REJECT = "reject"
const val CALL_PHASE_END = "end"

/** Messages sent over the (possibly cipher-wrapped) data channel. */
sealed class ChannelMessage {
    data class Hello(val identity: Identity) : ChannelMessage()
    data class Message(val message: ChatMessage) : ChannelMessage()
    data class Cipher(val payload: EncryptedPayload) : ChannelMessage()
    data class Ack(val messageId: String, val status: String, val ts: Long? = null) : ChannelMessage()
    data class Typing(val active: Boolean) : ChannelMessage()
    data class Edit(val messageId: String, val text: String, val ts: Long) : ChannelMessage()
    data class Delete(val messageId: String, val ts: Long) : ChannelMessage()
    data class FileResume(val fileId: String, val totalChunks: Int, val receivedRanges: List<ChunkRange>) : ChannelMessage()
    data class FilePause(val fileId: String) : ChannelMessage()
    data class FileSent(val fileId: String) : ChannelMessage()
    data class FileReady(val fileId: String) : ChannelMessage()
    data class FileAck(val fileId: String, val receivedChunks: Int) : ChannelMessage()
    data class FileDelivered(val fileId: String) : ChannelMessage()
    data class Reaction(val messageId: String, val emoji: String, val add: Boolean) : ChannelMessage()
    data class Call(val phase: String, val callId: String, val video: Boolean = false) : ChannelMessage()
}

fun isValidUserId(value: String): Boolean =
    value.matches(Regex("^[a-zA-Z0-9_-]{8,64}$"))

fun isValidPublicKey(value: String): Boolean =
    value.matches(Regex("^[A-Za-z0-9+/]{43}={0,2}$"))

fun isValidSessionId(value: String): Boolean =
    value.matches(Regex("^sess-[A-Za-z0-9]{12}$"))
