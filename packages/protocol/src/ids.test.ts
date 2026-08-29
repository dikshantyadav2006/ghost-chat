import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("prefixes with the given prefix and a dash", () => {
    expect(newId("s")).toMatch(/^s-/);
    expect(newId("conn")).toMatch(/^conn-/);
  });

  it("produces unique ids", () => {
    const a = newId("s");
    const b = newId("s");
    expect(a).not.toBe(b);
  });

  it("stays within signaling validation bounds (<= 64 chars)", () => {
    for (let i = 0; i < 50; i++) {
      expect(newId("s").length).toBeLessThanOrEqual(64);
    }
  });
});
