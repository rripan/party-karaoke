import { Captions, Heart, ListMusic, MonitorPlay, QrCode, Smartphone, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ModeStatus } from "@/components/home/mode-status";
import { TvPreview } from "@/components/home/tv-preview";
import { buttonClasses } from "@/components/ui/button";

const STEPS = [
  { icon: QrCode, title: "Scan", text: "The QR code on the TV opens the party on any phone. No app, no account." },
  { icon: ListMusic, title: "Add your song", text: "Search YouTube, pick a karaoke version, and drop it into the shared queue." },
  { icon: Sparkles, title: "Grab the mic", text: "When it's your turn, the TV calls your name and the lyrics roll." },
];

const FEATURES = [
  { icon: MonitorPlay, title: "A real TV mode", text: "Full-screen stage with big readable lyrics, the current singer and who's next." },
  { icon: Captions, title: "Karaoke lyrics, honestly", text: "Karaoke videos show their own words. Licensed timed lyrics sync to the real playback position." },
  { icon: Smartphone, title: "Phones as remotes", text: "Guests see their place in line and get a heads-up when they're almost on." },
  { icon: Heart, title: "Crowd voting", text: "Let the room upvote songs, and decide whether votes reorder the queue." },
  { icon: Trophy, title: "Leaderboard & badges", text: "First to the Mic, Queue Master, Karaoke Legend, Crowd Favorite." },
  { icon: ListMusic, title: "You're the DJ", text: "Drag to reorder, approve requests, skip, replay, and export the night's set list." },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-electric/30 blur-[120px]" />
        <div className="absolute top-20 -right-40 h-[32rem] w-[32rem] rounded-full bg-pink/25 blur-[120px]" />
        <div className="absolute top-[60rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-spark/10 blur-[120px]" />
      </div>

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Party Karaoke home">
          <Logo />
        </Link>
        <Link href="/join" className={buttonClasses("ghost", "sm")}>
          Join a Party
        </Link>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-magenta/30 bg-magenta/10 px-3.5 py-1.5 text-sm font-semibold text-[#f5c2ff]">
            🎤 Karaoke for house parties, birthdays & group nights
          </p>
          <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl xl:text-7xl">
            Your Party. Your Playlist. <span className="text-gradient">Your Stage.</span>
          </h1>
          <p className="mt-6 max-w-xl text-xl text-muted sm:text-2xl">Scan. Add your song. Grab the mic.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/create" className={buttonClasses("primary", "xl")} data-testid="start-party">
              Start a Karaoke Party
            </Link>
            <Link href="/join" className={buttonClasses("secondary", "xl")}>
              Join a Party
            </Link>
          </div>
          <p className="mt-5 text-sm text-faint">No app to install. No accounts. Guests just scan the QR code on your TV.</p>
        </div>
        <TvPreview joinUrl="https://example.com/join" />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8" aria-labelledby="how">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative overflow-hidden p-6">
              <span className="absolute -top-4 -right-1 font-display text-8xl font-extrabold text-white/[0.04]" aria-hidden>
                {i + 1}
              </span>
              <s.icon className="h-8 w-8 text-magenta" aria-hidden />
              <h3 className="mt-4 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-1.5 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8" aria-labelledby="features">
        <h2 id="features" className="font-display text-3xl font-extrabold sm:text-4xl">
          Spotify meets Jackbox meets <span className="text-gradient">a real karaoke machine</span>
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-[var(--radius-card)] p-6">
              <f.icon className="h-6 w-6 text-spark" aria-hidden />
              <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-faint sm:px-8">
          <ModeStatus />
          <p className="max-w-3xl">
            Songs are found and played through YouTube&apos;s official APIs and embedded player, so ads and availability follow YouTube&apos;s rules. YouTube videos
            don&apos;t come with separate timed lyrics: karaoke videos show their own on-screen words, and synced lyrics need a licensed lyrics provider.
          </p>
        </div>
      </footer>
    </main>
  );
}
