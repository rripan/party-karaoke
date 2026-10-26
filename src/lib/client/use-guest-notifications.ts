"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import type { PartySnapshot } from "@/lib/domain/snapshot";

/** How many songs are ahead of the guest's next song (including the one on stage). */
export function songsAhead(snapshot: PartySnapshot): number | null {
  const index = snapshot.upcoming.findIndex((q) => q.isMine);
  if (index < 0) return null;
  return index + (snapshot.nowPlaying ? 1 : 0);
}

/**
 * In-app notifications derived from snapshot changes. Each (song, event)
 * fires once — remembered for the session so refreshes don't repeat them.
 */
export function useGuestNotifications(snapshot: PartySnapshot | null) {
  const { toast } = useToast();
  const prev = useRef<PartySnapshot | null>(null);

  useEffect(() => {
    if (!snapshot || snapshot.me.role !== "guest") return;
    const store = sessionKey(snapshot.party.id);
    const fired = load(store);
    const once = (key: string, fn: () => void) => {
      if (fired.has(key)) return;
      fired.add(key);
      save(store, fired);
      fn();
    };
    const before = prev.current;
    prev.current = snapshot;

    const playing = snapshot.nowPlaying;
    if (playing?.isMine) {
      once(`playing:${playing.id}`, () => {
        toast({ title: "Your song is playing! Grab the mic 🎤", description: playing.song.title, tone: "party", durationMs: 6000 });
        navigator.vibrate?.([120, 60, 120]);
      });
    }
    const ahead = songsAhead(snapshot);
    const mine = snapshot.upcoming.find((q) => q.isMine);
    if (mine && snapshot.upcoming[0]?.id === mine.id) {
      once(`next:${mine.id}`, () => {
        toast({ title: "You're up next! 🎤", description: "Get ready — warm up those vocal cords.", tone: "party", durationMs: 6000 });
        navigator.vibrate?.(200);
      });
    } else if (mine && ahead === 3) {
      once(`three:${mine.id}`, () => toast({ title: "You're three songs away!", tone: "info" }));
    }
    if (!before) return;
    for (const item of snapshot.mine) {
      const old = before.mine.find((m) => m.id === item.id);
      if (!old || old.status === item.status) continue;
      if (old.status === "pending_approval" && item.status === "queued") once(`approved:${item.id}`, () => toast({ title: "The host approved your song.", description: item.song.title, tone: "success" }));
      if (item.status === "rejected") once(`rejected:${item.id}`, () => toast({ title: "The host passed on this one", description: item.song.title, tone: "warning" }));
      if (item.status === "removed" && item.statusReason !== "guest_removed") once(`removed:${item.id}`, () => toast({ title: "The host removed your song", description: item.song.title, tone: "warning" }));
    }
    if (before.party.settings.submissionsOpen && !snapshot.party.settings.submissionsOpen) toast({ title: "The queue is paused.", description: "The host paused new songs for now.", tone: "warning", key: "paused" });
    if (!before.party.settings.submissionsOpen && snapshot.party.settings.submissionsOpen) toast({ title: "The queue is open again!", tone: "success", key: "open" });
  }, [snapshot, toast]);
}

const sessionKey = (partyId: string) => `kp-notified-${partyId}`;
function load(key: string): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function save(key: string, set: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set].slice(-200)));
  } catch {
    /* ignore */
  }
}
