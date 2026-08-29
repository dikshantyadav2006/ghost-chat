export interface Identity {
  userId: string;
  name: string;
  publicKey: string;
}

export interface Avatar {
  emoji: string;
  color: string;
  /** Optional profile photo URL (e.g. Cloudinary). Rendered instead of the emoji. */
  photo?: string;
}

export interface LocalIdentity extends Identity {
  avatar: Avatar;
  privateKey: string;
  createdAt: number;
}

export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

export function isValidPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]{43}={0,2}$/.test(value);
}

/** Session ids come from `newId("sess")` — `sess-` plus 12 URL-safe chars. */
export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && /^sess-[A-Za-z0-9]{12}$/.test(value);
}
