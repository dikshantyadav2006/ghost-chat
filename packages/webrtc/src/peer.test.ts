import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SignalData } from "@ghost/protocol";
import {
  PeerSession,
  type PeerConnectionState,
  type PeerHandlers,
} from "./peer";

interface TestHandlers {
  signals: SignalData[];
  states: PeerConnectionState[];
  onSignal: (signal: SignalData) => void;
  onStateChange: (state: PeerConnectionState) => void;
}

function makeHandlers(): TestHandlers {
  const signals: SignalData[] = [];
  const states: PeerConnectionState[] = [];
  return {
    signals,
    states,
    onSignal: (signal) => signals.push(signal),
    onStateChange: (state) => states.push(state),
  };
}

function makeConfig(
  role: "offerer" | "answerer",
  polite: boolean,
  handlers: TestHandlers,
): {
  config: {
    role: "offerer" | "answerer";
    polite: boolean;
    ephemeralPub: string;
    handlers: PeerHandlers;
  };
} {
  return {
    config: {
      role,
      polite,
      ephemeralPub: "eph-pub",
      handlers: {
        onOpen: () => {},
        onClose: () => {},
        onFrame: () => {},
        onSignal: handlers.onSignal,
        onStateChange: handlers.onStateChange,
      },
    },
  };
}

class MockDataChannel {
  label: string;
  readyState = "connecting";
  binaryType = "blob";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Record<string, () => void> = {};

  constructor(label: string) {
    this.label = label;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners[type] = listener;
  }

