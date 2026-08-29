package com.dikshant.ghostchat.core.protocol

import java.nio.charset.StandardCharsets

const val FRAME_JSON = 0
const val FRAME_FILE_CHUNK = 1
const val FRAME_CIPHER = 2
const val MAX_JSON_FRAME = 1024 * 1024

data class FileChunk(
    val fileId: String,
    /** Zero-based chunk index (sequence number). Drives ordering and resume. */
    val seq: Int,
    val total: Int,
    /** Per-chunk SHA-256 hex (64 chars) so corruption is caught per chunk. */
    val sha256: String,
    val data: ByteArray,
)

data class EncryptedFrame(
    val iv: ByteArray,
    val data: ByteArray,
)

sealed class DecodedFrame {
    class Json(val message: ChannelMessage) : DecodedFrame()
    class FileChunk(val chunk: com.dikshant.ghostchat.core.protocol.FileChunk) : DecodedFrame()
    class Cipher(val cipher: EncryptedFrame) : DecodedFrame()
}

fun encodeJSONFrame(message: ChannelMessage): ByteArray {
    val json = JsonCodec.encodeChannel(message)
    val bytes = json.toByteArray(StandardCharsets.UTF_8)
    if (bytes.size > MAX_JSON_FRAME) throw IllegalArgumentException("JSON frame exceeds max size")
    return ByteArray(bytes.size + 1).also {
        it[0] = FRAME_JSON.toByte()
        System.arraycopy(bytes, 0, it, 1, bytes.size)
    }
}

fun decodeJSONFrame(frame: ByteArray): ChannelMessage {
    if (frame.isEmpty()) throw IllegalArgumentException("empty frame")
    val payload = frame.copyOfRange(1, frame.size)
    if (payload.size > MAX_JSON_FRAME) throw IllegalArgumentException("frame too large")
    val json = String(payload, StandardCharsets.UTF_8)
    return JsonCodec.decodeChannel(json) ?: throw IllegalArgumentException("invalid channel message")
}

fun encodeFileChunkFrame(chunk: FileChunk): ByteArray {
    if (chunk.sha256.length != 64) throw IllegalArgumentException("chunk sha256 required")
    val fileIdBytes = chunk.fileId.toByteArray(StandardCharsets.UTF_8)
    if (fileIdBytes.size > 255) throw IllegalArgumentException("fileId too long")
    val out = ByteArray(1 + 1 + fileIdBytes.size + 4 + 4 + 64 + chunk.data.size)
    var offset = 0
    out[offset++] = FRAME_FILE_CHUNK.toByte()
    out[offset++] = fileIdBytes.size.toByte()
    System.arraycopy(fileIdBytes, 0, out, offset, fileIdBytes.size)
    offset += fileIdBytes.size
    offset = writeUint32(out, offset, chunk.seq)
    offset = writeUint32(out, offset, chunk.total)
    System.arraycopy(chunk.sha256.toByteArray(StandardCharsets.US_ASCII), 0, out, offset, 64)
    offset += 64
    System.arraycopy(chunk.data, 0, out, offset, chunk.data.size)
    return out
}

fun decodeFileChunkFrame(frame: ByteArray): FileChunk {
    if (frame.size < 74) throw IllegalArgumentException("chunk frame too short")
    val fileIdLen = frame[1].toInt() and 0xff
    if (2 + fileIdLen + 8 + 64 > frame.size) throw IllegalArgumentException("chunk frame truncated")
    val fileId = String(frame, 2, fileIdLen, StandardCharsets.UTF_8)
    var offset = 2 + fileIdLen
    val seq = readUint32(frame, offset); offset += 4
    val total = readUint32(frame, offset); offset += 4
    val sha256 = String(frame, offset, 64, StandardCharsets.US_ASCII)
    offset += 64
    val data = frame.copyOfRange(offset, frame.size)
    return FileChunk(fileId, seq, total, sha256, data)
}

fun encodeCipherFrame(payload: EncryptedFrame): ByteArray {
    if (payload.iv.size > 255) throw IllegalArgumentException("cipher iv too long")
    val out = ByteArray(2 + payload.iv.size + payload.data.size)
    out[0] = FRAME_CIPHER.toByte()
    out[1] = payload.iv.size.toByte()
    System.arraycopy(payload.iv, 0, out, 2, payload.iv.size)
    System.arraycopy(payload.data, 0, out, 2 + payload.iv.size, payload.data.size)
    return out
}

fun decodeCipherFrame(frame: ByteArray): EncryptedFrame {
    if (frame.size < 3) throw IllegalArgumentException("cipher frame too short")
    val ivLen = frame[1].toInt() and 0xff
    if (2 + ivLen > frame.size) throw IllegalArgumentException("cipher frame iv out of bounds")
    val iv = frame.copyOfRange(2, 2 + ivLen)
    val data = frame.copyOfRange(2 + ivLen, frame.size)
    if (data.isEmpty()) throw IllegalArgumentException("cipher frame empty")
    return EncryptedFrame(iv, data)
}

fun decodeFrame(frame: ByteArray): DecodedFrame {
    if (frame.isEmpty()) throw IllegalArgumentException("empty frame")
    return when (frame[0].toInt() and 0xff) {
        FRAME_JSON -> DecodedFrame.Json(decodeJSONFrame(frame))
        FRAME_FILE_CHUNK -> DecodedFrame.FileChunk(decodeFileChunkFrame(frame))
        FRAME_CIPHER -> DecodedFrame.Cipher(decodeCipherFrame(frame))
        else -> throw IllegalArgumentException("unknown frame type: ${frame[0]}")
    }
}

private fun writeUint32(out: ByteArray, offset: Int, value: Int): Int {
    out[offset] = (value ushr 24 and 0xff).toByte()
    out[offset + 1] = (value ushr 16 and 0xff).toByte()
    out[offset + 2] = (value ushr 8 and 0xff).toByte()
    out[offset + 3] = (value and 0xff).toByte()
    return offset + 4
}

private fun readUint32(data: ByteArray, offset: Int): Int =
    ((data[offset].toInt() and 0xff) shl 24) or
        ((data[offset + 1].toInt() and 0xff) shl 16) or
        ((data[offset + 2].toInt() and 0xff) shl 8) or
        (data[offset + 3].toInt() and 0xff)
