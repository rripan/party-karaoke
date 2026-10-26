"use client";

import QRCode from "qrcode";
import { useMemo } from "react";
import { cn } from "@/lib/client/cn";

/**
 * Renders a QR code as crisp SVG. Always dark-on-white with a full quiet zone,
 * which is what phone cameras scan most reliably from across a room.
 */
export function QrCode({ value, className, label }: { value: string; className?: string; label?: string }) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    let d = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qr.modules.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { d, size: size + 8 };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label ?? `QR code linking to ${value}`}
      data-qr-value={value}
      shapeRendering="crispEdges"
      className={cn("block rounded-xl bg-white", className)}
    >
      <rect width={path.size} height={path.size} fill="#ffffff" />
      <path d={path.d} fill="#0b0614" />
    </svg>
  );
}

export async function downloadQrPng(value: string, filename: string) {
  const url = await QRCode.toDataURL(value, { errorCorrectionLevel: "M", width: 1024, margin: 4, color: { dark: "#0b0614", light: "#ffffff" } });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