  removeEventListener(type: string, _listener: () => void): void {
    delete this.listeners[type];
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  close(): void {
    this.readyState = "closed";
    this.onclose?.();
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  signalingState = "stable";
  iceConnectionState = "new";
  connectionState = "new";
  sctp = { maxMessageSize: 65536 };
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((event: { candidate: { candidate: string } | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: MockDataChannel }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  addIceCandidates: { candidate: string }[] = [];
  restartIceCalls = 0;
  rollbackCalls = 0;
  closed = false;
  readonly config: RTCConfiguration;

  constructor(config: RTCConfiguration) {
    this.config = config;
    MockRTCPeerConnection.instances.push(this);
  }

  createDataChannel(label: string): MockDataChannel {
    return new MockDataChannel(label);
  }

  createOffer(): Promise<{ type: "offer"; sdp: string }> {
    return Promise.resolve({ type: "offer", sdp: "local-offer-sdp" });
  }

  createAnswer(): Promise<{ type: "answer"; sdp: string }> {
    return Promise.resolve({ type: "answer", sdp: "local-answer-sdp" });
  }

  async setLocalDescription(desc: { type: string; sdp?: string }): Promise<void> {
    if (desc.type === "rollback") {
      this.rollbackCalls += 1;
      this.signalingState = "stable";
      this.localDescription = null;
      return;
    }
    this.localDescription = { type: desc.type, sdp: desc.sdp ?? `${desc.type}-sdp` };
    this.signalingState = desc.type === "offer" ? "have-local-offer" : "stable";
    if (desc.type === "offer") {
      queueMicrotask(() => {
        this.onicecandidate?.({
          candidate: { candidate: "candidate:local/1 1 udp 1 host 1.2.3.4 9 typ host" },
        });
        this.onicecandidate?.({ candidate: null });
      });
    }
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = { type: desc.type, sdp: desc.sdp };
    this.signalingState = desc.type === "offer" ? "have-remote-offer" : "stable";
  }

  async addIceCandidate(candidate: { candidate: string }): Promise<void> {
    this.addIceCandidates.push(candidate);
  }

  getStats(): Promise<Map<string, unknown>> {
    return Promise.resolve(new Map());
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  addTrack(): { kind: string } {
    return { kind: "audio" };
  }

  close(): void {
    this.closed = true;
    this.iceConnectionState = "closed";
    this.connectionState = "closed";
    this.oniceconnectionstatechange?.();
  }
}

function lastState(handlers: TestHandlers): PeerConnectionState | undefined {
  return handlers.states[handlers.states.length - 1];
}

function mockPc(): MockRTCPeerConnection {
  const pc = MockRTCPeerConnection.instances[0];
  if (!pc) throw new Error("no mock RTCPeerConnection was created");
  return pc;
}

beforeEach(() => {
  MockRTCPeerConnection.instances = [];
});

vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);

describe("PeerSession candidate queue", () => {
  it("buffers ICE candidates until a remote description exists, then flushes", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("answerer", true, handlers);
    const peer = new PeerSession(config);
    const pc = mockPc();
    expect(pc).toBeDefined();

    await peer.handleSignal({
      type: "ice",
      candidate: { candidate: "candidate:queued/1 1 udp 1 host 9.9.9.9 9 typ host" },
      signalId: "sig-ice-1",
    });
    expect(pc.addIceCandidates).toHaveLength(0);

    await peer.handleSignal({
      type: "offer",
      sdp: "remote-offer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-offer-1",
    });
    expect(pc.addIceCandidates).toHaveLength(1);
    expect(pc.addIceCandidates[0]?.candidate).toContain("candidate:queued");
    expect(handlers.signals.some((s) => s.type === "answer")).toBe(true);
  });
});

describe("PeerSession perfect negotiation", () => {
  it("polite peer rolls back and accepts a colliding offer", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("offerer", true, handlers);
    const peer = new PeerSession(config);
    const pc = mockPc();

    await peer.start();
    expect(pc.signalingState).toBe("have-local-offer");

    await peer.handleSignal({
      type: "offer",
      sdp: "remote-offer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-offer-collision",
    });
    expect(pc.rollbackCalls).toBe(1);
    expect(pc.remoteDescription?.sdp).toBe("remote-offer-sdp");
  });

  it("impolite peer ignores a colliding offer", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("offerer", false, handlers);
    const peer = new PeerSession(config);
    const pc = mockPc();

    await peer.start();
    expect(pc.signalingState).toBe("have-local-offer");

    await peer.handleSignal({
      type: "offer",
      sdp: "remote-offer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-offer-collision",
    });
    expect(pc.rollbackCalls).toBe(0);
    expect(pc.remoteDescription).toBeNull();
  });
});

describe("PeerSession ICE recovery", () => {
  it("restarts ICE on failed until the cap, then reports failed", () => {
    vi.useFakeTimers();
    try {
      const handlers = makeHandlers();
      const { config } = makeConfig("answerer", true, handlers);
      const peer = new PeerSession(config);
      const pc = mockPc();

      pc.iceConnectionState = "failed";
      pc.oniceconnectionstatechange?.();
      expect(pc.restartIceCalls).toBe(1);
      expect(lastState(handlers)).toBe("reconnecting");

      pc.iceConnectionState = "failed";
      pc.oniceconnectionstatechange?.();
      expect(pc.restartIceCalls).toBe(2);

      pc.iceConnectionState = "failed";
      pc.oniceconnectionstatechange?.();
      expect(pc.restartIceCalls).toBe(2);
      expect(lastState(handlers)).toBe("failed");

      peer.close();
    } finally {
      vi.useRealTimers();
    }
  });
  it("waits on disconnected, then restarts ICE", () => {
    vi.useFakeTimers();
    try {
      const handlers = makeHandlers();
      const { config } = makeConfig("answerer", true, handlers);
      const peer = new PeerSession(config);
      const pc = mockPc();

      pc.iceConnectionState = "disconnected";
      pc.oniceconnectionstatechange?.();
      expect(lastState(handlers)).toBe("disconnected");
      expect(pc.restartIceCalls).toBe(0);

      vi.advanceTimersByTime(6000);
      expect(pc.restartIceCalls).toBe(1);
      expect(lastState(handlers)).toBe("reconnecting");

      peer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not restart ICE once the connection is healthy", () => {
    vi.useFakeTimers();
    try {
      const handlers = makeHandlers();
      const { config } = makeConfig("answerer", true, handlers);
      const peer = new PeerSession(config);
      const pc = mockPc();
      const channel = new MockDataChannel("ghostchat");
      pc.ondatachannel?.({ channel });
      channel.open();

      pc.iceConnectionState = "disconnected";
      pc.oniceconnectionstatechange?.();

      pc.iceConnectionState = "connected";
      pc.oniceconnectionstatechange?.();
      vi.advanceTimersByTime(6000);
      expect(pc.restartIceCalls).toBe(0);
      expect(lastState(handlers)).toBe("connected");

      peer.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PeerSession data-channel readiness", () => {
  it("ICE alone does not mark the peer ready; the channel open does", () => {
    const handlers = makeHandlers();
    let opened = 0;
    const { config } = makeConfig("answerer", true, handlers);
    config.handlers.onOpen = () => {
      opened += 1;
    };
    const peer = new PeerSession(config);
    const pc = mockPc();

    pc.iceConnectionState = "checking";
    pc.oniceconnectionstatechange?.();
    expect(lastState(handlers)).toBe("connecting");

    pc.iceConnectionState = "connected";
    pc.oniceconnectionstatechange?.();
    expect(lastState(handlers)).toBe("connecting");
    expect(peer.ready).toBe(false);
    expect(opened).toBe(0);

    const channel = new MockDataChannel("ghostchat");
    pc.ondatachannel?.({ channel });
    expect(peer.ready).toBe(false);
    expect(opened).toBe(0);

    channel.open();
    expect(peer.ready).toBe(true);
    expect(opened).toBe(1);

    peer.close();
  });
});

describe("PeerSession candidate pool", () => {
  it("prefetches the default pool size", () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("answerer", true, handlers);
    const peer = new PeerSession(config);
    const pc = mockPc();
    expect(pc.config.iceCandidatePoolSize).toBe(4);
    peer.close();
  });

  it("respects an explicit pool size", () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("answerer", true, handlers);
    const peer = new PeerSession({ ...config, iceCandidatePoolSize: 8 });
    const pc = mockPc();
    expect(pc.config.iceCandidatePoolSize).toBe(8);
    peer.close();
  });
});

describe("PeerSession connection generation", () => {
  it("stamps offers with the session connectionId", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("offerer", true, handlers);
    const peer = new PeerSession(config);
    mockPc();
    await peer.start();
    const offer = handlers.signals.find((s) => s.type === "offer");
    expect(offer).toBeDefined();
    expect(offer?.connectionId).toBe(peer.connectionId);
    peer.close();
  });

  it("answerer adopts the offerer connectionId for its answer", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("answerer", true, handlers);
    const peer = new PeerSession(config);
    mockPc();

    await peer.handleSignal({
      type: "offer",
      sdp: "remote-offer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-offer-adopt",
      connectionId: "conn-offerer-1",
    });
    const answer = handlers.signals.find((s) => s.type === "answer");
    expect(answer).toBeDefined();
    expect(answer?.connectionId).toBe("conn-offerer-1");
    peer.close();
  });

  it("drops ICE candidates from a superseded generation", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("offerer", true, handlers);
    const peer = new PeerSession(config);
    const pc = mockPc();
    await peer.start();

    const current = handlers.signals.find((s) => s.type === "offer")?.connectionId as string;
    expect(current).toBeDefined();

    await peer.handleSignal({
      type: "ice",
      candidate: { candidate: "candidate:stale/1 1 udp 1 host 5.5.5.5 9 typ host" },
      signalId: "sig-ice-stale",
      connectionId: "conn-superseded",
    });
    expect(pc.addIceCandidates).toHaveLength(0);

    await peer.handleSignal({
      type: "answer",
      sdp: "remote-answer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-answer",
      connectionId: current,
    });

    await peer.handleSignal({
      type: "ice",
      candidate: { candidate: "candidate:current/1 1 udp 1 host 6.6.6.6 9 typ host" },
      signalId: "sig-ice-current",
      connectionId: current,
    });
    expect(pc.addIceCandidates).toHaveLength(1);
    peer.close();
  });
});

