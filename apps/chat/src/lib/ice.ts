import { DEFAULT_ICE_SERVERS } from "@ghost/webrtc";

/**
 * ICE server configuration for P2P connections.
 *
 * Always includes the multi-STUN list (direct P2P). TURN is optional and only
 * kicks in when env vars are set, giving a relay fallback for symmetric NATs:
 *
 *   NEXT_PUBLIC_TURN_URLS=        comma-separated, e.g. turn:turn.example.com:3478?transport=udp
 *   NEXT_PUBLIC_TURN_USERNAME=
 *   NEXT_PUBLIC_TURN_CREDENTIAL=
 *
 * When TURN is unset the session runs STUN-only (no middle device relays
 * message/file traffic).
 */
export function getIceServers(): RTCIceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  if (urls.length === 0) return DEFAULT_ICE_SERVERS;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  return [
    ...DEFAULT_ICE_SERVERS,
    {
      urls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    },
  ];
}
