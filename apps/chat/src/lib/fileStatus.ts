"use client";

import type { FileRow } from "@ghost/storage";

/** Human label for a file's transfer state, e.g. "Uploading" / "Delivered". */
export function transferStateLabel(file: FileRow): string {
  switch (file.status) {
    case "pending":
      return "Waiting…";
    case "transferring":
      return file.direction === "out" ? "Uploading" : "Downloading";
    case "paused":
      return "Paused";
    case "interrupted":
      return "Reconnecting…";
    case "done":
      return file.direction === "out" ? "Delivered" : "Received";
    case "error":
      return "Failed";
  }
}

/** Tailwind classes for the state chip tone (text + dot). */
export function transferStateTone(file: FileRow): {
  text: string;
  dot: string;
  active?: boolean;
} {
  switch (file.status) {
    case "done":
      return { text: "text-ok", dot: "bg-ok" };
    case "error":
      return { text: "text-alert", dot: "bg-alert" };
    case "paused":
      return { text: "text-amber", dot: "bg-amber" };
    case "interrupted":
      return { text: "text-amber", dot: "bg-amber", active: true };
    case "transferring":
    case "pending":
      return { text: "text-mint", dot: "bg-mint", active: true };
  }
}
