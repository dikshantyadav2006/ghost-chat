import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GhostChat",
    short_name: "GhostChat",
    description: "End-to-end encrypted messages, peer to peer. Nothing is stored.",
    start_url: "/start",
    display: "standalone",
    background_color: "#121315",
    theme_color: "#121315",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
