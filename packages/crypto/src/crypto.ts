import { x25519 } from "@noble/curves/ed25519";

const AES = "AES-GCM";
const HKDF = "HKDF";
const encoder = new TextEncoder();

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedPayload {
  iv: string;
  data: string;
}

export interface RawEncryptedPayload {
  iv: Uint8Array;
  data: Uint8Array;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Copies into a plain ArrayBuffer-backed view so it satisfies WebCrypto BufferSource. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export function randomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62];
  return `${prefix}-${id}`;
}

export function generateKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey: toBase64(publicKey), privateKey: toBase64(privateKey) };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

async function hkdfExpand(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toBuffer(ikm), HKDF, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: HKDF, salt: toBuffer(salt), info: toBuffer(info), hash: "SHA-256" },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toBuffer(raw), AES, false, ["encrypt", "decrypt"]);
}

export interface RoomKey {
  key: CryptoKey;
  raw: Uint8Array;
}

export async function deriveRoomKey(params: {
  privateKey: string;
  peerPublicKey: string;
  roomId: string;
}): Promise<RoomKey> {
  const shared = x25519.getSharedSecret(fromBase64(params.privateKey), fromBase64(params.peerPublicKey));
  const raw = await hkdfExpand(shared, encoder.encode("ghostchat-room-key-v1"), encoder.encode(params.roomId), 32);
  return { key: await importAesKey(raw), raw };
}

export async function encryptRaw(key: CryptoKey, data: Uint8Array): Promise<RawEncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: AES, iv: toBuffer(iv) }, key, toBuffer(data));
  return { iv, data: new Uint8Array(ciphertext) };
}

export async function decryptRaw(key: CryptoKey, payload: RawEncryptedPayload): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: AES, iv: toBuffer(payload.iv) },
    key,
    toBuffer(payload.data),
  );
  return new Uint8Array(plaintext);
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<EncryptedPayload> {
  const { iv, data: ciphertext } = await encryptRaw(key, data);
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

export async function decryptBytes(key: CryptoKey, payload: EncryptedPayload): Promise<Uint8Array> {
  return decryptRaw(key, { iv: fromBase64(payload.iv), data: fromBase64(payload.data) });
}

export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedPayload> {
  return encryptBytes(key, encoder.encode(text));
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const bytes = await decryptBytes(key, payload);
  return new TextDecoder().decode(bytes);
}

export async function computeSafetyCode(params: {
  roomId: string;
  myPublicKey: string;
  peerPublicKey: string;
  sharedSecret: Uint8Array;
}): Promise<string> {
  const sorted = [params.myPublicKey, params.peerPublicKey].sort();
  const a = sorted[0]!;
  const b = sorted[1]!;
  const material = new Uint8Array(params.sharedSecret.byteLength + a.length + b.length);
  material.set(params.sharedSecret, 0);
  material.set(encoder.encode(a), params.sharedSecret.byteLength);
  material.set(encoder.encode(b), params.sharedSecret.byteLength + a.length);
  const digest = await sha256Hex(material);
  const hex = digest.slice(0, 30);
  return hex.match(/.{1,5}/g)?.join("-") ?? hex;
}

export { toBase64, fromBase64, bytesToHex, hexToBytes };
