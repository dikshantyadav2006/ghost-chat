import type { ReactNode } from "react";
import Link from "next/link";

export default function SiteShell({ children }: { children: ReactNode }) {
  return (
    <main className="h-full overflow-y-auto overflow-x-hidden bg-ink text-ghost">
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

      <div className="mx-auto max-w-3xl px-6 py-16">{children}</div>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-soft sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </footer>
    </main>
  );
}