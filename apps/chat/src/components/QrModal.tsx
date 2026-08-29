"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrModal({
  code,
  claimed,
  onClose,
}: {
  code: string;
  claimed?: boolean;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const joinUrl = `${window.location.origin}/join/${code}`;

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, { width: 320, margin: 2 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const copy = async (what: "link" | "code", text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(what);
        setTimeout(() => setCopied(null), 1500);
      }
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-sm flex-col items-center rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ghost">Invite to chat</h2>
        <p className="mb-4 text-center text-sm text-soft">
          {claimed
            ? "This room is already connected. The invite link has been used."
            : "Share this link — it works once, for one person."}
        </p>
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR code to join room" className="h-72 w-72 rounded-xl" />
        ) : (
          <div className="flex h-72 w-72 items-center justify-center rounded-xl bg-gray-100 text-soft">
            Generating…
          </div>
        )}
        <div className="mt-4 flex w-full flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-mint/90"
            onClick={() => void copy("link", joinUrl)}
          >
            {copied === "link" ? "Link copied!" : "Copy invite link"}
          </button>
          <div className="flex w-full items-center gap-2 rounded-xl bg-[#f0f2f5] px-4 py-3">
            <span className="text-2xl font-bold tracking-widest text-ghost">{code}</span>
            <button
              type="button"
              className="ml-auto rounded-lg bg-[#e7fce3] px-3 py-1.5 text-sm font-semibold text-mint transition hover:bg-[#d9f7d3]"
              onClick={() => void copy("code", code)}
            >
              {copied === "code" ? "Copied!" : "Copy code"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-soft transition hover:bg-[#f0f2f5]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
