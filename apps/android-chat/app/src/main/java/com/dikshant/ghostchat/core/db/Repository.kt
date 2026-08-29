package com.dikshant.ghostchat.core.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.dikshant.ghostchat.core.protocol.ChunkRange
import com.dikshant.ghostchat.core.protocol.newId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class RoomRow(
    val id: String,
    val code: String,
    val mode: String,
    val peerUserId: String?,
    val peerName: String?,
    val peerPublicKey: String?,
    val safetyCode: String?,
    val createdAt: Long,
    val lastActivity: Long,
    val sessionId: String?,
    val unreadCount: Int = 0,
)

data class MessageRow(
    val id: String,
    val roomId: String,
    val isMine: Boolean,
    val kind: String,
    val ts: Long,
    val status: String? = null,
    val text: String? = null,
    val fileId: String? = null,
    val replyTo: String? = null,
    val edited: Boolean = false,
    val deleted: Boolean = false,
    val voice: Boolean = false,
    val forwarded: Boolean = false,
    val sentAt: Long? = null,
    val deliveredAt: Long? = null,
    val readAt: Long? = null,
)

data class FileRow(
    val id: String,
    val roomId: String,
    val name: String,
    val mime: String,
    val size: Long,
    val sha256: String,
    val chunkSize: Int,
    val totalChunks: Int,
    val direction: String,
    val status: String,
    val progress: Float,
    val receivedChunks: Int,
    val lastSentChunk: Int,
    val receivedRanges: List<ChunkRange>,
    val path: String?,
    val sourcePath: String?,
    val preview: String?,
    val uploaded: Boolean,
)

data class ReactionRow(
    val id: String,
    val roomId: String,
    val messageId: String,
    val emoji: String,
    val count: Int,
    val mine: Boolean,
)

/**
 * All persistent state access, mirroring GhostRepository from
 * @ghost/storage/repository.ts. Every call is a suspend function; call from
 * Main and the repository hops to IO internally.
 */
class Repository(context: Context) {

    private val db: GhostDb = GhostDb(context.applicationContext)
    private val writeDb: SQLiteDatabase get() = db.writableDatabase
    private val readDb: SQLiteDatabase get() = db.readableDatabase

    // ---- identity ----

