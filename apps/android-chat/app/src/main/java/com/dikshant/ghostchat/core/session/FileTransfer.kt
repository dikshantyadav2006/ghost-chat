package com.dikshant.ghostchat.core.session

import com.dikshant.ghostchat.core.crypto.Crypto
import com.dikshant.ghostchat.core.protocol.ChunkRange
import com.dikshant.ghostchat.core.protocol.FileChunk
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest

const val DEFAULT_CHUNK_SIZE = 16 * 1024
const val MAX_CHUNK_SIZE = 256 * 1024
const val CHUNK_FRAME_OVERHEAD = 128

/**
 * Picks a chunk size that stays safely under the data channel's maximum
 * message size. Android's WebRTC SDK does not expose `sctp.maxMessageSize`,
 * so when the limit is unknown we keep the safe 16 KiB default (well under
 * every browser's ceiling — Chromium ~256 KiB, Firefox/Safari 64 KiB).
 */
fun pickChunkSize(maxMessageSize: Int?): Int {
    if (maxMessageSize == null || maxMessageSize <= 0) return DEFAULT_CHUNK_SIZE
    val cap = maxMessageSize - CHUNK_FRAME_OVERHEAD
    return maxOf(DEFAULT_CHUNK_SIZE, minOf(MAX_CHUNK_SIZE, cap))
}

/** Streaming SHA-256 hex of a file (memory stays flat for multi-GB files). */
fun hashFile(file: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buf = ByteArray(1 shl 16)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
        }
    }
    return md.digest().toHex()
}

fun hashBytes(data: ByteArray): String = Crypto.sha256Hex(data)

/** Cancellation token for an outbound send loop. */
class SendControl {
    @Volatile var cancelled = false
}

/**
 * Reads only the byte spans covered by `ranges` and hands each chunk to
 * `onChunk`. Global seqs are preserved. Throws if the underlying channel dies.
 */
suspend fun forEachChunkInRanges(
    file: File,
    fileId: String,
    chunkSize: Int,
    ranges: List<ChunkRange>,
    totalChunks: Int,
    control: SendControl,
    onChunk: suspend (FileChunk) -> Unit,
) {
    if (ranges.isEmpty()) return
    RandomAccessFile(file, "r").use { raf ->
        for ((start, end) in ranges) {
            val fromByte = minOf(start.toLong() * chunkSize, file.length())
            val toByte = minOf((end.toLong() + 1) * chunkSize, file.length())
            raf.seek(fromByte)
            var localSeq = 0
            var remaining = toByte - fromByte
            while (remaining > 0) {
                if (control.cancelled) return
                val len = minOf(chunkSize.toLong(), remaining).toInt()
                val data = ByteArray(len)
                raf.readFully(data)
                onChunk(
                    FileChunk(
                        fileId = fileId,
                        seq = start + localSeq,
                        total = totalChunks,
                        sha256 = hashBytes(data),
                        data = data,
                    ),
                )
                localSeq++
                remaining -= len
            }
        }
    }
}

/** Minimal persistence contract for received chunks (SQLite-backed in Android). */
interface ChunkStore {
    suspend fun putChunk(chunk: FileChunk)
    suspend fun countChunks(fileId: String): Int
    suspend fun getChunk(fileId: String, seq: Int): ByteArray?
    suspend fun chunkSeqs(fileId: String): List<Int>
}

class FileAssembler(
    private val fileId: String,
    private val store: ChunkStore,
    private val total: Int,
    private val expectedSize: Long,
    private val expectedSha256: String,
) {
    val chunkCount: Int get() = total

    suspend fun add(chunk: FileChunk) {
        if (chunk.fileId != fileId || chunk.total != total) return
        if (chunk.seq < 0 || chunk.seq >= total) return
        val existing = store.getChunk(fileId, chunk.seq)
        if (existing != null) return
        store.putChunk(chunk)
    }

    suspend fun isComplete(): Boolean = store.countChunks(fileId) >= total

    /**
     * Streams persisted chunks into `out` in order, verifying size + hash.
     * Returns true when the assembled file is valid. Memory stays flat.
     */
    suspend fun assemble(out: File): Boolean {
        if (store.countChunks(fileId) < total) return false
        val md = MessageDigest.getInstance("SHA-256")
        var size = 0L
        out.parentFile?.mkdirs()
        out.outputStream().use { os ->
            for (seq in 0 until total) {
                val data = store.getChunk(fileId, seq) ?: return false
                os.write(data)
                md.update(data)
                size += data.size
            }
        }
        if (size != expectedSize) return false
        return md.digest().toHex() == expectedSha256
    }
}

fun ByteArray.toHex(): String {
    val sb = StringBuilder(size * 2)
    for (b in this) sb.append("%02x".format(b.toInt() and 0xff))
    return sb.toString()
}
