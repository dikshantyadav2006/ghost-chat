import type { Metadata } from "next";
import SiteShell from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Features",
  description:
    "All GhostChat features: end-to-end encrypted messaging, peer-to-peer file sharing, voice notes, voice calls and video calls — with no permanent server-side storage.",
  alternates: { canonical: "/features" },
  robots: { index: true, follow: true },
};

const sections = [
  {
    emoji: "🔐",
    title: "End-to-End Encryption",
    body: [
      "Every message is encrypted on your device before it leaves. Only you and your chat partner hold the keys needed to read the conversation.",
      "Keys are generated in your browser and stored only on your device — the server never has access to them.",
    ],
  },
  {
    emoji: "🌫️",
    title: "No Permanent Server Storage",
    body: [
      "Conversations are delivered peer to peer. The signaling server only helps the two devices find each other, then gets out of the way.",
      "Messages are not written to any server database, so there is nothing to breach, subpoena or mine.",
    ],
  },
  {
    emoji: "📁",
    title: "File Sharing",
    body: [
      "Send photos, videos and documents of any size directly between devices. Files stream in encrypted chunks over the peer-to-peer connection.",
      "Transfers can be paused and resumed, and large files start playing before the download finishes.",
    ],
  },
  {
    emoji: "🎙️",
    title: "Voice Notes",
    body: [
      "Record and send voice messages that travel end to end just like text — encrypted and delivered directly between devices.",
    ],
  },
  {
    emoji: "📞",
    title: "Voice & Video Calls",
    body: [
      "Make private voice and video calls over a direct WebRTC connection. Your call audio and video never pass through a server.",
      "See call status, mute your mic, toggle your camera and hang up whenever you like.",
    ],
  },
  {
    emoji: "👤",
    title: "No Account Required",
    body: [
      "There is no sign-up, no phone number and no email. Your identity is created locally in your browser in a few seconds.",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <SiteShell>
      <h1 className="text-3xl font-extrabold sm:text-4xl">GhostChat features</h1>
      <p className="mt-4 text-soft">
        Everything in GhostChat is built around one idea: private, direct
        communication with no permanent server-side storage.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {sections.map((s) => (
          <section
            key={s.title}
            className="rounded-2xl border border-line bg-surface p-6"
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-mint/10 text-2xl">
              <span aria-hidden>{s.emoji}</span>
            </div>
            <h2 className="text-lg font-bold">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-soft">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <div className="mt-12 text-center">
        <a
          href="/start"
          className="inline-block rounded-lg bg-mint px-6 py-3 font-semibold text-white transition hover:bg-mint/90"
        >
          Try GhostChat
        </a>
      </div>
    </SiteShell>
  );
}