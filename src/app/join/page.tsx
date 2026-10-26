"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/client/api";

export default function JoinByCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/parties/lookup?code=${clean}`);
      router.push(`/p/${clean}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't find that party.");
      setBusy(false);
    }
  };

  return (
    <main className="stage-bg-aurora flex min-h-dvh flex-col items-center px-5 py-8">
      <Link href="/" aria-label="Party Karaoke home">
        <Logo />
      </Link>
      <form onSubmit={submit} className="mt-16 w-full max-w-sm text-center">
        <h1 className="font-display text-3xl font-extrabold">Join a party</h1>
        <p className="mt-2 text-muted">Scan the QR code on the TV, or type the 6-character code.</p>
        <label htmlFor="join-code" className="sr-only">
          Party code
        </label>
        <input
          id="join-code"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          placeholder="ABC123"
          className="mt-8 h-20 w-full rounded-3xl border border-line-strong bg-black/30 text-center font-display text-4xl font-extrabold tracking-[0.3em] uppercase placeholder:text-white/15 focus:border-magenta/60 focus:outline-none"
        />
        {error ? (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="xl" className="mt-6 w-full" disabled={clean.length !== 6} loading={busy}>
          Find the party
        </Button>
      </form>
    </main>
  );
}
