"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import QRCode from "qrcode";
import { generateRoomCode, normalizeRoomCode, type LocalIdentity } from "@ghost/protocol";
import type { MessageRow, RoomRow } from "@ghost/storage";
import { db } from "@ghost/storage";
import { closeAllSessions, openRoom } from "@/lib/session";
import { renameIdentity, repo, setAvatarPhoto } from "@/lib/identity";
import { clearProgressiveMedia } from "@/lib/progressiveMedia";
import { unregisterAllOutboundSources } from "@/lib/sourceFiles";
import { cloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import { useApp } from "@/lib/store";
import { requestNotificationPermission } from "@/lib/notify";
import { formatTime } from "@/lib/format";
import { installPromptAvailable, onInstallPromptChange, promptInstall } from "@/lib/pwa";
import {
  Camera,
  Check,
  Download,
  MessageSquarePlus,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import QrScanner from "./QrScanner";

/**
 * Persistent chat-list sidebar. Fills the screen on mobile (home), and sits in
 * a fixed-width column on desktop next to the conversation + details panels.
 */
export default function ChatListSidebar({ identity }: { identity: LocalIdentity }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const signalOnline = useApp((s) => s.signalOnline);
  const activeRoomId = useApp((s) => s.activeRoomId);
  const rooms = useLiveQuery(() => repo.listRooms(), [], [] as RoomRow[]);

  const handleDeleteAllChats = async () => {
    closeAllSessions();
    unregisterAllOutboundSources();
    clearProgressiveMedia();
    await repo.clearAllChats();
    useApp.getState().pushToast("All chats deleted", "🗑");
  };

  const handleResetEverything = async () => {
    closeAllSessions();
    unregisterAllOutboundSources();
    clearProgressiveMedia();
    useApp.getState().setIdentity(null);
    await db.delete();
    window.location.reload();
  };

  const handleOpenRoom = async (room: RoomRow) => {
    try {
      await openRoom({
        roomId: room.id,
        mode: room.mode,
        identity,
        callbacks: { onError: (_roomId, msg) => useApp.getState().setRoomError(msg) },
      });
      router.push(`/c/${room.id}`);
    } catch (err) {
      useApp.getState().setRoomError(err instanceof Error ? err.message : "Could not open room");
    }
  };

  const handleScanRoom = async (roomId: string) => {
    try {
      await openRoom({
        roomId,
        mode: "join",
        identity,
        callbacks: { onError: (_roomId, msg) => useApp.getState().setRoomError(msg) },
      });
      setShowScanner(false);
      router.push(`/c/${roomId}`);
    } catch (err) {
      setShowScanner(false);
      useApp.getState().setRoomError(err instanceof Error ? err.message : "Could not join room");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        (r.peerName ?? "").toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [rooms, query]);

  return (
    <div className="flex h-full w-full flex-col bg-surface lg:w-72 lg:shrink-0 lg:border-r lg:border-line xl:w-80">
      <header className="flex items-center gap-2.5 bg-raised px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint/15 text-xl">
          <span aria-hidden>👻</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight text-ghost">GhostChat</p>
          <p className="hidden truncate text-xs text-soft md:block">End-to-end encrypted</p>
        </div>
        <span
          title={signalOnline ? "Signal server connected" : "Signal server offline"}
          className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium md:flex ${
            signalOnline ? "bg-mint text-mint" : "bg-white/5 text-soft"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${signalOnline ? "bg-mint" : "bg-soft"}`} />
          {signalOnline ? "signal" : "offline"}
        </span>
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          aria-label="Scan a QR code"
          title="Scan a QR code"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-soft transition hover:bg-white/5 hover:text-ghost"
        >
          <ScanLine className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowNewChat(true)}
          aria-label="New chat"
          title="New chat"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-mint px-3 py-2 text-sm font-semibold text-white transition hover:bg-mint/90 md:px-3.5"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden md:inline">New chat</span>
        </button>
      </header>

      <div className="px-3 py-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full rounded-lg border border-line bg-raised py-2 pl-9 pr-3 text-sm text-ghost outline-none placeholder:text-soft focus:border-mint"
          />
        </label>
      </div>

      <main className="scrollbar-thin flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-5xl">👻</div>
            <p className="max-w-sm text-soft">
              {query.trim()
                ? "No chats match your search."
                : "No conversations yet. Create a room and share the code — or the QR code — with someone you trust. Both of you need to be online to chat."}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((room) => (
              <RoomListItem
                key={room.id}
                room={room}
                active={room.id === activeRoomId}
                onOpen={() => void handleOpenRoom(room)}
              />
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-line bg-raised px-2 py-2">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
        >
          <Avatar
            emoji={identity.avatar.emoji}
            color={identity.avatar.color}
            photo={identity.avatar.photo}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ghost">{identity.name}</p>
            <p className="truncate text-xs text-soft">Profile & settings</p>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-soft" />
        </button>
      </footer>

      {showNewChat && <NewChatModal identity={identity} onClose={() => setShowNewChat(false)} />}
      {showScanner && (
        <QrScanner
          onScan={(roomId) => void handleScanRoom(roomId)}
          onClose={() => setShowScanner(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          identity={identity}
          onClose={() => setShowSettings(false)}
          onDeleteAllChats={() => void handleDeleteAllChats()}
          onResetEverything={() => void handleResetEverything()}
        />
      )}
    </div>
  );
}

function presenceDot(online: boolean | undefined, peerState: string | undefined): string {
  if (!online) return "bg-soft";
  if (peerState === "connected") return "bg-ok";
  if (peerState === "connecting" || peerState === "reconnecting" || peerState === "disconnected")
    return "bg-amber pulse-soft";
  return "bg-soft";
}

function RoomListItem({
  room,
  active,
  onOpen,
}: {
  room: RoomRow;
  active: boolean;
  onOpen: () => void;
}) {
  const online = useApp((s) => s.online[room.id]);
  const peerState = useApp((s) => s.peerState[room.id]);
  const lastMessage = useLiveQuery(() => repo.listMessages(room.id), [room.id], [] as MessageRow[]);
  const unread = useLiveQuery(() => repo.countUnread(room.id), [room.id], 0);
  const last = lastMessage[lastMessage.length - 1];
  const preview = useMemo(() => {
    if (!last) return room.peerName ? "No messages yet" : "Waiting for peer…";
    if (last.deletedAt) return "This message was deleted";
    if (last.kind === "file") return `📎 ${last.fileId ?? "file"}`;
    return last.text ?? "";
  }, [last, room.peerName]);

  return (
    <li className="relative">
      {active && (
        <span className="absolute left-0 top-0 z-10 h-full w-[3px] rounded-r-full bg-mint" aria-hidden />
      )}
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-raised ${
          active ? "bg-raised" : ""
        }`}
      >
        <div className="relative shrink-0">
          <Avatar emoji="👻" color={room.peerName ? "#005c4b" : "#374151"} size="md" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${presenceDot(online, peerState)}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-semibold text-ghost">
              {room.peerName || "Waiting for peer…"}
            </p>
            {last && <span className="shrink-0 text-[11px] text-soft">{formatTime(last.ts)}</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-soft">{room.peerName ? preview : room.code}</p>
            {unread > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-mint px-1.5 text-xs font-semibold text-white">
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function NewChatModal({ identity, onClose }: { identity: LocalIdentity; onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<"menu" | "scan" | "created">("menu");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ roomId: string; joinUrl: string } | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  useEffect(() => {
    if (!created) return;
    let cancelled = false;
    void QRCode.toDataURL(created.joinUrl, { width: 256, margin: 2 }).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [created]);

  const openRoomAndRoute = async (roomId: string, mode: "create" | "join") => {
    setBusy(true);
    setError(null);
    try {
      await openRoom({
        roomId,
        mode,
        identity,
        callbacks: { onError: (_roomId, msg) => useApp.getState().setRoomError(msg) },
      });
      router.push(`/c/${roomId}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open room");
      setBusy(false);
      return false;
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await openRoom({
        roomId: generateRoomCode(),
        mode: "create",
        identity,
        callbacks: { onError: (_roomId, msg) => useApp.getState().setRoomError(msg) },
      });
      setCreated({ roomId: session.roomId, joinUrl: `${window.location.origin}/join/${session.roomId}` });
      setView("created");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const roomId = normalizeRoomCode(code);
    if (!roomId) {
      setError("That doesn't look like a valid room code (8 characters like ABCD-EFGH).");
      return;
    }
    await openRoomAndRoute(roomId, "join");
  };

  const handleScan = async (roomId: string) => {
    if (!(await openRoomAndRoute(roomId, "join"))) setView("menu");
  };

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

  if (view === "scan") {
    return <QrScanner onScan={handleScan} onClose={() => setView("menu")} />;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "created" && created ? (
          <>
            <h2 className="mb-1 text-lg font-bold text-ghost">Room created</h2>
            <p className="mb-4 text-sm text-soft">
              Share this link — it works once, for one person.
            </p>
            <div className="flex justify-center">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="QR code to join room" className="h-56 w-56 rounded-xl" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-raised text-soft">
                  Generating…
                </div>
              )}
            </div>
            <div className="mt-4 flex w-full items-center gap-2 rounded-xl bg-raised px-4 py-3">
              <span className="text-xl font-bold tracking-widest text-ghost">{created.roomId}</span>
              <button
                type="button"
                onClick={() => void copy("code", created.roomId)}
                className="ml-auto rounded-lg bg-[#e7fce3] px-3 py-1.5 text-sm font-semibold text-mint transition hover:bg-[#d9f7d3]"
              >
                {copied === "code" ? "Copied!" : "Copy code"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copy("link", created.joinUrl)}
              className="mt-3 w-full rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-mint/90"
            >
              {copied === "link" ? "Link copied!" : "Copy invite link"}
            </button>
            <button
              type="button"
              onClick={() => void openRoomAndRoute(created.roomId, "create")}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-raised px-4 py-2.5 text-sm font-semibold text-ghost transition hover:bg-white/5"
            >
              Open chat
            </button>
            <button
              type="button"
              onClick={() => {
                setView("menu");
                setCreated(null);
                setQrUrl(null);
                setCopied(null);
              }}
              className="mt-2 w-full rounded-lg py-2 text-sm text-soft transition hover:bg-raised"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-4 text-lg font-bold text-ghost">New chat</h2>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-mint/10 px-3 py-4 text-center transition hover:bg-mint/20 disabled:opacity-50"
              >
                <MessageSquarePlus className="h-5 w-5 text-mint" />
                <span className="text-sm font-semibold text-ghost">Create a room</span>
                <span className="text-[11px] leading-tight text-soft">Get a code + QR to share</span>
              </button>
              <button
                type="button"
                onClick={() => setView("scan")}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-raised px-3 py-4 text-center transition hover:bg-white/5"
              >
                <ScanLine className="h-5 w-5 text-soft" />
                <span className="text-sm font-semibold text-ghost">Scan a QR</span>
                <span className="text-[11px] leading-tight text-soft">
                  Join by scanning someone&apos;s code
                </span>
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2 text-soft">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-xs">or join with a code</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            <div className="mb-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                aria-label="Room code"
                className="flex-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-ghost outline-none focus:border-mint"
              />
              <button
                type="button"
                onClick={() => void handleJoin()}
                disabled={busy}
                className="rounded-lg bg-mint px-4 py-2 font-semibold text-white transition hover:bg-mint/90 disabled:opacity-50"
              >
                Join
              </button>
            </div>

            {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-lg py-2 text-sm text-soft transition hover:bg-raised"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function downscaleImage(file: File, maxSize = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
          "image/jpeg",
          0.82,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function SettingsModal({
  identity,
  onClose,
  onDeleteAllChats,
  onResetEverything,
}: {
  identity: LocalIdentity;
  onClose: () => void;
  onDeleteAllChats: () => void;
  onResetEverything: () => void;
}) {
  const setIdentity = useApp((s) => s.setIdentity);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [name, setName] = useState(identity.name);
  const [saved, setSaved] = useState(false);
  const [avatar, setAvatar] = useState(identity.avatar);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"chats" | "all" | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    setInstallable(installPromptAvailable());
    return onInstallPromptChange(() => setInstallable(installPromptAvailable()));
  }, []);

  useEffect(() => {
    setAvatar(identity.avatar);
  }, [identity.avatar]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === identity.name) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      return;
    }
    await renameIdentity(trimmed);
    setIdentity({ ...identity, name: trimmed });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handlePickPhoto = async (file: File) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const blob = await downscaleImage(file);
      const url = cloudinaryConfigured()
        ? await uploadToCloudinary(blob, `avatar-${Date.now()}.jpg`, "image/jpeg")
        : await blobToDataUrl(blob);
      const nextAvatar = await setAvatarPhoto(url);
      setAvatar(nextAvatar);
      setIdentity({ ...identity, avatar: nextAvatar });
      useApp.getState().pushToast("Profile photo updated", "📸");
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    const nextAvatar = await setAvatarPhoto(null);
    setAvatar(nextAvatar);
    setIdentity({ ...identity, avatar: nextAvatar });
    useApp.getState().pushToast("Profile photo removed", "🗑");
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-ghost">Profile & settings</h2>

        <div className="mb-5 flex items-center gap-3">
          <Avatar emoji={avatar.emoji} color={avatar.color} photo={avatar.photo} size="lg" />
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              aria-label="Display name"
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-ghost outline-none focus:border-mint"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveName()}
                className="flex items-center gap-1 rounded-lg bg-mint px-3 py-1 text-xs font-semibold text-white transition hover:bg-mint/90"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              {saved && <span className="text-xs text-mint">Saved</span>}
            </div>
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
          Profile photo
        </label>
        <div className="mb-5 flex items-center gap-2">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handlePickPhoto(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={photoBusy}
            onClick={() => photoRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-raised px-3 py-2 text-sm font-semibold text-ghost transition hover:bg-white/5 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {photoBusy ? "Uploading…" : avatar.photo ? "Change photo" : "Add photo"}
          </button>
          {avatar.photo && (
            <button
              type="button"
              onClick={() => void handleRemovePhoto()}
              className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-900"
            >
              Remove
            </button>
          )}
          {!cloudinaryConfigured() && (
            <p className="text-[11px] leading-tight text-soft">
              Photo is stored locally. Enable Cloudinary for hosted uploads.
            </p>
          )}
        </div>
        {photoError && <p className="mb-4 text-sm text-red-400">{photoError}</p>}

        {installable && (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
              App
            </label>
            <div className="mb-4">
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="flex w-full items-center gap-3 rounded-lg bg-raised px-3 py-2.5 transition hover:bg-white/5"
              >
                <Download className="h-4 w-4 text-soft" />
                <span className="text-sm text-ghost">Install app</span>
              </button>
            </div>
          </>
        )}

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
          Notifications
        </label>
        <div className="mb-4 space-y-2">
          <ToggleRow
            label="Sound on send & receive"
            checked={prefs.sound}
            onChange={(sound) => setPrefs({ ...prefs, sound })}
          />
          <ToggleRow
            label="Haptic feedback"
            checked={prefs.haptics}
            onChange={(haptics) => setPrefs({ ...prefs, haptics })}
          />
          <ToggleRow
            label="Desktop notifications"
            checked={prefs.notifications}
            onChange={(value) => {
              if (value) {
                void requestNotificationPermission().then((perm) => {
                  if (perm === "granted") {
                    setPrefs({ ...prefs, notifications: true });
                  } else {
                    useApp.getState().pushToast("Notification permission denied", "🔕");
                  }
                });
              } else {
                setPrefs({ ...prefs, notifications: false });
              }
            }}
          />
          {typeof Notification !== "undefined" &&
            prefs.notifications &&
            Notification.permission === "denied" && (
              <p className="px-1 text-xs text-red-400">
                Permission denied in your browser. Allow notifications for this site in your
                settings.
              </p>
            )}
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg bg-raised px-4 py-3 text-xs leading-relaxed text-soft">
          <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Your keys were generated in this browser and never leave this device. Messages are
            end-to-end encrypted and peer to peer — nothing is stored on any server.
          </span>
        </div>

        <div className="mb-2 rounded-lg border border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ghost">Delete all chats</p>
              <p className="text-xs text-soft">Keeps your name, photo and keys.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirm(confirm === "chats" ? null : "chats")}
              className="rounded-lg bg-raised px-3 py-1.5 text-xs font-semibold text-ghost transition hover:bg-white/5"
            >
              {confirm === "chats" ? "Cancel" : "Delete"}
            </button>
          </div>
          {confirm === "chats" && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-950/60 px-3 py-2">
              <p className="text-xs text-red-300">Delete every conversation? This can&apos;t be undone.</p>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  onDeleteAllChats();
                }}
                className="shrink-0 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Yes, delete
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-lg border border-red-900 px-4 py-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-300">Reset everything</p>
              <p className="text-xs text-soft">
                Wipes your identity, keys, photo and all chats. Fresh start.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirm(confirm === "all" ? null : "all")}
              className="rounded-lg bg-red-950 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-900"
            >
              {confirm === "all" ? "Cancel" : "Reset"}
            </button>
          </div>
          {confirm === "all" && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-950/60 px-3 py-2">
              <p className="text-xs text-red-300">
                This permanently deletes your keys and everything on this device.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  onResetEverything();
                }}
                className="shrink-0 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Yes, reset all
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm text-soft transition hover:bg-raised"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg bg-raised px-3 py-2.5 transition hover:bg-white/5"
    >
      <span className="text-sm text-ghost">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-mint" : "bg-white/5"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
