"use client";

import { Check, Copy, Download, Maximize2, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { downloadQrPng, QrCode } from "./qr-code";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for http:// LAN origins where the async clipboard is unavailable.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function InviteCard({ joinUrl, joinCode, partyName, guestCount, notice }: { joinUrl: string; joinCode: string; partyName: string; guestCount: number; notice?: string | null }) {
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const slug = partyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="card flex flex-col gap-3 p-4" data-testid="invite-card">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => setBig(true)} className="group relative shrink-0 rounded-xl" aria-label="Enlarge QR code">
          <QrCode value={joinUrl} className="h-24 w-24" label={`QR code to join ${partyName}`} />
          <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="h-6 w-6" aria-hidden />
          </span>
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-faint uppercase">Join code</p>
          <p className="font-display text-3xl font-extrabold tracking-[0.18em]" data-testid="join-code">
            {joinCode}
          </p>
          <p className="truncate text-xs text-muted" title={joinUrl} data-testid="join-url">
            {joinUrl.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-text">{guestCount}</span> guest{guestCount === 1 ? "" : "s"} joined
          </p>
        </div>
      </div>
      {notice ? <p className="rounded-xl border border-spark/25 bg-spark/10 px-3 py-2 text-xs text-spark">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            if (await copy(joinUrl)) {
              setCopied(true);
              toast({ title: "Invite link copied", tone: "success" });
              setTimeout(() => setCopied(false), 1800);
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} Copy link
        </Button>
        <Button size="sm" variant="secondary" onClick={() => downloadQrPng(joinUrl, `${slug}-qr.png`)}>
          <Download className="h-4 w-4" aria-hidden /> QR
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setBig(true)}>
          <Maximize2 className="h-4 w-4" aria-hidden /> Enlarge
        </Button>
      </div>
      <Dialog open={big} onClose={() => setBig(false)} title={`Join ${partyName}`} description="Point your phone camera at the code." size="lg">
        <div className="flex flex-col items-center gap-4">
          <QrCode value={joinUrl} className="w-full max-w-md" label={`QR code to join ${partyName}`} />
          <p className="font-display text-4xl font-extrabold tracking-[0.25em]">{joinCode}</p>
          <p className="text-center text-muted">{joinUrl}</p>
        </div>
      </Dialog>
    </div>
  );
}

/** Secret link that lets the host run the party from another device. */
export function HostRemoteButton({ partyId }: { partyId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            const res = await api<{ url: string }>(`/api/parties/${partyId}/host-keys`, { method: "POST" });
            setUrl(res.url);
            setOpen(true);
          } catch (e) {
            toast({ title: "Couldn't create a host link", description: (e as Error).message, tone: "error" });
          }
        }}
      >
        <Smartphone className="h-4 w-4" aria-hidden /> Control from phone
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Host remote control" description="Anyone with this code gets host controls. Only scan it with your own phone." size="sm">
        {url ? (
          <div className="flex flex-col items-center gap-3">
            <QrCode value={url} className="w-64" label="Host remote control QR code" />
            <Button size="sm" variant="secondary" onClick={() => copy(url).then(() => toast({ title: "Host link copied", tone: "success" }))}>
              <Copy className="h-4 w-4" aria-hidden /> Copy host link
            </Button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
