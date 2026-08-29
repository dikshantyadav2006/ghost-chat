package com.dikshant.ghostchat.core.protocol

import org.json.JSONArray
import org.json.JSONObject

/**
 * Hand-rolled JSON codecs for the GhostChat wire messages. Key names and
 * nesting must match @ghost/protocol exactly — the web client and Android
 * client interop over these exact JSON shapes.
 */
object JsonCodec {

    // ---- Identity ----

    fun identityToJson(id: Identity): JSONObject =
        JSONObject()
            .put("userId", id.userId)
            .put("name", id.name)
            .put("publicKey", id.publicKey)

    fun identityFromJson(o: JSONObject): Identity =
        Identity(
            userId = o.getString("userId"),
            name = o.getString("name"),
            publicKey = o.getString("publicKey"),
        )

    // ---- FileMeta ----

    fun fileMetaToJson(f: FileMeta): JSONObject =
        JSONObject()
            .put("id", f.id)
            .put("name", f.name)
            .put("mime", f.mime)
            .put("size", f.size)
            .put("sha256", f.sha256)
            .put("chunkSize", f.chunkSize)
            .put("totalChunks", f.totalChunks)

    fun fileMetaFromJson(o: JSONObject): FileMeta =
        FileMeta(
            id = o.getString("id"),
            name = o.getString("name"),
            mime = o.getString("mime"),
            size = o.optLong("size", 0),
            sha256 = o.getString("sha256"),
            chunkSize = o.optInt("chunkSize", 0),
            totalChunks = o.optInt("totalChunks", 0),
        )

    // ---- ChatMessage ----

    fun chatToJson(m: ChatMessage): JSONObject {
        val o = JSONObject()
            .put("id", m.id)
            .put("kind", m.kind)
            .put("ts", m.ts)
        m.text?.let { o.put("text", it) }
        m.file?.let { o.put("file", fileMetaToJson(it)) }
        m.replyTo?.let { o.put("replyTo", it) }
        m.edited?.let { o.put("edited", it) }
        m.deleted?.let { o.put("deleted", it) }
        m.voice?.let { o.put("voice", it) }
        m.forwarded?.let { o.put("forwarded", it) }
        return o
    }

    fun chatFromJson(o: JSONObject): ChatMessage =
        ChatMessage(
            id = o.getString("id"),
            kind = o.optString("kind", MESSAGE_KIND_TEXT),
            ts = o.optLong("ts", 0),
            text = o.optStringOrNull("text"),
            file = o.optJSONObject("file")?.let { fileMetaFromJson(it) },
            replyTo = o.optStringOrNull("replyTo"),
            edited = o.optBooleanOrNull("edited"),
            deleted = o.optBooleanOrNull("deleted"),
            voice = o.optBooleanOrNull("voice"),
            forwarded = o.optBooleanOrNull("forwarded"),
        )

    // ---- ChannelMessage ----

    fun encodeChannel(msg: ChannelMessage): String = channelToJson(msg).toString()

    fun channelToJson(msg: ChannelMessage): JSONObject = when (msg) {
        is ChannelMessage.Hello ->
            JSONObject().put("kind", "hello").put("identity", identityToJson(msg.identity))
        is ChannelMessage.Message ->
            JSONObject().put("kind", "message").put("message", chatToJson(msg.message))
        is ChannelMessage.Cipher ->
            JSONObject().put("kind", "cipher")
                .put("payload", JSONObject().put("iv", msg.payload.iv).put("data", msg.payload.data))
        is ChannelMessage.Ack -> {
            val o = JSONObject()
                .put("kind", "ack")
                .put("messageId", msg.messageId)
                .put("status", msg.status)
            msg.ts?.let { o.put("ts", it) }
            o
        }
        is ChannelMessage.Typing ->
            JSONObject().put("kind", "typing").put("active", msg.active)
        is ChannelMessage.Edit ->
            JSONObject().put("kind", "edit")
                .put("messageId", msg.messageId)
                .put("text", msg.text)
                .put("ts", msg.ts)
        is ChannelMessage.Delete ->
            JSONObject().put("kind", "delete")
                .put("messageId", msg.messageId)
                .put("ts", msg.ts)
        is ChannelMessage.FileResume ->
            JSONObject().put("kind", "file:resume")
                .put("fileId", msg.fileId)
                .put("totalChunks", msg.totalChunks)
                .put("receivedRanges", rangesToJson(msg.receivedRanges))
        is ChannelMessage.FilePause ->
            JSONObject().put("kind", "file:pause").put("fileId", msg.fileId)
        is ChannelMessage.FileSent ->
            JSONObject().put("kind", "file:sent").put("fileId", msg.fileId)
        is ChannelMessage.FileReady ->
            JSONObject().put("kind", "file:ready").put("fileId", msg.fileId)
        is ChannelMessage.FileAck ->
            JSONObject().put("kind", "file:ack")
                .put("fileId", msg.fileId)
                .put("receivedChunks", msg.receivedChunks)
        is ChannelMessage.FileDelivered ->
            JSONObject().put("kind", "file:delivered").put("fileId", msg.fileId)
        is ChannelMessage.Reaction ->
            JSONObject().put("kind", "reaction")
                .put("messageId", msg.messageId)
                .put("emoji", msg.emoji)
                .put("add", msg.add)
        is ChannelMessage.Call ->
            JSONObject().put("kind", "call")
                .put("phase", msg.phase)
                .put("callId", msg.callId)
                .put("video", msg.video)
    }

