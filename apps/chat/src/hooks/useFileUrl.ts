"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FileRow } from "@ghost/storage";
import {
  getOutboundSource,
  getOutboundSourcesVersion,
  subscribeOutboundSources,
} from "@/lib/sourceFiles";
import {
  getProgressiveParts,
  getProgressiveVersion,
  isProgressiveStreaming,
  subscribeProgressive,
} from "@/lib/progressiveMedia";
import { resolveFileBlob } from "@/lib/fileSource";

/**
 * Resolves an object URL for a file row, in priority order:
 *  1. final assembled blob (receiver, done)
 *  2. sender's in-memory outbound source (your own sent files)
 *  3. OPFS-persisted source (survives page reloads)
 *  4. growing progressive parts (inbound file still streaming in)
 *
 * URLs are cached per source and revoked when the source changes or the hook
 * unmounts, so frequent progress updates never churn object URLs.
 */
export function useFileUrl(file: FileRow | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<{ key: string; url: string } | null>(null);
  const outboundVersion = useSyncExternalStore(
    subscribeOutboundSources,
    getOutboundSourcesVersion,
  );
  const progressiveVersion = useSyncExternalStore(subscribeProgressive, () =>
    getProgressiveVersion(file?.id ?? ""),
  );

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    let cancelled = false;

    // Build a synchronous key first (in-memory sources are fast).
    const outbound = getOutboundSource(file.id);
    const hasSyncSource = file.blob || outbound;

    if (hasSyncSource) {
      const key = file.blob ? `blob:${file.id}` : `out:${file.id}`;
      const source = file.blob ?? outbound!;
      const cached = urlRef.current;
      if (cached?.key === key) {
        setUrl(cached.url);
      } else {
        if (cached) URL.revokeObjectURL(cached.url);
        const u = URL.createObjectURL(source);
        urlRef.current = { key, url: u };
        setUrl(u);
      }
      return;
    }

    // Async path: check OPFS and progressive parts.
    void (async () => {
      const source = await resolveFileBlob(file);
      if (cancelled) return;
      if (!source) {
        setUrl(null);
        return;
      }
      // Build key with version to bust cache when source changes.
      let key: string;
      if (file.blob) {
        key = `blob:${file.id}`;
      } else if (outbound) {
        key = `out:${file.id}`;
      } else if (file.opfsId) {
        key = `opfs:${file.opfsId}`;
      } else if (file.direction === "in" && isProgressiveStreaming(file.id)) {
        key = `prog:${file.id}:${progressiveVersion}`;
      } else {
        key = `src:${file.id}:${source.size}`;
      }
      const cached = urlRef.current;
      if (cached?.key === key) {
        setUrl(cached.url);
        return;
      }
      if (cached) URL.revokeObjectURL(cached.url);
      const u = URL.createObjectURL(source);
      urlRef.current = { key, url: u };
      setUrl(u);
    })();

    return () => {
      cancelled = true;
    };
  }, [file, outboundVersion, progressiveVersion]);

  useEffect(() => {
    const cached = urlRef.current;
    if (cached) URL.revokeObjectURL(cached.url);
    urlRef.current = null;
    return () => {
      const current = urlRef.current;
      if (current) URL.revokeObjectURL(current.url);
      urlRef.current = null;
    };
  }, []);

  return url;
}
