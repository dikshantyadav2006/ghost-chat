"use client";

import { useEffect } from "react";
import { initInstallPrompt, registerServiceWorker } from "@/lib/pwa";

/**
 * One-time PWA bootstrap: captures the deferred install prompt and registers
 * the service worker as soon as the app shell mounts.
 */
export default function PwaBootstrap() {
  useEffect(() => {
    initInstallPrompt();
    registerServiceWorker();
  }, []);

  return null;
}
