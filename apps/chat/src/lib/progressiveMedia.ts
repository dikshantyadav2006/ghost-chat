"use client";

/**
 * In-memory progressive media store for inbound files still being received.
 *
 * Received chunks are appended as Blob parts so a growing object URL can be
 * built without waiting for the whole file to arrive. This is separate from
 * the durable IndexedDB chunk store (which drives resume), so partial previews
 * never affect transfer state.
 *
 * The store is designed so a future OPFS-backed writer (FILE-TRANSFER-PLAN.md
 * Phase 4) can replace the in-memory parts with a disk-backed file handle while
 * keeping the same hook surface (`getProgressiveParts` → disk reader).
 */

/** Per-file cap for the in-memory stream buffer. Beyond this the preview waits
 *  for the final assembled blob instead of growing in RAM. */
export const PROGRESSIVE_STREAM_CAP = 256 * 1024 * 1024;

/** Rebuild the object URL at most this often while chunks stream in. */
const EMIT_INTERVAL_MS = 300;

interface Entry {
  parts: Blob[];
  byteLength: number;
  version: number;
}

const entries = new Map<string, Entry>();
const emitTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function pushProgressivePart(fileId: string, data: Uint8Array): void {
  const entry = entries.get(fileId);
  if (entry) {
    if (entry.byteLength >= PROGRESSIVE_STREAM_CAP) return;
    entry.parts.push(new Blob([new Uint8Array(data)]));
    entry.byteLength += data.byteLength;
    scheduleEmit(fileId);
    return;
  }
  entries.set(fileId, {
    parts: [new Blob([new Uint8Array(data)])],
    byteLength: data.byteLength,
    version: 1,
  });
  // First chunk → emit immediately so the player can start parsing the header.
  emit();
}

function scheduleEmit(fileId: string): void {
  if (emitTimers.has(fileId)) return;
  emitTimers.set(
    fileId,
    setTimeout(() => {
      emitTimers.delete(fileId);
      const entry = entries.get(fileId);
      if (entry) entry.version += 1;
      emit();
    }, EMIT_INTERVAL_MS),
  );
}

export function getProgressiveParts(fileId: string): Blob[] | null {
  return entries.get(fileId)?.parts ?? null;
}

export function getProgressiveByteLength(fileId: string): number {
  return entries.get(fileId)?.byteLength ?? 0;
}

export function isProgressiveStreaming(fileId: string): boolean {
  const entry = entries.get(fileId);
  return !!entry && entry.byteLength > 0;
}

export function releaseProgressive(fileId: string): void {
  const timer = emitTimers.get(fileId);
  if (timer) {
    clearTimeout(timer);
    emitTimers.delete(fileId);
  }
  if (entries.delete(fileId)) emit();
}

export function clearProgressiveMedia(): void {
  for (const timer of emitTimers.values()) clearTimeout(timer);
  emitTimers.clear();
  entries.clear();
  emit();
}

export function subscribeProgressive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProgressiveVersion(fileId: string): number {
  return entries.get(fileId)?.version ?? 0;
}