    suspend fun getIdentity(): com.dikshant.ghostchat.core.protocol.LocalIdentity? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT * FROM identity LIMIT 1", null)
        c.use {
            if (!it.moveToFirst()) null
            else com.dikshant.ghostchat.core.protocol.LocalIdentity(
                userId = it.getString(it.getColumnIndexOrThrow("userId")),
                name = it.getString(it.getColumnIndexOrThrow("name")),
                publicKey = it.getString(it.getColumnIndexOrThrow("publicKey")),
                privateKey = it.getString(it.getColumnIndexOrThrow("privateKey")),
                avatar = com.dikshant.ghostchat.core.protocol.Avatar(
                    emoji = it.getString(it.getColumnIndexOrThrow("avatar_emoji")),
                    color = it.getString(it.getColumnIndexOrThrow("avatar_color")),
                    photo = it.getStringOrNull("avatar_photo"),
                ),
                createdAt = it.getLong(it.getColumnIndexOrThrow("createdAt")),
            )
        }
    }

    suspend fun setIdentity(id: com.dikshant.ghostchat.core.protocol.LocalIdentity) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "DELETE FROM identity"
        )
        writeDb.execSQL(
            """INSERT OR REPLACE INTO identity
            (id, userId, name, publicKey, privateKey, avatar_emoji, avatar_color, avatar_photo, createdAt)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            arrayOf(
                id.userId, id.userId, id.name, id.publicKey, id.privateKey,
                id.avatar.emoji, id.avatar.color, id.avatar.photo, id.createdAt,
            ),
        )
    }

    suspend fun updateIdentity(id: com.dikshant.ghostchat.core.protocol.LocalIdentity) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            """UPDATE identity SET userId=?, name=?, publicKey=?, privateKey=?,
               avatar_emoji=?, avatar_color=?, avatar_photo=?, createdAt=? WHERE id=?""",
            arrayOf(
                id.userId, id.name, id.publicKey, id.privateKey,
                id.avatar.emoji, id.avatar.color, id.avatar.photo, id.createdAt, id.userId,
            ),
        )
    }

    suspend fun setLastActiveRoom(roomId: String?) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE identity SET lastActiveRoomId=?", arrayOf(roomId))
    }

    suspend fun getLastActiveRoom(): String? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT lastActiveRoomId FROM identity LIMIT 1", null)
        c.use { if (it.moveToFirst()) it.getStringOrNull("lastActiveRoomId") else null }
    }

    // ---- rooms ----

    suspend fun getRooms(): List<RoomRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<RoomRow>()
        val c = readDb.rawQuery("SELECT * FROM rooms ORDER BY lastActivity DESC", null)
        c.use { while (it.moveToNext()) out.add(it.toRoom()) }
        out
    }

    suspend fun getRoom(id: String): RoomRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT * FROM rooms WHERE id=?", arrayOf(id))
        c.use { if (it.moveToFirst()) it.toRoom() else null }
    }

    suspend fun getRoomByCode(code: String): RoomRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT * FROM rooms WHERE code=?", arrayOf(code))
        c.use { if (it.moveToFirst()) it.toRoom() else null }
    }

    suspend fun putRoom(room: RoomRow) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            """INSERT OR REPLACE INTO rooms
            (id, code, mode, peerUserId, peerName, peerPublicKey, safetyCode, createdAt, lastActivity, sessionId, unreadCount)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            arrayOf(
                room.id, room.code, room.mode, room.peerUserId, room.peerName, room.peerPublicKey,
                room.safetyCode, room.createdAt, room.lastActivity, room.sessionId, room.unreadCount,
            ),
        )
    }

    suspend fun setRoomPeer(roomId: String, peerUserId: String, peerName: String, peerPublicKey: String?) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE rooms SET peerUserId=?, peerName=?, peerPublicKey=? WHERE id=?",
            arrayOf(peerUserId, peerName, peerPublicKey, roomId),
        )
    }

    suspend fun setRoomSafetyCode(roomId: String, safetyCode: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE rooms SET safetyCode=? WHERE id=?", arrayOf(safetyCode, roomId))
    }

    suspend fun setRoomLastActivity(roomId: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE rooms SET lastActivity=? WHERE id=?", arrayOf(ts, roomId))
    }

    suspend fun setRoomUnread(roomId: String, count: Int) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE rooms SET unreadCount=? WHERE id=?", arrayOf(count, roomId))
    }

    suspend fun deleteRoom(id: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM rooms WHERE id=?", arrayOf(id))
    }

    suspend fun deleteAllRooms() = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM rooms")
        writeDb.execSQL("DELETE FROM messages")
        writeDb.execSQL("DELETE FROM files")
        writeDb.execSQL("DELETE FROM chunks")
        writeDb.execSQL("DELETE FROM outbox")
        writeDb.execSQL("DELETE FROM reactions")
    }

    // ---- messages ----

    suspend fun getMessages(roomId: String): List<MessageRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<MessageRow>()
        val c = readDb.rawQuery("SELECT * FROM messages WHERE roomId=? ORDER BY ts ASC", arrayOf(roomId))
        c.use { while (it.moveToNext()) out.add(it.toMessage()) }
        out
    }

    suspend fun getMessage(id: String): MessageRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT * FROM messages WHERE id=?", arrayOf(id))
        c.use { if (it.moveToFirst()) it.toMessage() else null }
    }

    suspend fun getLastMessage(roomId: String): MessageRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery(
            "SELECT * FROM messages WHERE roomId=? AND deleted=0 ORDER BY ts DESC LIMIT 1",
            arrayOf(roomId),
        )
        c.use { if (it.moveToFirst()) it.toMessage() else null }
    }

    suspend fun putMessage(m: MessageRow) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            """INSERT OR REPLACE INTO messages
            (id, roomId, isMine, kind, ts, status, text, fileId, replyTo, edited, deleted, voice, forwarded, sentAt, deliveredAt, readAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            arrayOf(
                m.id, m.roomId, if (m.isMine) 1 else 0, m.kind, m.ts, m.status, m.text,
                m.fileId, m.replyTo, if (m.edited) 1 else 0, if (m.deleted) 1 else 0,
                if (m.voice) 1 else 0, if (m.forwarded) 1 else 0,
                m.sentAt, m.deliveredAt, m.readAt,
            ),
        )
    }

    suspend fun updateMessageStatus(messageId: String, status: String) = withContext(Dispatchers.IO) {
        val ts = System.currentTimeMillis()
        val sent = if (status == "sent") ts else null
        val delivered = if (status == "delivered") ts else null
        val read = if (status == "read") ts else null
        writeDb.execSQL(
            "UPDATE messages SET status=?, sentAt=COALESCE(?,sentAt), deliveredAt=COALESCE(?,deliveredAt), readAt=COALESCE(?,readAt) WHERE id=?",
            arrayOf(status, sent, delivered, read, messageId),
        )
    }

    suspend fun editMessage(messageId: String, text: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE messages SET text=?, edited=1, ts=? WHERE id=?",
            arrayOf(text, ts, messageId),
        )
    }

    suspend fun deleteMessage(messageId: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE messages SET deleted=1, text=NULL, ts=? WHERE id=?",
            arrayOf(ts, messageId),
        )
    }

    suspend fun markRoomRead(roomId: String) = withContext(Dispatchers.IO) {
        val ts = System.currentTimeMillis()
        writeDb.execSQL(
            "UPDATE messages SET status='read', readAt=COALESCE(readAt,?) WHERE roomId=? AND isMine=0",
            arrayOf(ts, roomId),
        )
        writeDb.execSQL("UPDATE rooms SET unreadCount=0 WHERE id=?", arrayOf(roomId))
    }

    suspend fun unreadForRoom(roomId: String): Int = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery(
            "SELECT unreadCount FROM rooms WHERE id=?",
            arrayOf(roomId),
        )
        c.use { if (it.moveToFirst()) it.getInt(0) else 0 }
    }

    suspend fun touchRoom(roomId: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE rooms SET lastActivity=? WHERE id=?",
            arrayOf(ts, roomId),
        )
    }

    // ---- files ----

    suspend fun getFiles(roomId: String): List<FileRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<FileRow>()
        val c = readDb.rawQuery("SELECT * FROM files WHERE roomId=? ORDER BY size DESC", arrayOf(roomId))
        c.use { while (it.moveToNext()) out.add(it.toFile()) }
        out
    }

    suspend fun getFile(id: String): FileRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT * FROM files WHERE id=?", arrayOf(id))
        c.use { if (it.moveToFirst()) it.toFile() else null }
    }

    suspend fun getFileByMessageId(messageId: String): FileRow? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery(
            "SELECT f.* FROM files f JOIN messages m ON m.fileId=f.id WHERE m.id=?",
            arrayOf(messageId),
        )
        c.use { if (it.moveToFirst()) it.toFile() else null }
    }

    suspend fun putFile(f: FileRow) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            """INSERT OR REPLACE INTO files
            (id, roomId, name, mime, size, sha256, chunkSize, totalChunks, direction, status, progress,
             receivedChunks, lastSentChunk, receivedRanges, path, sourcePath, preview, uploaded)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            arrayOf(
                f.id, f.roomId, f.name, f.mime, f.size, f.sha256, f.chunkSize, f.totalChunks,
                f.direction, f.status, f.progress, f.receivedChunks, f.lastSentChunk,
                f.receivedRanges.joinToString(";") { "${it.first}-${it.second}" },
                f.path, f.sourcePath, f.preview, if (f.uploaded) 1 else 0,
            ),
        )
    }

    suspend fun updateFileProgress(fileId: String, receivedChunks: Int, ranges: List<ChunkRange>) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE files SET receivedChunks=?, receivedRanges=? WHERE id=?",
            arrayOf(receivedChunks, ranges.joinToString(";") { "${it.first}-${it.second}" }, fileId),
        )
    }

    suspend fun updateFileLastSent(fileId: String, lastSentChunk: Int) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE files SET lastSentChunk=? WHERE id=?", arrayOf(lastSentChunk, fileId))
    }

    suspend fun updateFileStatus(fileId: String, status: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE files SET status=? WHERE id=?", arrayOf(status, fileId))
    }

    suspend fun updateFileTransfer(fileId: String, status: String, progress: Float, receivedChunks: Int) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE files SET status=?, progress=?, receivedChunks=? WHERE id=?",
            arrayOf(status, progress, receivedChunks, fileId),
        )
    }

    suspend fun setFileRanges(fileId: String, rangesJson: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE files SET receivedRanges=? WHERE id=?",
            arrayOf(rangesJson, fileId),
        )
    }

    suspend fun setFileDone(fileId: String, path: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE files SET status='done', progress=1.0, path=? WHERE id=?",
            arrayOf(path, fileId),
        )
    }

    suspend fun setFilePath(fileId: String, path: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("UPDATE files SET path=? WHERE id=?", arrayOf(path, fileId))
    }

    suspend fun deleteFile(id: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM files WHERE id=?", arrayOf(id))
    }

    // ---- chunks ----

    suspend fun getChunks(fileId: String): List<Pair<Int, ByteArray>> = withContext(Dispatchers.IO) {
        val out = mutableListOf<Pair<Int, ByteArray>>()
        val c = readDb.rawQuery("SELECT seq, data FROM chunks WHERE fileId=? ORDER BY seq ASC", arrayOf(fileId))
        c.use { while (it.moveToNext()) out.add(it.getInt(0) to it.getBlob(1)) }
        out
    }

    suspend fun countChunks(fileId: String): Int = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT COUNT(*) FROM chunks WHERE fileId=?", arrayOf(fileId))
        c.use { if (it.moveToFirst()) it.getInt(0) else 0 }
    }

    suspend fun getChunk(fileId: String, seq: Int): ByteArray? = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery("SELECT data FROM chunks WHERE id=?", arrayOf("$fileId:$seq"))
        c.use { if (it.moveToFirst()) it.getBlob(0) else null }
    }

    suspend fun chunkSeqs(fileId: String): List<Int> = withContext(Dispatchers.IO) {
        val out = mutableListOf<Int>()
        val c = readDb.rawQuery("SELECT seq FROM chunks WHERE fileId=?", arrayOf(fileId))
        c.use { while (it.moveToNext()) out.add(it.getInt(0)) }
        out
    }

    suspend fun putChunk(fileId: String, seq: Int, data: ByteArray) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "INSERT OR REPLACE INTO chunks (id, fileId, seq, data) VALUES (?,?,?,?)",
            arrayOf("$fileId:$seq", fileId, seq, data),
        )
    }

    suspend fun deleteChunk(fileId: String, seq: Int) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM chunks WHERE id=?", arrayOf("$fileId:$seq"))
    }

    suspend fun deleteChunksForFile(fileId: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM chunks WHERE fileId=?", arrayOf(fileId))
    }

    // ---- outbox ----

    data class OutboxRow(
        val id: String,
        val roomId: String,
        val kind: String,
        val envelope: ByteArray,
        val createdAt: Long,
    )

    suspend fun enqueueOutbox(roomId: String, kind: String, id: String, envelope: ByteArray) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "INSERT OR REPLACE INTO outbox (id, roomId, kind, envelope, createdAt, attempts) VALUES (?,?,?,?,?,?)",
            arrayOf(id, roomId, kind, envelope, System.currentTimeMillis(), 0),
        )
    }

    suspend fun getOutbox(roomId: String): List<OutboxRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<OutboxRow>()
        val c = readDb.rawQuery(
            "SELECT * FROM outbox WHERE roomId=? ORDER BY createdAt ASC",
            arrayOf(roomId),
        )
        c.use {
            while (it.moveToNext()) {
                out.add(
                    OutboxRow(
                        id = it.getString(it.getColumnIndexOrThrow("id")),
                        roomId = it.getString(it.getColumnIndexOrThrow("roomId")),
                        kind = it.getString(it.getColumnIndexOrThrow("kind")),
                        envelope = it.getBlob(it.getColumnIndexOrThrow("envelope")),
                        createdAt = it.getLong(it.getColumnIndexOrThrow("createdAt")),
                    ),
                )
            }
        }
        out
    }

    suspend fun removeFromOutbox(id: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM outbox WHERE id=?", arrayOf(id))
    }

    suspend fun clearOutbox(roomId: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM outbox WHERE roomId=?", arrayOf(roomId))
    }

    // ---- reactions ----

    suspend fun getReactions(roomId: String): List<ReactionRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<ReactionRow>()
        val c = readDb.rawQuery("SELECT * FROM reactions WHERE roomId=?", arrayOf(roomId))
        c.use { while (it.moveToNext()) out.add(it.toReaction()) }
        out
    }

    suspend fun getReactionsForMessage(messageId: String): List<ReactionRow> = withContext(Dispatchers.IO) {
        val out = mutableListOf<ReactionRow>()
        val c = readDb.rawQuery("SELECT * FROM reactions WHERE messageId=?", arrayOf(messageId))
        c.use { while (it.moveToNext()) out.add(it.toReaction()) }
        out
    }

    suspend fun setReactionRoomId(messageId: String, roomId: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE reactions SET roomId=? WHERE messageId=?",
            arrayOf(roomId, messageId),
        )
    }

    /** Toggles the local user's own reaction (web applyReactionLocal). */
    suspend fun applyReactionLocal(messageId: String, emoji: String, add: Boolean) = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery(
            "SELECT * FROM reactions WHERE messageId=? AND emoji=?",
            arrayOf(messageId, emoji),
        )
        val existing = c.use { if (it.moveToFirst()) it.toReaction() else null }
        if (existing != null && existing.mine && !add) {
            // toggling own reaction off
            val newCount = existing.count - 1
            if (newCount <= 0) {
                writeDb.execSQL("DELETE FROM reactions WHERE id=?", arrayOf(existing.id))
            } else {
                writeDb.execSQL(
                    "UPDATE reactions SET count=?, mine=0 WHERE id=?",
                    arrayOf(newCount, existing.id),
                )
            }
        } else if (existing != null) {
            writeDb.execSQL(
                "UPDATE reactions SET count=?, mine=? WHERE id=?",
                arrayOf(existing.count + (if (add) 1 else 0), if (add) 1 else 0, existing.id),
            )
        } else if (add) {
            writeDb.execSQL(
                "INSERT INTO reactions (id, roomId, messageId, emoji, count, mine) VALUES (?,?,?,?,?,?)",
                arrayOf(newId("r"), "", messageId, emoji, 1, 1),
            )
        }
    }

    /** Applies a peer's reaction add/remove (web applyReactionRemote). */
    suspend fun applyReactionRemote(messageId: String, emoji: String, add: Boolean) = withContext(Dispatchers.IO) {
        val c = readDb.rawQuery(
            "SELECT * FROM reactions WHERE messageId=? AND emoji=?",
            arrayOf(messageId, emoji),
        )
        val existing = c.use { if (it.moveToFirst()) it.toReaction() else null }
        if (add) {
            if (existing != null) {
                writeDb.execSQL(
                    "UPDATE reactions SET count=? WHERE id=?",
                    arrayOf(existing.count + 1, existing.id),
                )
            } else {
                writeDb.execSQL(
                    "INSERT INTO reactions (id, roomId, messageId, emoji, count, mine) VALUES (?,?,?,?,?,?)",
                    arrayOf(newId("r"), "", messageId, emoji, 1, 0),
                )
            }
        } else if (existing != null) {
            val newCount = existing.count - 1
            if (newCount <= 0) {
                writeDb.execSQL("DELETE FROM reactions WHERE id=?", arrayOf(existing.id))
            } else {
                writeDb.execSQL(
                    "UPDATE reactions SET count=? WHERE id=?",
                    arrayOf(newCount, existing.id),
                )
            }
        }
    }

    suspend fun applyEdit(messageId: String, text: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE messages SET text=?, edited=1, ts=? WHERE id=?",
            arrayOf(text, ts, messageId),
        )
    }

    suspend fun applyTombstone(messageId: String, ts: Long) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "UPDATE messages SET deleted=1, text=NULL, ts=? WHERE id=?",
            arrayOf(ts, messageId),
        )
    }

    suspend fun putReaction(r: ReactionRow) = withContext(Dispatchers.IO) {
        writeDb.execSQL(
            "INSERT OR REPLACE INTO reactions (id, roomId, messageId, emoji, count, mine) VALUES (?,?,?,?,?,?)",
            arrayOf(r.id, r.roomId, r.messageId, r.emoji, r.count, if (r.mine) 1 else 0),
        )
    }

    suspend fun deleteReaction(id: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM reactions WHERE id=?", arrayOf(id))
    }

    suspend fun deleteReactionsForMessage(messageId: String) = withContext(Dispatchers.IO) {
        writeDb.execSQL("DELETE FROM reactions WHERE messageId=?", arrayOf(messageId))
    }

    // ---- row mappers ----

    private fun android.database.Cursor.toRoom(): RoomRow = RoomRow(
        id = getString(getColumnIndexOrThrow("id")),
        code = getString(getColumnIndexOrThrow("code")),
        mode = getString(getColumnIndexOrThrow("mode")),
        peerUserId = getStringOrNull("peerUserId"),
        peerName = getStringOrNull("peerName"),
        peerPublicKey = getStringOrNull("peerPublicKey"),
        safetyCode = getStringOrNull("safetyCode"),
        createdAt = getLongOrZero("createdAt"),
        lastActivity = getLongOrZero("lastActivity"),
        sessionId = getStringOrNull("sessionId"),
        unreadCount = getIntOrZero("unreadCount"),
    )

    private fun android.database.Cursor.toMessage(): MessageRow = MessageRow(
        id = getString(getColumnIndexOrThrow("id")),
        roomId = getString(getColumnIndexOrThrow("roomId")),
        isMine = getInt(getColumnIndexOrThrow("isMine")) == 1,
        kind = getString(getColumnIndexOrThrow("kind")),
        ts = getLongOrZero("ts"),
        status = getStringOrNull("status"),
        text = getStringOrNull("text"),
        fileId = getStringOrNull("fileId"),
        replyTo = getStringOrNull("replyTo"),
        edited = getIntOrZero("edited") == 1,
        deleted = getIntOrZero("deleted") == 1,
        voice = getIntOrZero("voice") == 1,
        forwarded = getIntOrZero("forwarded") == 1,
        sentAt = getLongOrNull("sentAt"),
        deliveredAt = getLongOrNull("deliveredAt"),
        readAt = getLongOrNull("readAt"),
    )

    private fun android.database.Cursor.toFile(): FileRow = FileRow(
        id = getString(getColumnIndexOrThrow("id")),
        roomId = getString(getColumnIndexOrThrow("roomId")),
        name = getString(getColumnIndexOrThrow("name")),
        mime = getString(getColumnIndexOrThrow("mime")),
        size = getLongOrZero("size"),
        sha256 = getString(getColumnIndexOrThrow("sha256")),
        chunkSize = getIntOrZero("chunkSize"),
        totalChunks = getIntOrZero("totalChunks"),
        direction = getString(getColumnIndexOrThrow("direction")),
        status = getString(getColumnIndexOrThrow("status")),
        progress = getFloat(getColumnIndexOrThrow("progress")),
        receivedChunks = getIntOrZero("receivedChunks"),
        lastSentChunk = getIntOrZero("lastSentChunk"),
        receivedRanges = getStringOrNull("receivedRanges")
            ?.split(";")
            ?.filter { it.contains("-") }
            ?.mapNotNull {
                val parts = it.split("-")
                if (parts.size == 2) parts[0].toIntOrNull() to parts[1].toIntOrNull()
                else null
            }
            ?.filter { it.first != null && it.second != null }
            ?.map { it.first!! to it.second!! }
            ?: emptyList(),
        path = getStringOrNull("path"),
        sourcePath = getStringOrNull("sourcePath"),
        preview = getStringOrNull("preview"),
        uploaded = getIntOrZero("uploaded") == 1,
    )

    private fun android.database.Cursor.toReaction(): ReactionRow = ReactionRow(
        id = getString(getColumnIndexOrThrow("id")),
        roomId = getString(getColumnIndexOrThrow("roomId")),
        messageId = getString(getColumnIndexOrThrow("messageId")),
        emoji = getString(getColumnIndexOrThrow("emoji")),
        count = getIntOrZero("count"),
        mine = getIntOrZero("mine") == 1,
    )
}
