"use client";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(freq: number, start: number, duration: number, gainValue: number): void {
  const context = getContext();
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime + start;
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSendSound(): void {
  blip(620, 0, 0.09, 0.05);
  blip(880, 0.06, 0.1, 0.045);
}

export function playReceiveSound(): void {
  blip(880, 0, 0.09, 0.05);
  blip(620, 0.06, 0.1, 0.045);
}

export function playReactSound(): void {
  blip(740, 0, 0.08, 0.04);
}

/** Must be called once on a user gesture so the AudioContext is allowed to run. */
export function unlockAudio(): void {
  getContext();
}

let ringTimer: ReturnType<typeof setInterval> | null = null;

/** Loops a ring pattern until stopRingtone() is called. */
export function playRingtone(): void {
  stopRingtone();
  let burst = false;
  ringTimer = setInterval(() => {
    burst = !burst;
    if (!burst) return;
    blip(659, 0, 0.18, 0.07);
    blip(659, 0.2, 0.18, 0.07);
    blip(659, 0.4, 0.18, 0.07);
  }, 1000);
}

export function stopRingtone(): void {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}
