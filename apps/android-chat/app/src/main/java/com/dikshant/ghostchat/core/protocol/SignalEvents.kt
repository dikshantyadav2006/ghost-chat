package com.dikshant.ghostchat.core.protocol

/** Socket.IO event names, matching apps/chat-api/src/hub.ts and apps/chat/src/lib/signal.ts. */
object SignalEvents {
    // client -> server
    const val CLIENT_IDENTITY = "identity"
    const val CLIENT_ROOM_CREATE = "room:create"
    const val CLIENT_ROOM_JOIN = "room:join"
    const val CLIENT_PEER_SYNC = "peer:sync"
    const val CLIENT_SIGNAL = "signal"
    const val CLIENT_SIGNAL_ACK = "signal:ack"

    // server -> client
    const val SERVER_CONNECT = "connect"
    const val SERVER_DISCONNECT = "disconnect"
    const val SERVER_ROOM_ERROR = "room:error"
    const val SERVER_ROOM_STATE = "room:state"
    const val SERVER_PEER_JOINED = "peer:joined"
    const val SERVER_PEER_SESSION_CHANGED = "peer:session-changed"
    const val SERVER_PEER_LEFT = "peer:left"
    const val SERVER_SIGNAL = "signal"
    const val SERVER_SIGNAL_ACK = "signal:ack"
}

/** Direction of a session, matching session.ts. */
object RoomModes {
    const val OWNER = "owner"
    const val JOINER = "joiner"
}
