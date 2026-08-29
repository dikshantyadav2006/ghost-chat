import type { Metadata } from "next";
import SiteShell from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How GhostChat protects your privacy: end-to-end encryption, peer-to-peer delivery and no permanent server-side message storage.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <h1 className="text-3xl font-extrabold sm:text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-soft">Last updated: August 14, 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-soft">
        <section>
          <h2 className="text-lg font-bold text-ghost">The short version</h2>
          <p className="mt-2">
            GhostChat is designed to be private by default. Conversations are
            end-to-end encrypted and delivered directly between devices (peer to
            peer). GhostChat does not store your messages, files or call
            recordings on any server.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ghost">What we store</h2>
          <p className="mt-2">
            GhostChat stores only the minimal ephemeral information needed to
            connect two peers to each other — the signaling service briefly
            routes connection handshakes between devices. Your identity, keys,
            messages and files are kept on your own device only.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              No message content is ever uploaded to or stored on a server.
            </li>
            <li>
              No file content is uploaded to or stored on a server.
            </li>
            <li>
              No call audio or video is recorded or stored on a server.
            </li>
            <li>
              No account, phone number or email address is required.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ghost">End-to-end encryption</h2>
          <p className="mt-2">
            Messages are encrypted on your device and can only be decrypted by
            your chat partner. The encryption keys are generated in your browser
            and never leave your device, so even the service cannot read your
            conversations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ghost">Peer-to-peer delivery</h2>
          <p className="mt-2">
            Once two devices are connected, messages, files and calls travel
            directly between them. The server is only used to help the two peers
            find each other and does not see the content.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ghost">Your data on your device</h2>
          <p className="mt-2">
            Your identity and conversations live in your browser&apos;s local
            storage (IndexedDB) on your device. Clearing your browser data, or
            using a different device, removes or separates you from that data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ghost">Contact</h2>
          <p className="mt-2">
            Questions about privacy? Reach out through the project&apos;s
            repository or support channels.
          </p>
        </section>
      </div>
    </SiteShell>
  );
}