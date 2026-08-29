"use client";

/**
 * In-memory registry of outbound source `File`s, keyed by `fileId`.
 *
 * The sender never stores received content (that's the receiver's blob), so
 * its own bubbles have nothing to preview from IndexedDB. Registering the
 * original `File` here lets `useFileUrl` build an object URL for the sender's
 * own sent media until a durable source (OPFS, Phase 3) exists. The registry
 * is reactive so components can re-render when a source is (re)registered.
 */
const sources = new Map<string, File>();
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function registerOutboundSource(fileId: string, file: File): void {
  if (sources.get(fileId) === file) return;
  sources.set(fileId, file);
  emit();
}

export function unregisterOutboundSource(fileId: string): void {
  if (sources.delete(fileId)) emit();
}

export function getOutboundSource(fileId: string): File | undefined {
  return sources.get(fileId);
}

export function unregisterAllOutboundSources(): void {
  if (sources.size === 0) return;
  sources.clear();
  emit();
}

/** Subscribe to registry changes (for `useSyncExternalStore`). */
export function subscribeOutboundSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic version bumped on every register/unregister. */
export function getOutboundSourcesVersion(): number {
  return version;
}
