import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GhostChat - End-to-End Encrypted Messaging & File Sharing",
  description:
    "End-to-end encrypted messaging, file sharing, voice notes, voice calls and video calls. No permanent server-side message storage.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GhostChat",
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web",
  url: "https://chat.dikshantyadav.in",
  description:
    "End-to-end encrypted messaging, file sharing, voice notes, voice calls and video calls. No permanent server-side message storage.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "End-to-end encrypted messaging",
    "Peer-to-peer file sharing",
    "Voice notes",
    "Voice calls",
    "Video calls",
    "No permanent server-side message storage",
  ],
};

const features = [
  {
    emoji: "🔐",
    title: "End-to-End Encryption",
    description:
      "Messages are encrypted on your device and can only be read by the person you are talking to. Keys are generated in your browser and never leave your device.",
  },
  {
    emoji: "🌫️",
    title: "No Permanent Server Storage",
    description:
      "Conversations travel directly between devices (peer to peer). The server only helps the two peers find each other — it never stores your messages.",
  },
  {
    emoji: "📁",
    title: "File Sharing",
    description:
      "Send photos, videos and documents straight between devices. Large files stream peer to peer without being uploaded to a central server.",
  },
  {
    emoji: "📞",
    title: "Voice & Video Calls",
    description:
      "Make private voice and video calls over a direct connection. No call recordings, no servers in the middle, no stored call history.",
  },
];

const faqs = [
  {
    q: "Is my conversation really private?",
    a: "Yes. GhostChat is end-to-end encrypted and peer to peer. Messages are encrypted on your device, and only your chat partner holds the keys to read them. The server never sees plaintext and does not store messages.",
  },
  {
    q: "Does GhostChat store my messages on a server?",
    a: "No. There is no permanent server-side message storage. Conversations are delivered directly between devices, so once a conversation ends there is nothing left on any server.",
  },
  {
    q: "Do I need an account?",
    a: "No account or phone number is needed. Your identity is created locally in your browser and stored only on this device.",
  },
  {
    q: "How do I start a chat?",
    a: "Open the app and choose your name and avatar. Create a room, share the room code with your partner, and start chatting — all in seconds.",
  },
];

export default function LandingPage() {
  return (
    <main className="h-full overflow-y-auto overflow-x-hidden bg-ink text-ghost">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="sticky top-0 z-10 border-b border-line bg-ink/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint/15 text-lg">
              👻
            </span>
            <span>GhostChat</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-soft">
            <Link href="/features" className="hover:text-ghost">
              Features
            </Link>
            <Link href="/privacy" className="hover:text-ghost">
              Privacy
            </Link>
            <Link href="/about" className="hover:text-ghost">
              About
            </Link>
            <Link
              href="/start"
              className="rounded-lg bg-mint px-4 py-2 font-semibold text-white transition hover:bg-mint/90"
            >
              Open chat
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-24 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-mint/10 text-6xl">
          <span aria-hidden>👻</span>
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Private messaging that leaves{" "}
          <span className="text-mint">no trace</span> on any server
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-soft">
          GhostChat is an end-to-end encrypted, peer-to-peer chat app for
          messaging, file sharing, voice notes, voice calls and video calls.
          Nothing is stored on any server.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/start"
            className="rounded-lg bg-mint px-6 py-3 font-semibold text-white transition hover:bg-mint/90"
          >
            Start chatting — it&apos;s free
          </Link>
          <Link
            href="#features"
            className="rounded-lg border border-line bg-surface px-6 py-3 font-semibold text-ghost transition hover:bg-raised"
          >
            Explore features
          </Link>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl scroll-mt-20 px-6 pb-20">
        <h2 className="text-center text-3xl font-bold">Why GhostChat</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-line bg-surface p-6 transition hover:border-mint/40"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-mint/10 text-2xl">
                <span aria-hidden>{f.emoji}</span>
              </div>
              <h3 className="text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-soft">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="rounded-2xl border border-line bg-surface p-8 sm:p-10">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            <li>
              <p className="text-sm font-bold text-mint">1 · Pick your identity</p>
              <p className="mt-2 text-sm leading-relaxed text-soft">
                Choose a name and avatar. Your identity keys are generated in
                your browser and stored only on this device.
              </p>
            </li>
            <li>
              <p className="text-sm font-bold text-mint">2 · Create a room</p>
              <p className="mt-2 text-sm leading-relaxed text-soft">
                Open the app and create a chat room. Share the room code with
                your chat partner.
              </p>
            </li>
            <li>
              <p className="text-sm font-bold text-mint">3 · Connect peer to peer</p>
              <p className="mt-2 text-sm leading-relaxed text-soft">
                Devices connect directly. Messages, files and calls travel
                between you — never through a message-storing server.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="text-center text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-line bg-surface"
            >
              <summary className="cursor-pointer list-none px-6 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                <span className="mr-2 text-mint transition group-open:rotate-45 inline-block">
                  +
                </span>
                {f.q}
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <footer className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-mint/15 text-sm">
              👻
            </span>
            <span className="font-semibold text-ghost">GhostChat</span>
          </div>
          <nav className="flex flex-wrap gap-6">
            <Link href="/features" className="hover:text-ghost">
              Features
            </Link>
            <Link href="/privacy" className="hover:text-ghost">
              Privacy
            </Link>
            <Link href="/about" className="hover:text-ghost">
              About
            </Link>
            <Link href="/start" className="hover:text-ghost">
              Open chat
            </Link>
          </nav>
          <p>End-to-end encrypted. Peer to peer. Nothing is stored.</p>
        </footer>
      </section>
    </main>
  );
}
