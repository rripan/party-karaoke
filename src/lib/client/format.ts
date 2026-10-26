export function formatClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "–:––";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatWait(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  if (seconds < 45) return "Up next";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `~${h}h ${minutes % 60}m`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
