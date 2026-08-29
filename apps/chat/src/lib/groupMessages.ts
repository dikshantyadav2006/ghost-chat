"use client";

import type { FileRow, MessageRow } from "@ghost/storage";

const GROUP_GAP_MS = 5 * 60 * 1000;

export interface MessageGroup {
  id: string;
  day: string;
  messages: MessageRow[];
}

export function groupMessages(
  messages: MessageRow[],
  formatDay: (ts: number) => string,
): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const day = formatDay(message.ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      const prev = last.messages[last.messages.length - 1];
      const sameSender = prev?.isMine === message.isMine;
      const withinGap = message.ts - (prev?.ts ?? 0) < GROUP_GAP_MS;
      if (sameSender && withinGap) {
        last.messages.push(message);
        continue;
      }
    }
    groups.push({ id: `${day}:${message.id}`, day, messages: [message] });
  }
  return groups;
}

export function isMediaFile(file: FileRow | null | undefined): file is FileRow {
  return !!file && (file.mime.startsWith("image/") || file.mime.startsWith("video/"));
}

/** The bubble layout index within its own sender group (0 = first, last = tail). */
export function positionInGroup(
  group: MessageGroup,
  messageId: string,
): { first: boolean; last: boolean; single: boolean } {
  const index = group.messages.findIndex((m) => m.id === messageId);
  const first = index === 0;
  const last = index === group.messages.length - 1;
  return { first, last, single: group.messages.length === 1 };
}
