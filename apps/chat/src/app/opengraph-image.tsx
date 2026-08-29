import { ImageResponse } from "next/og";

export const alt = "GhostChat - End-to-end encrypted messaging and file sharing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 20%, #1a1b1f 0%, #121315 70%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
            borderRadius: 40,
            background: "rgba(37, 211, 102, 0.12)",
            fontSize: 96,
            marginBottom: 32,
          }}
        >
          👻
        </div>
        <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -1 }}>
          GhostChat
        </div>
        <div
          style={{
            fontSize: 32,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: 20,
            maxWidth: 760,
          }}
        >
          End-to-end encrypted messaging &amp; file sharing
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#25d366",
            marginTop: 36,
            fontWeight: 600,
          }}
        >
          chat.dikshantyadav.in
        </div>
      </div>
    ),
    size,
  );
}