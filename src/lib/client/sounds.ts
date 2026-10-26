"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Optional sound effects. Muted by default; the preference is per device. */
const KEY = "kp-sound-effects";

let ctx: AudioContext | null = null;

export function playChime() {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.55);
    });
  } catch {
    /* audio unavailable */
  }
}

const listeners = new Set<() => void>();
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useSoundPreference() {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
    if (next) playChime();
  }, []);
  return { soundOn: on, toggleSound: toggle };
}
