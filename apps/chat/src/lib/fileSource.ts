"use client";

import type { FileRow } from "@ghost/storage";
import { opfsRead } from "@ghost/storage";
import { getOutboundSource } from "@/lib/sourceFiles";
import { getProgressiveParts } from "@/lib/progressiveMedia";

/**
 * Resolves a usable `Blob` for a file row: final blob (done), the sender's
 * in-memory outbound source, OPFS-persisted source, or the progressive parts
 * received so far.
 */
export async function resolveFileBlob(file: FileRow | null | undefined): Promise<Blob | null> {
  if (!file) return null;
  if (file.blob) return file.blob;
  const outbound = getOutboundSource(file.id);
  if (outbound) return outbound;
  // Check OPFS for persisted outbound source (survives page reloads).
  if (file.opfsId) {
    const opfsBlob = await opfsRead(file.opfsId);
    if (opfsBlob) return opfsBlob;
  }
  const parts = getProgressiveParts(file.id);
  if (parts && parts.length > 0) return new Blob(parts);
  return null;
}
