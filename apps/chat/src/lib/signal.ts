"use client";

import { io, type Socket } from "socket.io-client";
import { SIGNAL_EVENTS, type Identity, type SignalClientEvents, type SignalServerEvents } from "@ghost/protocol";
import { useApp } from "./store";

export const SIGNAL_URL = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:4000";

let socket: Socket<SignalServerEvents, SignalClientEvents> | null = null;

export function getSocket(): Socket<SignalServerEvents, SignalClientEvents> {
  if (!socket) {
    socket = io(SIGNAL_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => useApp.getState().setSignalOnline(true));
    socket.on("disconnect", () => useApp.getState().setSignalOnline(false));
  }
  return socket;
}

export function emitIdentity(identity: Identity): void {
  getSocket().emit(SIGNAL_EVENTS.client.identity, identity);
}

export function emitPeerSync(roomId: string): void {
  getSocket().emit(SIGNAL_EVENTS.client.peerSync, { roomId });
}