    fun decodeChannel(json: String): ChannelMessage? = try {
        channelFromJson(JSONObject(json))
    } catch (e: Exception) {
        null
    }

    fun channelFromJson(o: JSONObject): ChannelMessage {
        val kind = o.optString("kind")
        return when (kind) {
            "hello" -> ChannelMessage.Hello(identityFromJson(o.getJSONObject("identity")))
            "message" -> ChannelMessage.Message(chatFromJson(o.getJSONObject("message")))
            "cipher" -> {
                val p = o.getJSONObject("payload")
                ChannelMessage.Cipher(EncryptedPayload(p.getString("iv"), p.getString("data")))
            }
            "ack" -> ChannelMessage.Ack(
                messageId = o.getString("messageId"),
                status = o.getString("status"),
                ts = o.optLongOrNull("ts"),
            )
            "typing" -> ChannelMessage.Typing(o.optBoolean("active", false))
            "edit" -> ChannelMessage.Edit(
                messageId = o.getString("messageId"),
                text = o.optString("text", ""),
                ts = o.optLong("ts", 0),
            )
            "delete" -> ChannelMessage.Delete(
                messageId = o.getString("messageId"),
                ts = o.optLong("ts", 0),
            )
            "file:resume" -> ChannelMessage.FileResume(
                fileId = o.getString("fileId"),
                totalChunks = o.optInt("totalChunks", 0),
                receivedRanges = rangesFromJson(o.optJSONArray("receivedRanges")),
            )
            "file:pause" -> ChannelMessage.FilePause(o.getString("fileId"))
            "file:sent" -> ChannelMessage.FileSent(o.getString("fileId"))
            "file:ready" -> ChannelMessage.FileReady(o.getString("fileId"))
            "file:ack" -> ChannelMessage.FileAck(
                fileId = o.getString("fileId"),
                receivedChunks = o.optInt("receivedChunks", 0),
            )
            "file:delivered" -> ChannelMessage.FileDelivered(o.getString("fileId"))
            "reaction" -> ChannelMessage.Reaction(
                messageId = o.getString("messageId"),
                emoji = o.getString("emoji"),
                add = o.optBoolean("add", true),
            )
            "call" -> ChannelMessage.Call(
                phase = o.getString("phase"),
                callId = o.getString("callId"),
                video = o.optBoolean("video", false),
            )
            else -> throw IllegalArgumentException("unknown channel kind: $kind")
        }
    }

    // ---- ranges ----

    private fun rangesToJson(ranges: List<ChunkRange>): JSONArray {
        val a = JSONArray()
        for ((s, e) in ranges) a.put(JSONArray().put(s).put(e))
        return a
    }

    private fun rangesFromJson(a: JSONArray?): List<ChunkRange> {
        if (a == null) return emptyList()
        val out = mutableListOf<ChunkRange>()
        for (i in 0 until a.length()) {
            val p = a.optJSONArray(i) ?: continue
            if (p.length() < 2) continue
            out.add(p.optInt(0) to p.optInt(1))
        }
        return out
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key) else null

    private fun JSONObject.optLongOrNull(key: String): Long? =
        if (has(key) && !isNull(key)) optLong(key) else null

    private fun JSONObject.optBooleanOrNull(key: String): Boolean? =
        if (has(key) && !isNull(key)) optBoolean(key) else null
}
