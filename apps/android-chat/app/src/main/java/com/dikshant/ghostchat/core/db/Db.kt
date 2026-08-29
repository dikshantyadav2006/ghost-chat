package com.dikshant.ghostchat.core.db

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Raw SQLite mirror of @ghost/storage's Dexie schema (identity/rooms/messages/
 * files/chunks/outbox/reactions). Deliberately avoids Room/KSP so the build
 * stays simple; all access goes through GhostDb/Repository.
 */
class GhostDb(context: Context) : SQLiteOpenHelper(context, "ghostchat.db", null, VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS identity (
                id TEXT PRIMARY KEY,
                userId TEXT, name TEXT,
                publicKey TEXT, privateKey TEXT,
                avatar_emoji TEXT, avatar_color TEXT, avatar_photo TEXT,
                createdAt INTEGER,
                lastActiveRoomId TEXT
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                code TEXT, mode TEXT,
                peerUserId TEXT, peerName TEXT, peerPublicKey TEXT,
                safetyCode TEXT,
                createdAt INTEGER, lastActivity INTEGER,
                sessionId TEXT,
                unreadCount INTEGER DEFAULT 0
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                roomId TEXT, isMine INTEGER, kind TEXT, ts INTEGER,
                status TEXT, text TEXT, fileId TEXT, replyTo TEXT,
                edited INTEGER, deleted INTEGER, voice INTEGER, forwarded INTEGER,
                sentAt INTEGER, deliveredAt INTEGER, readAt INTEGER
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                roomId TEXT, name TEXT, mime TEXT, size INTEGER, sha256 TEXT,
                chunkSize INTEGER, totalChunks INTEGER,
                direction TEXT, status TEXT, progress REAL,
                receivedChunks INTEGER, lastSentChunk INTEGER,
                receivedRanges TEXT, path TEXT, sourcePath TEXT, preview TEXT,
                uploaded INTEGER DEFAULT 0
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                fileId TEXT, seq INTEGER, data BLOB
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS outbox (
                id TEXT PRIMARY KEY,
                roomId TEXT, kind TEXT, envelope BLOB, createdAt INTEGER, attempts INTEGER
            )"""
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS reactions (
                id TEXT PRIMARY KEY,
                roomId TEXT, messageId TEXT, emoji TEXT, count INTEGER, mine INTEGER
            )"""
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(roomId, ts)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_files_room ON files(roomId)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(fileId)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(messageId)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_outbox_room ON outbox(roomId)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // no migrations yet
    }

    companion object {
        const val VERSION = 1
    }
}

fun Cursor.getStringOrNull(col: String): String? {
    val idx = getColumnIndex(col)
    return if (idx >= 0 && !isNull(idx)) getString(idx) else null
}

fun Cursor.getLongOrNull(col: String): Long? {
    val idx = getColumnIndex(col)
    return if (idx >= 0 && !isNull(idx)) getLong(idx) else null
}

fun Cursor.getIntOrZero(col: String): Int {
    val idx = getColumnIndex(col)
    return if (idx >= 0 && !isNull(idx)) getInt(idx) else 0
}

fun Cursor.getLongOrZero(col: String): Long {
    val idx = getColumnIndex(col)
    return if (idx >= 0 && !isNull(idx)) getLong(idx) else 0
}
