"use client";

import type { SettingsPatch } from "@/lib/domain/settings";
import type { PartySettings } from "@/lib/domain/types";
import { Field, Segmented, Stepper, Switch } from "@/components/ui/controls";

export function PartyRulesForm({ settings, onChange }: { settings: PartySettings; onChange: (patch: SettingsPatch) => void }) {
  return (
    <div className="divide-y divide-line">
      <Switch label="Song submissions open" description="Guests can add songs to the queue." checked={settings.submissionsOpen} onChange={(v) => onChange({ submissionsOpen: v })} />
      <Switch label="Require host approval" description="New songs wait for your OK before joining the queue." checked={settings.requireApproval} onChange={(v) => onChange({ requireApproval: v })} />
      <Field label="Song voting" hint={VOTING_HINT[settings.votingMode]}>
        <Segmented
          label="Song voting"
          value={settings.votingMode}
          onChange={(v) => onChange({ votingMode: v })}
          options={[
            { value: "off", label: "Off" },
            { value: "display", label: "Show votes" },
            { value: "reorder", label: "Votes reorder" },
            { value: "requests", label: "Votes rank requests" },
          ]}
        />
      </Field>
      <Field label="Max waiting songs per guest" hint="Counts songs that are queued or pending approval.">
        <Stepper label="max waiting songs" value={settings.maxPendingPerGuest} min={1} max={20} onChange={(v) => onChange({ maxPendingPerGuest: v })} />
      </Field>
      <Switch label="Guests can remove their own songs" description="Only songs that haven't started yet." checked={settings.allowGuestRemoval} onChange={(v) => onChange({ allowGuestRemoval: v })} />
      <Switch label="Prevent duplicate songs" description="Block a video that's already waiting or playing." checked={settings.preventDuplicates} onChange={(v) => onChange({ preventDuplicates: v })} />
      <Switch label="Auto-advance" description="Start the next singer automatically when a song ends." checked={settings.autoAdvance} onChange={(v) => onChange({ autoAdvance: v })} />
      <Field label="Fallback song length" hint="Used for wait-time estimates when a video has no duration info.">
        <Stepper label="fallback song length" value={settings.fallbackDurationSeconds} min={60} max={900} step={30} format={(v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} onChange={(v) => onChange({ fallbackDurationSeconds: v })} />
      </Field>
      <Switch label="QR code during performances" description="Keep a small join code on the TV while someone sings." checked={settings.showQrDuringPerformance} onChange={(v) => onChange({ showQrDuringPerformance: v })} />
    </div>
  );
}

const VOTING_HINT: Record<PartySettings["votingMode"], string> = {
  off: "No voting.",
  display: "Guests can upvote; the order stays as you set it.",
  reorder: "Most-voted songs move up. The next song and songs you pin stay put.",
  requests: "Votes rank songs awaiting approval, so you can see what the crowd wants.",
};

export function DisplaySettingsForm({ settings, onChange }: { settings: PartySettings; onChange: (patch: SettingsPatch) => void }) {
  const d = settings.display;
  return (
    <div className="divide-y divide-line">
      <Field label="Stage layout" hint="Auto: karaoke videos play full-screen; songs with separate lyrics get a split view.">
        <Segmented
          label="Stage layout"
          value={d.layout}
          onChange={(v) => onChange({ display: { layout: v } })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "video", label: "Video" },
            { value: "split", label: "Video + lyrics" },
            { value: "lyrics", label: "Lyrics focus" },
          ]}
        />
      </Field>
      <Field label="Lyrics text size">
        <Segmented
          label="Lyrics text size"
          value={d.textSize}
          onChange={(v) => onChange({ display: { textSize: v } })}
          options={[
            { value: "m", label: "M" },
            { value: "l", label: "L" },
            { value: "xl", label: "XL" },
            { value: "xxl", label: "XXL" },
          ]}
        />
      </Field>
      <Field label="Background">
        <Segmented
          label="Background"
          value={d.background}
          onChange={(v) => onChange({ display: { background: v } })}
          options={[
            { value: "aurora", label: "Aurora" },
            { value: "midnight", label: "Midnight" },
            { value: "sunset", label: "Sunset" },
          ]}
        />
      </Field>
      <Switch label="Show the next lyric line" checked={d.showNextLine} onChange={(v) => onChange({ display: { showNextLine: v } })} />
      <Switch label="Show QR code on the TV" checked={d.showQr} onChange={(v) => onChange({ display: { showQr: v } })} />
    </div>
  );
}
