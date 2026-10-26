import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Unbounded } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Unbounded({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "700", "800"] });
const ui = Plus_Jakarta_Sans({ variable: "--font-ui-face", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Party Karaoke — Your Party. Your Playlist. Your Stage.", template: "%s · Party Karaoke" },
  description: "Turn any TV into a karaoke stage. Guests scan a QR code, add songs from YouTube, and grab the mic.",
};

export const viewport: Viewport = {
  themeColor: "#06030d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
