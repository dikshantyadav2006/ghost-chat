"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { normalizeRoomCode } from "@ghost/protocol";
import { ScanLine, X } from "lucide-react";

function extractRoomCode(text: string): string | null {
  const match = text.match(/\/join\/([A-Za-z0-9-]+)/);
  return normalizeRoomCode(match?.[1] ?? text);
}

/**
 * Full-screen camera QR scanner. Detects GhostChat join links (or bare room
 * codes) from the rear camera and reports a normalized room id via onScan.
 * The camera stays live until a code is found or onClose is called.
 */
export default function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (roomId: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let active = true;
    let canvas: HTMLCanvasElement | null = null;

    const stop = () => {
      active = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const tick = () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        const { videoWidth, videoHeight } = video;
        if (videoWidth > 0 && videoHeight > 0) {
          if (!canvas) canvas = document.createElement("canvas");
          canvas.width = videoWidth;
          canvas.height = videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
            const image = ctx.getImageData(0, 0, videoWidth, videoHeight);
            const result = jsQR(image.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (result?.data) {
              const roomId = extractRoomCode(result.data);
              if (roomId) {
                stop();
                setFound(true);
                onScanRef.current(roomId);
                return;
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
      } catch {
        if (active) setError("Camera unavailable. Allow camera access to scan a QR code.");
      }
    })();

    return stop;
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-2 border-mint/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
        <ScanLine className="h-5 w-5 text-mint" />
        <p className="text-sm font-semibold text-white">
          {found ? "Found room — connecting…" : "Point your camera at a room QR code"}
        </p>
        <p className="text-xs text-white/60">Codes look like ABCD-EFGH and work once.</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 rounded-lg bg-white/10 px-6 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