describe("PeerSession provisional mode (accelerator)", () => {
  it("gathers without negotiating until armed", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("offerer", true, handlers);
    const peer = new PeerSession({ ...config, provisional: true });
    const pc = mockPc();

    expect(peer.provisioned).toBe(true);
    expect(pc.config.iceCandidatePoolSize).toBe(4);
    expect(handlers.signals).toHaveLength(0);
    expect(pc.signalingState).toBe("stable");

    await peer.arm("offerer");
    expect(peer.provisioned).toBe(false);
    expect(pc.signalingState).toBe("have-local-offer");
    expect(handlers.signals.some((s) => s.type === "offer")).toBe(true);
    peer.close();
  });

  it("armed answerer accepts an incoming offer", async () => {
    const handlers = makeHandlers();
    const { config } = makeConfig("answerer", true, handlers);
    const peer = new PeerSession({ ...config, provisional: true });
    mockPc();

    expect(peer.provisioned).toBe(true);
    await peer.arm("answerer");
    expect(peer.provisioned).toBe(false);

    await peer.handleSignal({
      type: "offer",
      sdp: "remote-offer-sdp",
      ephemeralPub: "remote-eph",
      signalId: "sig-offer-provisional",
      connectionId: "conn-remote",
    });
    expect(handlers.signals.some((s) => s.type === "answer")).toBe(true);
    peer.close();
  });
});
