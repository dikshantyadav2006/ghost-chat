"use client";

import { generateKeyPair, randomId } from "@ghost/crypto";
import type { Avatar, LocalIdentity } from "@ghost/protocol";
import { db, GhostRepository } from "@ghost/storage";

export const repo = new GhostRepository(db);

export const AVATAR_EMOJIS = ["👻", "💜", "🦄", "🍩", "🌙", "✨", "🐼", "🎀", "🌈", "⚡", "🍒", "🫶"];

export const AVATAR_COLORS = ["#7c3aed", "#db2777", "#059669", "#d97706", "#2563eb", "#dc2626", "#0d9488", "#be185d"];

export async function loadIdentity(): Promise<LocalIdentity | null> {
  const row = await repo.getIdentity();
  if (!row) return null;
  return {
    userId: row.userId,
    name: row.name,
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    avatar: row.avatar,
    createdAt: row.createdAt,
  };
}

export async function createIdentity(name: string, avatar: Avatar): Promise<LocalIdentity> {
  const kp = generateKeyPair();
  const identity: LocalIdentity = {
    userId: randomId("u"),
    name: name.trim().slice(0, 40) || "ghost",
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    avatar,
    createdAt: Date.now(),
  };
  await repo.saveIdentity({
    id: "identity",
    userId: identity.userId,
    name: identity.name,
    avatar,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAt: identity.createdAt,
  });
  return identity;
}

export async function resetIdentity(): Promise<void> {
  await db.identity.clear();
}

export async function renameIdentity(name: string): Promise<void> {
  const row = await repo.getIdentity();
  if (!row) return;
  await repo.saveIdentity({ ...row, name: name.trim().slice(0, 40) || "ghost" });
}

export async function setAvatarPhoto(photo: string | null): Promise<Avatar> {
  const row = await repo.getIdentity();
  if (!row) throw new Error("No identity");
  const avatar: Avatar = photo
    ? { ...row.avatar, photo }
    : { emoji: row.avatar.emoji, color: row.avatar.color };
  await repo.saveIdentity({ ...row, avatar });
  return avatar;
}
