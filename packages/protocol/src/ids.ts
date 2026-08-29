const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Crypto-random id used to dedupe/ack signaling payloads. Node >=20 and all
 * browsers expose `crypto.getRandomValues`.
 */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${id}`;
}
