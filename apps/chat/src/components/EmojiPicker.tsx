"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

interface EmojiEntry {
  char: string;
  label: string;
  tonable?: boolean;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: EmojiEntry[];
}

const CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    name: "Smileys",
    icon: "😀",
    emojis: [
      { char: "😀", label: "grinning" },
      { char: "😃", label: "smiley" },
      { char: "😄", label: "smile" },
      { char: "😁", label: "grin" },
      { char: "😆", label: "laughing" },
      { char: "😂", label: "joy" },
      { char: "🤣", label: "rofl" },
      { char: "😊", label: "blush" },
      { char: "😇", label: "innocent" },
      { char: "🙂", label: "slight smile" },
      { char: "😉", label: "wink" },
      { char: "😍", label: "heart eyes" },
      { char: "🥰", label: "smiling hearts" },
      { char: "😘", label: "kiss" },
      { char: "😎", label: "sunglasses" },
      { char: "🤓", label: "nerd" },
      { char: "🤔", label: "thinking" },
      { char: "🙃", label: "upside down" },
      { char: "😌", label: "relieved" },
      { char: "😋", label: "yum" },
      { char: "😜", label: "stuck out tongue" },
      { char: "🤪", label: "zany" },
      { char: "😝", label: "squint tongue" },
      { char: "🤑", label: "money mouth" },
      { char: "🤗", label: "hug" },
      { char: "🤩", label: "star struck" },
      { char: "😢", label: "cry" },
      { char: "😭", label: "sob" },
      { char: "😅", label: "sweat smile" },
      { char: "😳", label: "flushed" },
      { char: "🥳", label: "partying" },
      { char: "😴", label: "sleeping" },
      { char: "😮", label: "surprised" },
      { char: "😲", label: "astonished" },
      { char: "😡", label: "angry" },
      { char: "😠", label: "pout" },
      { char: "😱", label: "scream" },
      { char: "🤯", label: "mind blown" },
      { char: "😬", label: "grimace" },
      { char: "🙄", label: "eye roll" },
      { char: "😏", label: "smirk" },
      { char: "🤫", label: "shh" },
      { char: "🤭", label: "hand over mouth" },
      { char: "🤤", label: "drool" },
      { char: "🥺", label: "pleading" },
      { char: "😷", label: "mask" },
      { char: "🤒", label: "sick" },
    ],
  },
  {
    id: "people",
    name: "People",
    icon: "👋",
    emojis: [
      { char: "👋", label: "wave", tonable: true },
      { char: "🤝", label: "handshake" },
      { char: "👍", label: "thumbs up", tonable: true },
      { char: "👎", label: "thumbs down", tonable: true },
      { char: "👏", label: "clap", tonable: true },
      { char: "🙌", label: "raised hands", tonable: true },
      { char: "🙏", label: "folded hands", tonable: true },
      { char: "✌️", label: "victory", tonable: true },
      { char: "🤟", label: "love you", tonable: true },
      { char: "🤘", label: "rock on", tonable: true },
      { char: "👌", label: "ok hand", tonable: true },
      { char: "✊", label: "fist", tonable: true },
      { char: "🤛", label: "left fist", tonable: true },
      { char: "🤜", label: "right fist", tonable: true },
      { char: "🤞", label: "crossed fingers", tonable: true },
      { char: "☝️", label: "point up", tonable: true },
      { char: "👆", label: "point up finger", tonable: true },
      { char: "👇", label: "point down", tonable: true },
      { char: "👈", label: "point left", tonable: true },
      { char: "👉", label: "point right", tonable: true },
      { char: "🤙", label: "call me", tonable: true },
      { char: "💪", label: "muscle", tonable: true },
      { char: "🧠", label: "brain" },
      { char: "🫶", label: "heart hands", tonable: true },
      { char: "🤲", label: "palms up", tonable: true },
      { char: "👀", label: "eyes" },
      { char: "🗣️", label: "speaking" },
      { char: "💅", label: "nails", tonable: true },
      { char: "🤳", label: "selfie", tonable: true },
    ],
  },
  {
    id: "animals",
    name: "Animals",
    icon: "🐼",
    emojis: [
      { char: "🐼", label: "panda" },
      { char: "🦄", label: "unicorn" },
      { char: "🐶", label: "dog" },
      { char: "🐱", label: "cat" },
      { char: "🐭", label: "mouse" },
      { char: "🐹", label: "hamster" },
      { char: "🐰", label: "rabbit" },
      { char: "🦊", label: "fox" },
      { char: "🐻", label: "bear" },
      { char: "🐨", label: "koala" },
      { char: "🐯", label: "tiger" },
      { char: "🦁", label: "lion" },
      { char: "🐮", label: "cow" },
      { char: "🐷", label: "pig" },
      { char: "🐸", label: "frog" },
      { char: "🐵", label: "monkey" },
      { char: "🐔", label: "chicken" },
      { char: "🐧", label: "penguin" },
      { char: "🐦", label: "bird" },
      { char: "🦉", label: "owl" },
      { char: "🦋", label: "butterfly" },
      { char: "🐢", label: "turtle" },
      { char: "🐍", label: "snake" },
      { char: "🐳", label: "whale" },
      { char: "🐬", label: "dolphin" },
      { char: "🐙", label: "octopus" },
      { char: "🦀", label: "crab" },
      { char: "🐝", label: "bee" },
    ],
  },
  {
    id: "food",
    name: "Food",
    icon: "🍩",
    emojis: [
      { char: "🍩", label: "donut" },
      { char: "🍕", label: "pizza" },
      { char: "🍔", label: "burger" },
      { char: "🍟", label: "fries" },
      { char: "🌭", label: "hot dog" },
      { char: "🌮", label: "taco" },
      { char: "🍜", label: "noodles" },
      { char: "🍣", label: "sushi" },
      { char: "🍦", label: "ice cream" },
      { char: "🍰", label: "cake" },
      { char: "🍫", label: "chocolate" },
      { char: "🍪", label: "cookie" },
      { char: "🍎", label: "apple" },
      { char: "🍌", label: "banana" },
      { char: "🍇", label: "grapes" },
      { char: "🍉", label: "watermelon" },
      { char: "🍓", label: "strawberry" },
      { char: "🍍", label: "pineapple" },
      { char: "🥑", label: "avocado" },
      { char: "🌶️", label: "pepper" },
      { char: "🍿", label: "popcorn" },
      { char: "🧋", label: "bubble tea" },
      { char: "☕", label: "coffee" },
      { char: "🍵", label: "tea" },
      { char: "🥂", label: "cheers" },
    ],
  },
  {
    id: "travel",
    name: "Travel",
    icon: "🌙",
    emojis: [
      { char: "🌙", label: "moon" },
      { char: "☀️", label: "sun" },
      { char: "🌈", label: "rainbow" },
      { char: "☁️", label: "cloud" },
      { char: "⚡", label: "lightning" },
      { char: "❄️", label: "snow" },
      { char: "🔥", label: "fire" },
      { char: "💧", label: "droplet" },
      { char: "🌊", label: "wave" },
      { char: "🌍", label: "globe" },
      { char: "🌋", label: "volcano" },
      { char: "🌸", label: "cherry blossom" },
      { char: "🌹", label: "rose" },
      { char: "🍀", label: "clover" },
      { char: "🌵", label: "cactus" },
      { char: "🏝️", label: "island" },
      { char: "🏔️", label: "mountain" },
      { char: "⛺", label: "camping" },
      { char: "🚀", label: "rocket" },
      { char: "🛸", label: "ufo" },
      { char: "✈️", label: "plane" },
      { char: "🚗", label: "car" },
      { char: "🚲", label: "bike" },
      { char: "🚂", label: "train" },
      { char: "🎡", label: "ferris wheel" },
    ],
  },
  {
    id: "activities",
    name: "Activities",
    icon: "🎉",
    emojis: [
      { char: "🎉", label: "party popper" },
      { char: "🎊", label: "confetti" },
      { char: "🎂", label: "birthday cake" },
      { char: "🎁", label: "gift" },
      { char: "🏆", label: "trophy" },
      { char: "🥇", label: "gold medal" },
      { char: "⚽", label: "soccer" },
      { char: "🏀", label: "basketball" },
      { char: "🎮", label: "video game" },
      { char: "🎲", label: "dice" },
      { char: "🎯", label: "target" },
      { char: "🎤", label: "microphone" },
      { char: "🎧", label: "headphones" },
      { char: "🎸", label: "guitar" },
      { char: "🎹", label: "piano" },
      { char: "🎨", label: "art" },
      { char: "🎭", label: "theater" },
      { char: "📸", label: "camera" },
      { char: "🎬", label: "movie" },
      { char: "🪄", label: "magic wand" },
      { char: "💃", label: "dancing" },
      { char: "🕺", label: "dancing man" },
      { char: "🏄", label: "surfing" },
      { char: "⛸️", label: "skate" },
    ],
  },
  {
    id: "objects",
    name: "Objects",
    icon: "✨",
    emojis: [
      { char: "✨", label: "sparkles" },
      { char: "⭐", label: "star" },
      { char: "🌟", label: "glowing star" },
      { char: "💫", label: "dizzy" },
      { char: "💥", label: "boom" },
      { char: "💯", label: "hundred" },
      { char: "💡", label: "bulb" },
      { char: "🔑", label: "key" },
      { char: "🔒", label: "lock" },
      { char: "🔓", label: "unlock" },
      { char: "📱", label: "phone" },
      { char: "💻", label: "laptop" },
      { char: "⌚", label: "watch" },
      { char: "📚", label: "books" },
      { char: "📝", label: "memo" },
      { char: "✏️", label: "pencil" },
      { char: "🖊️", label: "pen" },
      { char: "💾", label: "floppy" },
      { char: "📌", label: "pin" },
      { char: "🔔", label: "bell" },
      { char: "⏰", label: "alarm" },
      { char: "🎈", label: "balloon" },
      { char: "🪙", label: "coin" },
      { char: "💎", label: "gem" },
    ],
  },
  {
    id: "symbols",
    name: "Symbols",
    icon: "❤️",
    emojis: [
      { char: "❤️", label: "heart" },
      { char: "🧡", label: "orange heart" },
      { char: "💛", label: "yellow heart" },
      { char: "💚", label: "green heart" },
      { char: "💙", label: "blue heart" },
      { char: "💜", label: "purple heart" },
      { char: "🖤", label: "black heart" },
      { char: "🤍", label: "white heart" },
      { char: "💔", label: "broken heart" },
      { char: "💕", label: "two hearts" },
      { char: "💖", label: "sparkling heart" },
      { char: "💗", label: "growing heart" },
      { char: "💘", label: "heart arrow" },
      { char: "💋", label: "kiss mark" },
      { char: "😻", label: "cat hearts" },
      { char: "✅", label: "check" },
      { char: "❌", label: "cross" },
      { char: "⚠️", label: "warning" },
      { char: "💤", label: "zzz" },
      { char: "💭", label: "thought" },
      { char: "💬", label: "speech bubble" },
      { char: "🔞", label: "no" },
      { char: "👻", label: "ghost" },
      { char: "💀", label: "skull" },
    ],
  },
];

