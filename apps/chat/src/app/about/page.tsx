import type { Metadata } from "next";
import SiteShell from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "GhostChat is an open, privacy-first chat app: end-to-end encrypted messaging, file sharing, voice notes and calls — peer to peer, with no permanent server storage.",
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <SiteShell>
      <h1 className="text-3xl font-extrabold sm:text-4xl">About GhostChat</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-soft">
        <p>
          GhostChat is a privacy-first messaging app built on a simple belief:
          your conversations should belong to you and your chat partner — and to
          no one else.
        </p>
        <p>
          Traditional chat apps store your messages on servers. That means your
          conversations can be mined, breached, subpoenaed or sold. GhostChat
          flips that model: messages, files, voice notes and calls travel
          directly between devices (peer to peer) and are protected with
          end-to-end encryption.
        </p>
        <p>
          There is no permanent server-side message storage. The signaling
          server only helps two devices find each other, then steps out of the
          way. Your identity is created locally in your browser — no account, no
          phone number, no email required.
        </p>
        <p>
          GhostChat is free and open source. You can run it yourself, inspect
          the code, and verify exactly how your data is handled.
        </p>
      </div>
      <div className="mt-12 text-center">
        <a
          href="/start"
          className="inline-block rounded-lg bg-mint px-6 py-3 font-semibold text-white transition hover:bg-mint/90"
        >
          Open GhostChat
        </a>
      </div>
    </SiteShell>
  );
}