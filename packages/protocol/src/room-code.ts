export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 8;
export const ROOM_CODE_GROUP_LENGTH = 4;

const ALPHABET_SET = new Set(ROOM_CODE_ALPHABET);

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) {
    code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

export function formatRoomCode(code: string): string {
  const clean = normalizeRoomCode(code);
  if (!clean) return "";
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += ROOM_CODE_GROUP_LENGTH) {
    groups.push(clean.slice(i, i + ROOM_CODE_GROUP_LENGTH));
  }
  return groups.join("-");
}

export function normalizeRoomCode(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleaned.length !== ROOM_CODE_LENGTH) return "";
  for (const c of cleaned) {
    if (!ALPHABET_SET.has(c)) return "";
  }
  return cleaned;
}
