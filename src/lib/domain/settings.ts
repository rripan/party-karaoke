import { z } from "zod";
import type { PartySettings } from "./types";

export const DEFAULT_SETTINGS: PartySettings = {
  submissionsOpen: true,
  requireApproval: false,
  votingMode: "display",
  maxPendingPerGuest: 3,
  allowGuestRemoval: true,
  autoAdvance: true,
  preventDuplicates: true,
  fallbackDurationSeconds: 240,
  showQrDuringPerformance: true,
  display: {
    layout: "auto",
    textSize: "l",
    background: "aurora",
    showNextLine: true,
    showQr: true,
  },
};

export const displaySettingsSchema = z.object({
  layout: z.enum(["auto", "video", "split", "lyrics"]),
  textSize: z.enum(["m", "l", "xl", "xxl"]),
  background: z.enum(["aurora", "midnight", "sunset"]),
  showNextLine: z.boolean(),
  showQr: z.boolean(),
});

export const settingsSchema = z.object({
  submissionsOpen: z.boolean(),
  requireApproval: z.boolean(),
  votingMode: z.enum(["off", "display", "reorder", "requests"]),
  maxPendingPerGuest: z.number().int().min(1).max(20),
  allowGuestRemoval: z.boolean(),
  autoAdvance: z.boolean(),
  preventDuplicates: z.boolean(),
  fallbackDurationSeconds: z.number().int().min(60).max(900),
  showQrDuringPerformance: z.boolean(),
  display: displaySettingsSchema,
});

export const settingsPatchSchema = settingsSchema
  .omit({ display: true })
  .partial()
  .extend({ display: displaySettingsSchema.partial().optional() })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function mergeSettings(base: PartySettings, patch: SettingsPatch | undefined): PartySettings {
  if (!patch) return base;
  const { display, ...rest } = patch;
  return {
    ...base,
    ...rest,
    display: { ...base.display, ...(display ?? {}) },
  };
}

export const PARTY_NAME_SUGGESTIONS = [
  "Friday Night Karaoke",
  "Birthday Bash",
  "The Living Room Tour",
  "Main Character Mic Night",
];

export const AVATARS = [
  "🎤", "🎸", "🎹", "🥁", "🎷", "🎺", "🪩", "🌟",
  "🔥", "🦄", "🐙", "🦊", "🐸", "🐼", "👽", "🤖",
  "👑", "💖", "🌈", "🍕", "🌮", "🍩", "🦋", "🌙",
] as const;
