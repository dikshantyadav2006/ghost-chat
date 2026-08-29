"use client";

interface AvatarProps {
  emoji: string;
  color: string;
  /** Optional profile photo URL (rendered instead of the emoji). */
  photo?: string | undefined;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-9 w-9 text-lg",
  md: "h-11 w-11 text-2xl",
  lg: "h-20 w-20 text-5xl",
};

export default function Avatar({ emoji, color, photo, size = "md" }: AvatarProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZES[size]}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="select-none">{emoji}</span>
      )}
    </div>
  );
}
