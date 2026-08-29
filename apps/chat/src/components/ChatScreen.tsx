"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { LocalIdentity } from "@ghost/protocol";
import type { FileRow, MessageRow, RoomRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { getSession, openRoom, sendForward, type RoomSession } from "@/lib/session";
import { useApp } from "@/lib/store";
import { formatDay } from "@/lib/format";
import { groupMessages } from "@/lib/groupMessages";
import { playSendSound, unlockAudio } from "@/lib/sound";
import { useHaptics } from "@/hooks/useHaptics";
import { useLinkStats } from "@/hooks/useLinkStats";
import { useTransferStats } from "@/hooks/useTransferStats";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  Images,
  Link,
  MoreVertical,
  Paperclip,
  PanelRightOpen,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Smile,
  UserRound,
  Video,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import ConnectionBanner from "./ConnectionBanner";
import ConnectionHealthPanel, { connectionStatus, TONE_DOT, TONE_TEXT } from "./ConnectionHealth";
import QrModal from "./QrModal";
import MessageBubble from "./MessageBubble";
import MediaLightbox, { type LightboxItem } from "./MediaLightbox";
import AttachmentPreview from "./AttachmentPreview";
import SearchBar from "./SearchBar";
import EmojiPicker from "./EmojiPicker";
import VoiceRecorder from "./VoiceRecorder";
import ForwardModal from "./ForwardModal";
import MediaGallery from "./MediaGallery";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "👎", "🔥", "🎉"];

interface ChatScreenProps {
  roomId: string;
  identity: LocalIdentity;
}

