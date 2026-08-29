"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "@/lib/store";
import { getSession } from "@/lib/session";
import { repo } from "@/lib/identity";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import Avatar from "./Avatar";

export default function CallModal() {
  const call = useApp((s) => s.call);
  const room = useLiveQuery(
    () => (call?.roomId ? repo.getRoomById(call.roomId) : Promise.resolve(undefined)),
    [call?.roomId],
  );
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (call?.phase !== "active") {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [call?.phase]);

  if (!call) return null;

  const session = getSession(call.roomId);
  const roomName = room?.peerName ?? "Peer";
  const outgoing = call.direction === "outgoing";
  const showVideo =
    call.phase === "active" && call.video && (call.localStream || call.remoteStream);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const status =
    call.phase === "ringing" ? (outgoing ? "Calling…" : "Incoming call…") : `${mm}:${ss}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink">
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        {showVideo && call.remoteStream ? (
          <video
            ref={(el) => {
              if (el && el.srcObject !== call.remoteStream) el.srcObject = call.remoteStream;
            }}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Avatar emoji="👻" color="#005c4b" size="lg" />
            <p className="text-xl font-semibold text-ghost">{roomName}</p>
          </div>
        )}
        <p className="mt-4 text-sm text-soft">{status}</p>

        {call.localStream && (
          <video
            ref={(el) => {
              if (el && el.srcObject !== call.localStream) el.srcObject = call.localStream;
            }}
            autoPlay
            playsInline
            muted
            className={`absolute rounded-xl bg-black shadow-2xl ${
              showVideo ? "right-3 top-3 h-40 w-28 object-cover" : "h-0 w-0"
            }`}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-6 pb-10 pt-4">
        {call.phase === "ringing" && !outgoing && (
          <button
            type="button"
            onClick={() => void session?.acceptCall()}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-mint text-2xl text-white transition hover:bg-mint/90"
            aria-label="Accept call"
          >
            <Phone className="h-6 w-6" />
          </button>
        )}
        {call.phase === "active" && (
          <>
            <button
              type="button"
              onClick={() => {
                session?.toggleMute();
                setMuted((v) => !v);
              }}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition ${
                muted
                  ? "bg-white/5 text-ghost"
                  : "bg-raised text-soft hover:bg-white/5"
              }`}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            {call.video && (
              <button
                type="button"
                onClick={() => {
                  session?.toggleVideo();
                  setCameraOn((v) => !v);
                }}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition ${
                  cameraOn
                    ? "bg-raised text-soft hover:bg-white/5"
                    : "bg-red-600/20 text-red-400"
                }`}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
              >
                {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => void session?.endCall()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-2xl text-white transition hover:bg-red-500"
          aria-label="End call"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