const TONES = [
  { char: "", label: "default" },
  { char: "🏻", label: "light" },
  { char: "🏼", label: "medium light" },
  { char: "🏽", label: "medium" },
  { char: "🏾", label: "medium dark" },
  { char: "🏿", label: "dark" },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!.id);
  const [tone, setTone] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results: Array<{ char: string; label: string; tonable?: boolean }> = [];
    for (const cat of CATEGORIES) {
      for (const e of cat.emojis) {
        if (!q || e.label.toLowerCase().includes(q)) results.push(e);
      }
    }
    return results;
  }, [query]);

  const active = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;
  const shown = query.trim() ? filtered : active.emojis;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-raised p-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-1.5 text-sm text-ghost outline-none placeholder:text-soft"
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-soft transition hover:bg-white/5"
          aria-label="Close emoji picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!query.trim() && (
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              title={c.name}
              aria-label={c.name}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition ${
                category === c.id ? "bg-white/5 ring-1 ring-mint/60" : "hover:bg-raised"
              }`}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}

      {query.trim() ? (
        <p className="px-1 text-[11px] text-soft">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </p>
      ) : (
        <div className="flex items-center gap-1 px-1">
          <span className="text-[11px] text-soft">Tone:</span>
          {TONES.map((t, i) => (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              onClick={() => setTone(i)}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-sm transition ${
                tone === i ? "ring-2 ring-mint" : "hover:bg-white/5"
              }`}
            >
              {t.char || "◻"}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-56 overflow-y-auto">
        <div className="grid grid-cols-10 gap-1">
          {shown.map((e) => (
            <button
              key={e.char}
              type="button"
              className="rounded p-1 text-lg transition hover:bg-white/5"
              onClick={() => onPick(e.tonable ? e.char + TONES[tone]!.char : e.char)}
            >
              {e.char}
            </button>
          ))}
        </div>
        {shown.length === 0 && (
          <p className="py-4 text-center text-sm text-soft">No matches</p>
        )}
      </div>
    </div>
  );
}
