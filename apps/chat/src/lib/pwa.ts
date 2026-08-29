"use client";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function installPromptAvailable(): boolean {
  return deferredPrompt !== null;
}

export function onInstallPromptChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<boolean> {
  const evt = deferredPrompt;
  if (!evt) return false;
  await evt.prompt();
  deferredPrompt = null;
  emitChange();
  const choice = await evt.userChoice;
  return choice.outcome === "accepted";
}

/** Captures the deferred install prompt so a later UI action can trigger it. */
export function initInstallPrompt(): void {
  if (typeof window === "undefined") return;
  const handler = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitChange();
  };
  window.addEventListener("beforeinstallprompt", handler);
}

/** Registers the hand-rolled service worker (offline shell only; no push yet). */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // SW unavailable (e.g. private mode) — the app still works fully online.
  });
}