export default function ChatScreen({ roomId, identity }: ChatScreenProps) {
  const router = useRouter();
  const setActiveRoomId = useApp((s) => s.setActiveRoomId);
  const prefs = useApp((s) => s.prefs);
  const detailsOpen = useApp((s) => s.detailsOpen);
  const setDetailsOpen = useApp((s) => s.setDetailsOpen);
  const vibrate = useHaptics();
  const room = useLiveQuery(() => repo.getRoomById(roomId), [roomId], null);
  const messages = useLiveQuery(() => repo.listMessages(roomId), [roomId], [] as MessageRow[]);
  const allFiles = useLiveQuery(() => repo.listFiles(roomId), [roomId], [] as FileRow[]);
  const rooms = useLiveQuery(() => repo.listRooms(), [], [] as RoomRow[]);
  const [session, setSession] = useState<RoomSession | null>(() => getSession(roomId) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [selected, setSelected] = useState<MessageRow | null>(null);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [forwarding, setForwarding] = useState<MessageRow | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showMore, setShowMore] = useState(false);
  useLinkStats(roomId);
  useTransferStats(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const roomIdRef = useRef(roomId);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Keep the composer above the soft keyboard on mobile: the visual viewport
  // shrinks when the keyboard opens, so we pin the chat shell to its height.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = rootRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.height = `${Math.round(vv.height)}px`;
    };
    vv.addEventListener("resize", apply);
    apply();
    return () => vv.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    setActiveRoomId(roomId);
    return () => {
      if (roomIdRef.current === roomId) setActiveRoomId(null);
    };
  }, [roomId, setActiveRoomId]);

  useEffect(() => {
    if (session) {
      void session.markAllRead();
      return;
    }
    if (!room) return;
    openRoom({
      roomId,
      mode: room.mode,
      identity,
      callbacks: { onError: (_id, msg) => useApp.getState().setRoomError(msg) },
    })
      .then((s) => setSession(s))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open room"));
  }, [room, roomId, identity, session]);

  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages.length]);

  useEffect(() => {
    if (room && window.location.search.includes("invite=1")) {
      setShowQr(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [room]);

  const mediaItems = useMemo(() => {
    const fileById = new Map(allFiles.map((f) => [f.id, f]));
    const items: LightboxItem[] = [];
    for (const m of messages) {
      if (m.kind === "file" && m.fileId) {
        const f = fileById.get(m.fileId);
        if (f && (f.mime.startsWith("image/") || f.mime.startsWith("video/"))) {
          items.push({ messageId: m.id, fileId: f.id, isMine: m.isMine, ts: m.ts });
        }
      }
    }
    return items;
  }, [messages, allFiles]);

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as MessageRow[];
    return messages.filter(
      (m) => !m.deletedAt && m.kind === "text" && (m.text ?? "").toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  const activeMatchId = matches[searchActive]?.id ?? null;

  useEffect(() => {
    if (!activeMatchId) return;
    const el = document.querySelector(`[data-message-id="${CSS.escape(activeMatchId)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatchId]);

  const handleSearchNext = useCallback(() => {
    if (matches.length === 0) return;
    setSearchActive((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const handleSearchPrev = useCallback(() => {
    if (matches.length === 0) return;
    setSearchActive((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchActive(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const s = getSession(roomId);
      if (!s) return;
      void repo.listReactions(messageId).then((rows) => {
        const mine = rows.some((r) => r.emoji === emoji && r.mine);
        void s.sendReaction(messageId, emoji, !mine);
      });
    },
    [roomId],
  );

  const handleReact = useCallback(
    (emoji: string) => {
      if (selected) toggleReaction(selected.id, emoji);
      setShowReactPicker(false);
      setSelected(null);
    },
    [selected, toggleReaction],
  );

  const handleCopy = useCallback(async () => {
    if (!selected) return;
    const text = selected.deletedAt
      ? ""
      : selected.kind === "file"
        ? ((await repo.getFile(selected.fileId ?? ""))?.name ?? "file")
        : (selected.text ?? "");
    if (text) {
      await navigator.clipboard?.writeText(text);
      useApp.getState().pushToast("Copied to clipboard", "📋");
    }
    setSelected(null);
  }, [selected]);

  const handleSendText = useCallback(
    async (text: string) => {
      const s = getSession(roomId);
      if (!s) return;
      if (editing) {
        await s.sendEdit(editing.id, text);
        setEditing(null);
        return;
      }
      await s.sendText(text, replyTo?.id);
      if (prefs.sound) playSendSound();
      vibrate(10);
      setReplyTo(null);
      setSelected(null);
    },
    [roomId, editing, replyTo, prefs.sound, vibrate],
  );

  const handleSendFiles = useCallback(
    async (files: File[]) => {
      const s = getSession(roomId);
      if (!s) return;
      const failed: File[] = [];
      for (const file of files) {
        try {
          await s.sendFile(file, replyTo?.id);
        } catch (err) {
          failed.push(file);
          useApp
            .getState()
            .pushToast(err instanceof Error ? err.message : "File send failed", "⚠️");
        }
      }
      if (failed.length === 0) {
        if (prefs.sound) playSendSound();
        vibrate(15);
        setReplyTo(null);
        setPendingFiles([]);
      } else {
        setPendingFiles(failed);
      }
    },
    [roomId, replyTo, prefs.sound, vibrate],
  );

  const handleSendVoice = useCallback(
    (blob: Blob) => {
      const s = getSession(roomId);
      if (!s) return;
      void s.sendVoice(blob);
      if (prefs.sound) playSendSound();
      vibrate(15);
    },
    [roomId, prefs.sound, vibrate],
  );

  const handleStartCall = useCallback(async (video: boolean) => {
    const s = getSession(roomId);
    if (!s) return;
    try {
      await s.startCall(video);
    } catch (err) {
      useApp
        .getState()
        .pushToast(err instanceof Error ? err.message : "Could not start call", "📵");
    }
  }, [roomId]);

  const handleDelete = useCallback(
    async (message: MessageRow) => {
      if (!session) return;
      if (!window.confirm("Delete this message for everyone?")) return;
      await session.sendDelete(message.id);
      if (selected?.id === message.id) setSelected(null);
    },
    [session, selected],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setPendingFiles(files);
  }, []);

  const handleForward = useCallback(
    async (target: RoomRow) => {
      const msg = forwarding;
      if (!msg) return;
      try {
        await sendForward({ room: target, identity, message: msg });
        useApp.getState().pushToast("Message forwarded", "↪");
      } catch (err) {
        useApp.getState().pushToast(err instanceof Error ? err.message : "Forward failed", "⚠️");
      } finally {
        setForwarding(null);
        setSelected(null);
      }
    },
    [forwarding, identity],
  );

  const grouped = useMemo(() => groupMessages(messages, formatDay), [messages]);

  return (
    <div
      ref={rootRef}
      className="flex h-dvh w-full flex-col bg-ink lg:h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="rounded-2xl border-2 border-dashed border-mint bg-raised/90 px-8 py-6 text-center">
            <Paperclip className="mx-auto mb-2 h-8 w-8 text-mint" />
            <p className="font-semibold text-ghost">Drop to send</p>
          </div>
        </div>
      )}
      <header className="flex items-center gap-3 bg-raised px-3 py-2.5">
        <button
          type="button"
          onClick={() => router.push("/start")}
          className="rounded-full p-1.5 text-soft transition hover:bg-white/5 lg:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar emoji="👻" color="#005c4b" size="sm" />
        <button
          type="button"
          onClick={() => setShowHealth(true)}
          className="min-w-0 flex-1 text-left"
          title="Connection details"
          aria-label="Show connection details"
        >
          <p className="truncate font-semibold text-ghost">{room?.peerName ?? "Chat"}</p>
          <StatusLine roomId={roomId} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className="rounded-full p-2 text-sm text-soft transition hover:bg-white/5"
          title="Search"
          aria-label="Search messages"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void handleStartCall(false)}
          className="rounded-full p-2 text-sm text-mint transition hover:bg-white/5"
          title="Voice call"
          aria-label="Start a voice call"
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void handleStartCall(true)}
          className="rounded-full p-2 text-sm text-mint transition hover:bg-white/5"
          title="Video call"
          aria-label="Start a video call"
        >
          <Video className="h-5 w-5" />
        </button>
        {room?.peerName && (
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="hidden rounded-full p-2 text-sm text-soft transition hover:bg-white/5 lg:inline-flex"
            title={detailsOpen ? "Hide chat details" : "Show chat details"}
            aria-label={detailsOpen ? "Hide chat details" : "Show chat details"}
            aria-pressed={detailsOpen}
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="rounded-full p-2 text-sm text-soft transition hover:bg-white/5"
            title="More"
            aria-label="More actions"
            aria-expanded={showMore}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {showMore && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)} />
              <div className="tray-pop absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-line bg-raised p-1.5 shadow-2xl">
                <MoreItem
                  icon={<Images className="h-4 w-4" />}
                  label="Media"
                  onClick={() => {
                    setShowMore(false);
                    setShowGallery(true);
                  }}
                />
                {room?.peerName && (
                  <MoreItem
                    icon={<UserRound className="h-4 w-4" />}
                    label="Chat details"
                    onClick={() => {
                      setShowMore(false);
                      if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                        setDetailsOpen(!detailsOpen);
                      } else {
                        router.push(`/c/${roomId}/details`);
                      }
                    }}
                  />
                )}
                <MoreItem
                  icon={<Activity className="h-4 w-4" />}
                  label="Connection details"
                  onClick={() => {
                    setShowMore(false);
                    setShowHealth(true);
                  }}
                />
                <MoreItem
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Encryption"
                  onClick={() => {
                    setShowMore(false);
                    setShowSafety(true);
                  }}
                />
                <MoreItem
                  icon={<Link className="h-4 w-4" />}
                  label="Invite"
                  onClick={() => {
                    setShowMore(false);
                    setShowQr(true);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </header>

      {searchOpen && (
        <SearchBar
          query={searchQuery}
          resultCount={matches.length}
          onQueryChange={(q) => {
            setSearchQuery(q);
            setSearchActive(0);
          }}
          onPrev={handleSearchPrev}
          onNext={handleSearchNext}
          onClose={handleCloseSearch}
        />
      )}

      <ConnectionBanner roomId={roomId} />

      <div className="relative min-h-0 flex-1">
        <main
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-thin chat-bg h-full overflow-y-auto px-3 py-4"
        >
          {error && (
            <div className="mx-auto mb-3 max-w-md rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
              {error}
              <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
                dismiss
              </button>
            </div>
          )}

          {grouped.map((group, i) => {
            const prevDay = i > 0 ? grouped[i - 1]!.day : null;
            return (
              <div key={group.id}>
                {group.day !== prevDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-lg bg-white/5 px-3 py-1 text-xs font-medium text-soft">
                      {group.day}
                    </span>
                  </div>
                )}
                <div className="mb-1">
                  {group.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      group={group}
                      selected={selected?.id === message.id}
                      isReplyActive={replyTo?.id === message.id}
                      query={searchOpen ? searchQuery : null}
                      matchActive={message.id === activeMatchId}
                      onSelect={() => {
                        setSelected(message.id === selected?.id ? null : message);
                        setShowReactPicker(false);
                      }}
                      onReply={() => {
                        setReplyTo(message);
                        setEditing(null);
                        setSelected(null);
                        setShowReactPicker(false);
                      }}
                      onEdit={() => {
                        setEditing(message);
                        setReplyTo(null);
                        setSelected(null);
                      }}
                      onDelete={() => void handleDelete(message)}
                      onOpenLightbox={() => {
                        const i = mediaItems.findIndex((it) => it.messageId === message.id);
                        if (i >= 0) setLightboxIndex(i);
                      }}
                      onReact={toggleReaction}
                      onForward={() => {
                        setForwarding(message);
                        setSelected(null);
                        setReplyTo(null);
                        setShowReactPicker(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-4xl">💬</div>
              <p className="max-w-xs text-sm text-soft">
                Say hi to {room?.peerName ?? "your peer"}. Everything here is end-to-end encrypted.
              </p>
            </div>
          )}
        </main>

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to latest"
            className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-raised text-lg text-ghost shadow-lg ring-1 ring-line transition hover:bg-white/5"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
      </div>

      {selected && (
        <div className="border-t border-line bg-raised px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto truncate text-xs text-soft">
              {selected.isMine ? "Your message" : "Message"}
            </span>
            <ActionButton label="React" onClick={() => setShowReactPicker((v) => !v)} />
            <ActionButton
              label="Reply"
              onClick={() => {
                setReplyTo(selected);
                setSelected(null);
                setShowReactPicker(false);
              }}
            />
            <ActionButton
              label="Forward"
              onClick={() => {
                setForwarding(selected);
                setSelected(null);
                setShowReactPicker(false);
              }}
            />
            <ActionButton label="Copy" onClick={() => void handleCopy()} />
            {selected.isMine && !selected.deletedAt && (
              <ActionButton
                label="Edit"
                onClick={() => {
                  setEditing(selected);
                  setReplyTo(null);
                  setSelected(null);
                  setShowReactPicker(false);
                }}
              />
            )}
            {selected.isMine && !selected.deletedAt && (
              <ActionButton label="Delete" onClick={() => void handleDelete(selected)} />
            )}
          </div>
          {showReactPicker && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => handleReact(e)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-lg transition hover:bg-white/10 active:scale-90"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Composer
        onSendText={handleSendText}
        onPickFiles={(files) => setPendingFiles(files)}
        onSendVoice={handleSendVoice}
        onTyping={(active) => void getSession(roomId)?.sendTyping(active)}
        replyTo={replyTo}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
      />

      {pendingFiles.length > 0 && (
        <AttachmentPreview
          files={pendingFiles}
          onSend={(fs) => void handleSendFiles(fs)}
          onCancel={() => setPendingFiles([])}
          onChange={setPendingFiles}
        />
      )}

      {showQr && room && (
        <QrModal code={room.code} claimed={!!room.peerUserId} onClose={() => setShowQr(false)} />
      )}
      {showSafety && room && <SafetyModal roomId={roomId} onClose={() => setShowSafety(false)} />}
      {forwarding && (
        <ForwardModal
          rooms={rooms.filter((r) => r.id !== roomId)}
          onForward={(r) => void handleForward(r)}
          onClose={() => setForwarding(null)}
        />
      )}
      {showGallery && (
        <MediaGallery
          items={mediaItems}
          files={allFiles}
          onOpen={(i) => {
            setShowGallery(false);
            setLightboxIndex(i);
          }}
          onClose={() => setShowGallery(false)}
        />
      )}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={mediaItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {showHealth && <ConnectionHealthPanel roomId={roomId} onClose={() => setShowHealth(false)} />}
    </div>
  );
}

function StatusLine({ roomId }: { roomId: string }) {
  const online = useApp((s) => s.online[roomId]);
  const peerState = useApp((s) => s.peerState[roomId]);
  const transport = useApp((s) => s.transport[roomId]);
  const rtt = useApp((s) => s.linkStats[roomId]?.rttMs ?? null);
  const typing = useApp((s) => s.typing[roomId]);
  const st = connectionStatus(online, peerState, transport);
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[st.tone]} ${
          st.tone === "warn" || st.tone === "danger" ? "pulse-soft" : ""
        }`}
      />
      <span className={`truncate ${TONE_TEXT[st.tone]}`}>{typing ? "typing…" : st.label}</span>
      {peerState === "connected" && rtt != null && (
        <span className="shrink-0 text-[10px] text-soft">{rtt} ms</span>
      )}
    </span>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-ghost transition hover:bg-white/10"
    >
      {label}
    </button>
  );
}

function MoreItem({
  icon,
  label,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ghost transition hover:bg-white/5 ${className}`}
    >
      <span className="text-soft">{icon}</span>
      {label}
    </button>
  );
}

function Composer({
  onSendText,
  onPickFiles,
  onSendVoice,
  onTyping,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
}: {
  onSendText: (text: string) => void | Promise<void>;
  onPickFiles: (files: File[]) => void;
  onSendVoice: (blob: Blob) => void;
  onTyping: (active: boolean) => void;
  replyTo: MessageRow | null;
  editing: MessageRow | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) setText(editing.text ?? "");
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [editing]);

  // Auto-grow the input up to a max height, then scroll inside it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const handleTyping = (value: string) => {
    setText(value);
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      onTyping(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => onTyping(false), 2500);
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    onTyping(false);
    void onSendText(value);
    setText("");
  };

  return (
    <div className="bg-raised px-3 pb-3 pt-2">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-ghost">
          {editing ? (
            <span className="truncate">Editing: {editing.text}</span>
          ) : (
            <span className="truncate">Replying to: {replyTo?.text ?? "message"}</span>
          )}
          <button
            type="button"
            className="ml-auto text-soft"
            onClick={() => (editing ? onCancelEdit() : onCancelReply())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="rounded-full p-2 text-xl text-soft transition hover:bg-white/5"
          aria-label="Emoji"
        >
          <Smile className="h-6 w-6" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onPickFiles(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-full p-2 text-xl text-soft transition hover:bg-white/5"
          aria-label="Attach file"
        >
          <Paperclip className="h-6 w-6" />
        </button>
        <VoiceRecorder
          onSend={onSendVoice}
          onError={(msg) => useApp.getState().pushToast(msg, "🎙")}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.items ?? [])
              .filter((it) => it.kind === "file")
              .map((it) => it.getAsFile())
              .filter((f): f is File => !!f);
            if (files.length > 0) {
              e.preventDefault();
              onPickFiles(files);
            }
          }}
          placeholder="Type a message"
          className="max-h-[140px] min-h-[42px] flex-1 resize-none rounded-xl bg-white/5 px-4 py-2.5 text-ghost outline-none placeholder:text-soft"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-xl text-white transition hover:bg-mint/90 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {showEmoji && (
        <div className="mt-2">
          <EmojiPicker
            onPick={(emoji) => {
              setText((t) => t + emoji);
            }}
            onClose={() => setShowEmoji(false)}
          />
        </div>
      )}
    </div>
  );
}

function SafetyModal({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const room = useLiveQuery(() => repo.getRoomById(roomId), [roomId], null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ghost">Encryption</h2>
        <p className="mb-4 text-sm text-soft">
          Verify this code with your peer out of band. If it matches, no one is intercepting your
          messages.
        </p>
        {room?.safetyCode ? (
          <p className="rounded-xl bg-white/5 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-ghost">
            {room.safetyCode}
          </p>
        ) : (
          <p className="rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-soft">
            Available once the peer connection is established.
          </p>
        )}
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm text-ghost">
          <span className="font-medium">Room code:</span>
          <span className="font-mono">{room?.code ?? ""}</span>
          <button
            type="button"
            className="ml-auto rounded-lg bg-mint px-3 py-1 text-xs font-semibold text-white"
            onClick={() => void navigator.clipboard?.writeText(room?.code ?? "")}
          >
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-soft transition hover:bg-white/5"
        >
          Close
        </button>
      </div>
    </div>
  );
}
