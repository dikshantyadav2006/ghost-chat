import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  computeSafetyCode,
  decryptBytes,
  decryptRaw,
  decryptText,
  deriveRoomKey,
  encryptBytes,
  encryptRaw,
  encryptText,
  generateKeyPair,
  hexToBytes,
  randomId,
  sha256Hex,
} from "./index";

describe("key generation", () => {
  it("produces distinct keypairs", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).toMatch(/^[A-Za-z0-9+/]{43}={0,2}$/);
  });
});

describe("deriveRoomKey", () => {
  it("derives the same room key for both peers", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const roomId = "ABCDEFGH";
    const [ka, kb] = await Promise.all([
      deriveRoomKey({ privateKey: a.privateKey, peerPublicKey: b.publicKey, roomId }),
      deriveRoomKey({ privateKey: b.privateKey, peerPublicKey: a.publicKey, roomId }),
    ]);
    expect(bytesToHex(ka.raw)).toBe(bytesToHex(kb.raw));
  });

  it("produces different keys for different rooms", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const [ka, kb] = await Promise.all([
      deriveRoomKey({ privateKey: a.privateKey, peerPublicKey: b.publicKey, roomId: "ROOM1AAA" }),
      deriveRoomKey({ privateKey: a.privateKey, peerPublicKey: b.publicKey, roomId: "ROOM2BBB" }),
    ]);
    expect(bytesToHex(ka.raw)).not.toBe(bytesToHex(kb.raw));
  });
});

describe("AES-GCM roundtrip", () => {
  it("encrypts and decrypts text", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const { key } = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const enc = await encryptText(key, "hello ghost 👻");
    expect(enc.data).not.toContain("hello");
    const dec = await decryptText(key, enc);
    expect(dec).toBe("hello ghost 👻");
  });

  it("encrypts and decrypts binary data", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const { key } = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const payload = new Uint8Array([0, 1, 2, 255, 254, 128]);
    const enc = await encryptBytes(key, payload);
    const dec = await decryptBytes(key, enc);
    expect(Array.from(dec)).toEqual(Array.from(payload));
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const { key } = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const enc = await encryptText(key, "secret");
    const tampered = { iv: enc.iv, data: enc.data.slice(0, -2) + "AA" };
    await expect(decryptText(key, tampered)).rejects.toThrow();
  });
});

describe("raw AES-GCM roundtrip", () => {
  it("encrypts and decrypts binary data without base64 inflation", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const { key } = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const payload = new Uint8Array(256 * 1024);
    for (let offset = 0; offset < payload.byteLength; offset += 32768) {
      crypto.getRandomValues(payload.subarray(offset, offset + 32768));
    }
    const enc = await encryptRaw(key, payload);
    expect(enc.data.byteLength).toBe(payload.byteLength + 16);
    const dec = await decryptRaw(key, enc);
    expect(Array.from(dec)).toEqual(Array.from(payload));
  });

  it("fails to decrypt tampered raw ciphertext", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const { key } = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const enc = await encryptRaw(key, new TextEncoder().encode("secret"));
    const tampered = { iv: enc.iv, data: enc.data.slice() };
    tampered.data[0]! ^= 0xff;
    await expect(decryptRaw(key, tampered)).rejects.toThrow();
  });
});

describe("safety code", () => {
  it("is identical for both peers and deterministic per room", async () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const ka = await deriveRoomKey({
      privateKey: a.privateKey,
      peerPublicKey: b.publicKey,
      roomId: "ROOM1AAA",
    });
    const kb = await deriveRoomKey({
      privateKey: b.privateKey,
      peerPublicKey: a.publicKey,
      roomId: "ROOM1AAA",
    });
    const [ca, cb] = await Promise.all([
      computeSafetyCode({ roomId: "ROOM1AAA", myPublicKey: a.publicKey, peerPublicKey: b.publicKey, sharedSecret: ka.raw }),
      computeSafetyCode({ roomId: "ROOM1AAA", myPublicKey: b.publicKey, peerPublicKey: a.publicKey, sharedSecret: kb.raw }),
    ]);
    expect(ca).toBe(cb);
    expect(ca).toMatch(/^[0-9a-f]{5}(-[0-9a-f]{5}){5}$/);
  });
});

describe("helpers", () => {
  it("randomId produces unique prefixed ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(randomId("m"));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^m-/);
  });

  it("sha256 hex matches known digest", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"));
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hexToBytes roundtrips", () => {
    expect(Array.from(hexToBytes("0a1bff"))).toEqual([10, 27, 255]);
  });
});
