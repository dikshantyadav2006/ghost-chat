package com.dikshant.ghostchat.core.protocol

/** Signaling wire types, matching @ghost/protocol's signal.ts shapes. */
data class IceCandidateData(
    val candidate: String,
    val sdpMid: String?,
    val sdpMLineIndex: Int?,
    val usernameFragment: String?,
)

data class OfferPayload(
    val type: String,
    val sdp: String,
    val ephemeralPub: String?,
    val signalId: String,
    val connectionId: String?,
)

data class AnswerPayload(
    val type: String,
    val sdp: String,
    val ephemeralPub: String?,
    val signalId: String,
    val connectionId: String?,
)

data class IcePayload(
    val type: String,
    val candidate: IceCandidateData,
    val signalId: String,
    val connectionId: String?,
)

sealed class SignalData {
    abstract val signalId: String
    abstract val connectionId: String?

    data class Offer(
        override val signalId: String,
        val sdp: String,
        val ephemeralPub: String,
        override val connectionId: String?,
    ) : SignalData()

    data class Answer(
        override val signalId: String,
        val sdp: String,
        val ephemeralPub: String,
        override val connectionId: String?,
    ) : SignalData()

    data class Ice(
        override val signalId: String,
        val candidate: IceCandidateData,
        override val connectionId: String?,
    ) : SignalData()
}

typealias PeerRole = String

const val ROLE_OFFERER = "offerer"
const val ROLE_ANSWERER = "answerer"

typealias SignalAckStage = String

data class PeerPresence(
    val userId: String,
    val name: String,
    val publicKey: String,
    val sessionId: String,
)

object SignalJson {

    fun signalToJson(signal: SignalData): org.json.JSONObject {
        val o = org.json.JSONObject()
            .put("signalId", signal.signalId)
            .put("connectionId", signal.connectionId ?: "")
        when (signal) {
            is SignalData.Offer -> o.put("type", "offer").put("sdp", signal.sdp).put("ephemeralPub", signal.ephemeralPub)
            is SignalData.Answer -> o.put("type", "answer").put("sdp", signal.sdp).put("ephemeralPub", signal.ephemeralPub)
            is SignalData.Ice -> o.put("type", "ice").put(
                "candidate",
                org.json.JSONObject()
                    .put("candidate", signal.candidate.candidate)
                    .put("sdpMid", signal.candidate.sdpMid ?: org.json.JSONObject.NULL)
                    .put("sdpMLineIndex", signal.candidate.sdpMLineIndex ?: org.json.JSONObject.NULL)
                    .put("usernameFragment", signal.candidate.usernameFragment ?: org.json.JSONObject.NULL),
            )
        }
        return o
    }

    fun signalFromJson(o: org.json.JSONObject): SignalData? {
        val type = o.optString("type")
        val signalId = o.optString("signalId")
        if (signalId.isEmpty()) return null
        val conn = o.optString("connectionId").ifEmpty { null }
        return when (type) {
            "offer" -> SignalData.Offer(signalId, o.optString("sdp", ""), o.optString("ephemeralPub", ""), conn)
            "answer" -> SignalData.Answer(signalId, o.optString("sdp", ""), o.optString("ephemeralPub", ""), conn)
            "ice" -> {
                val c = o.optJSONObject("candidate") ?: return null
                SignalData.Ice(
                    signalId,
                    IceCandidateData(
                        candidate = c.optString("candidate", ""),
                        sdpMid = c.optStringOrNull("sdpMid"),
                        sdpMLineIndex = if (c.has("sdpMLineIndex") && !c.isNull("sdpMLineIndex")) c.optInt("sdpMLineIndex") else null,
                        usernameFragment = c.optStringOrNull("usernameFragment"),
                    ),
                    conn,
                )
            }
            else -> null
        }
    }

    fun computePairConnectionId(mySessionId: String, peerSessionId: String): String =
        "conn-" + listOf(mySessionId, peerSessionId).sorted().joinToString(":")

    private fun org.json.JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key) else null
}
