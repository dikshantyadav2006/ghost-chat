"use client";

import { useState } from "react";
import { AVATAR_COLORS, AVATAR_EMOJIS, createIdentity } from "@/lib/identity";
import { useApp } from "@/lib/store";
import Avatar from "./Avatar";

interface OnboardingProps {
  onDone: () => void;
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const setIdentity = useApp((s) => s.setIdentity);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0]!);
  const [color, setColor] = useState(AVATAR_COLORS[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const identity = await createIdentity(name, { emoji, color });
      setIdentity(identity);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="chat-bg flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl">👻</div>
          <h1 className="text-2xl font-bold text-ghost">GhostChat</h1>
          <p className="mt-1 text-sm text-soft">
            End-to-end encrypted. Peer to peer. Nothing is stored on any server.
          </p>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ghost"
          maxLength={40}
          className="mb-5 w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-ghost outline-none focus:border-mint"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
          Your avatar
        </label>
        <div className="mb-2 flex justify-center">
          <Avatar emoji={emoji} color={color} size="lg" />
        </div>
        <div className="mb-2 grid grid-cols-6 gap-2">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`rounded-lg py-1.5 text-xl transition ${emoji === e ? "bg-mint" : "bg-raised hover:bg-white/5"}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="mb-6 flex justify-center gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full transition ${color === c ? "ring-2 ring-white" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="w-full rounded-lg bg-mint py-3 font-semibold text-white transition hover:bg-mint/90 disabled:opacity-50"
        >
          {busy ? "Creating your identity…" : "Start chatting"}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-soft">
          Your identity keys are generated in your browser and stored only on this device.
        </p>
      </div>
    </div>
  );
}
