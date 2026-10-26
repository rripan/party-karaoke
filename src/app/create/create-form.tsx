"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { PartyRulesForm } from "@/components/party/settings-form";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS, mergeSettings, PARTY_NAME_SUGGESTIONS, type SettingsPatch } from "@/lib/domain/settings";
import { api, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";

export function CreatePartyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [patch, setPatch] = useState<SettingsPatch>({});
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (p: SettingsPatch) => {
    setSettings((s) => mergeSettings(s, p));
    setPatch((prev) => ({ ...prev, ...p }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ partyId: string }>("/api/parties", { json: { name: name.trim() || "Friday Night Karaoke", settings: patch } });
      router.push(`/host/${res.partyId}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't create the party.");
      setBusy(false);
    }
  };

  return (
    <main className="stage-bg-aurora min-h-dvh px-5 py-6 sm:px-8">
      <nav className="mx-auto flex max-w-2xl items-center justify-between">
        <Link href="/" aria-label="Party Karaoke home">
          <Logo />
        </Link>
      </nav>
      <form onSubmit={submit} className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          Start a <span className="text-gradient">karaoke party</span>
        </h1>
        <p className="mt-3 text-lg text-muted">Name it, set the house rules, and your TV gets a QR code for guests.</p>

        <div className="card mt-8 p-5 sm:p-6">
          <label htmlFor="party-name" className="font-semibold">
            Party name
          </label>
          <input
            id="party-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday Night Karaoke"
            className="mt-2 h-14 w-full rounded-2xl border border-line-strong bg-black/30 px-4 text-lg placeholder:text-faint focus:border-magenta/60 focus:outline-none"
            data-testid="party-name-input"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {PARTY_NAME_SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setName(s)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors", name === s ? "border-magenta/60 bg-magenta/15 text-text" : "border-line text-muted hover:text-text")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="card mt-4 p-5 sm:p-6">
          <button type="button" onClick={() => setShowRules((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={showRules}>
            <span>
              <span className="block font-semibold">Party rules</span>
              <span className="text-sm text-muted">
                {settings.requireApproval ? "Host approval on" : "No approval needed"} · voting {settings.votingMode === "off" ? "off" : "on"} · {settings.maxPendingPerGuest} songs per guest · auto-advance{" "}
                {settings.autoAdvance ? "on" : "off"}
              </span>
            </span>
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", showRules && "rotate-180")} aria-hidden />
          </button>
          {showRules ? (
            <div className="mt-4">
              <PartyRulesForm settings={settings} onChange={change} />
              <p className="mt-3 text-sm text-faint">You can change any of these later from the host dashboard.</p>
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="xl" className="mt-6 w-full" loading={busy} data-testid="create-party">
          <Sparkles className="h-5 w-5" aria-hidden /> Launch the party
        </Button>
        <p className="mt-3 text-center text-sm text-faint">This browser becomes the host. Keep it open on the laptop connected to your TV.</p>
      </form>
    </main>
  );
}
