import { describe, expect, it } from "vitest";
import { createBufferedAmountGate } from "./peer";

class FakeChannel {
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  private readonly lowListeners = new Set<() => void>();

  addEventListener(type: "bufferedamountlow", listener: () => void): void {
    if (type === "bufferedamountlow") this.lowListeners.add(listener);
  }

  removeEventListener(type: "bufferedamountlow", listener: () => void): void {
    if (type === "bufferedamountlow") this.lowListeners.delete(listener);
  }

  emitLow(): void {
    for (const listener of [...this.lowListeners]) listener();
  }
}

describe("createBufferedAmountGate", () => {
  it("does not block while the buffer is below the high-water mark", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 2 * 1024 * 1024;
    const gate = createBufferedAmountGate(channel);
    expect(channel.bufferedAmountLowThreshold).toBe(1 * 1024 * 1024);
    await gate.drain();
  });

  it("does not block between the low-water and high-water marks", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 3 * 1024 * 1024;
    const gate = createBufferedAmountGate(channel);
    await gate.drain();
  });

  it("blocks above the high-water mark and resolves once the buffer drains", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 5 * 1024 * 1024;
    const gate = createBufferedAmountGate(channel);

    let resolved = false;
    const pending = gate.drain().then(() => {
      resolved = true;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);

    channel.bufferedAmount = 0.5 * 1024 * 1024;
    channel.emitLow();
    await pending;
    expect(resolved).toBe(true);
  });

  it("falls back to polling when the bufferedamountlow event never fires", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 5 * 1024 * 1024;
    const gate = createBufferedAmountGate(channel, { pollMs: 10 });

    let resolved = false;
    const pending = gate.drain().then(() => {
      resolved = true;
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(resolved).toBe(false);

    channel.bufferedAmount = 0.5 * 1024 * 1024;
    await pending;
    expect(resolved).toBe(true);
  });
});
