# 🎤 Party Karaoke

**Your Party. Your Playlist. Your Stage.** — Scan. Add your song. Grab the mic.

A real-time karaoke web app for house parties. The host opens it on a laptop
connected to a TV; a QR code appears on screen; guests scan it, pick a stage
name, search YouTube and add songs to a shared queue. When it's someone's
turn, the TV announces them, plays the video and — when an authorised source
exists — shows big, synchronised lyrics.

- **Host dashboard** (`/host/:id`) — the stage preview with live controls (play/pause, restart, ±10 s, seek, skip,
  mark as finished, report unavailable), a drag-and-drop queue, approvals, guests, history (replay + CSV/JSON export),
  leaderboard, party settings, and an in-page **TV mode**.
- **TV display** (`/tv/:id`) — a dedicated full-screen stage window. When it's open, the dashboard becomes a remote,
  so only one screen plays.
- **Guest app** (`/p/:code`) — mobile-first, no account. It has three tabs: **Search**, **Queue** (with voting) and
  **My Songs**, plus "you're up next" notifications.

---

## Contents

1. [Quick start (demo mode)](#quick-start-demo-mode)
2. [How it works](#how-it-works)
3. [Environment variables](#environment-variables)
4. [Supabase setup](#supabase-setup)
5. [YouTube API setup](#youtube-api-setup)
6. [Lyrics: what's supported and licensing](#lyrics-whats-supported-and-licensing)
7. [Running a party (TV tips)](#running-a-party-tv-tips)
8. [Testing](#testing)
9. [Deployment (Vercel + Supabase)](#deployment-vercel--supabase)
10. [Security & privacy](#security--privacy)
11. [Known limitations](#known-limitations)

---

## Quick start (demo mode)

Requirements: Node.js 20.9+ (tested on 22).

```bash
npm install
npm run dev            # http://localhost:3000 (listens on all interfaces)
```

1. Open `http://localhost:3000` on the laptop and click **Start a Karaoke Party**.
2. The dashboard shows a QR code. If you opened `localhost`, the QR code automatically uses the laptop's network
   address (for example `http://192.168.1.20:3000`) so phones on the same Wi-Fi can reach it. A note in the dashboard
   tells you which address it chose.
3. Scan it with a phone, pick a name and an emoji, and add songs.
4. Press **Start the Show**, or **TV mode** / **TV window** for the big screen.

With no credentials configured, the app runs in a clearly labelled **demo mode**:

| Feature | Demo mode | With credentials |
| --- | --- | --- |
| Song search | Bundled **sample catalog** (12 tracks), labelled "Sample" and "Demo mode · sample songs" | Live YouTube Data API v3 search |
| Pasting a YouTube link | Works. It's verified via YouTube's official keyless oEmbed endpoint, so the server needs internet access | Verified via the Data API (embeddable, privacy, region) |
| Playback | Sample tracks play as a **simulated stage** labelled "Simulated playback · sample track · no audio". Real YouTube links play in the official player | Official YouTube IFrame player |
| Lyrics | Sample tracks only (original CC0 lyrics written for this app, or public-domain songs) | Plus any licensed provider you configure |
| Storage | In memory, snapshotted to `.data/karaoke-local.json` on this server | Supabase Postgres |
| Realtime | Server-Sent Events from this server | Supabase Realtime Broadcast |

Demo mode is fully multi-device on your local network: guests' phones, the host laptop and a TV window all stay in
sync through the one Node process. It does **not** work on serverless hosting (Vercel), where requests may land on
different instances. Configure `DATABASE_URL` + Supabase for that.

The sample catalog exercises all four lyrics cases:

- A **karaoke video** with lyrics inside the picture (*Main Character Energy (Karaoke Version)*,
  *Friday Night Frequency (Karaoke Version)*).
- **Synced lyrics**: word-level (*Neon Heartbeat*, *Glitter on the Ceiling*, *Twinkle Twinkle*, *Row Your Boat*) and
  line-level (*Happy Birthday*, *Living Room Tour*, *Auld Lang Syne*, *Take Me Out to the Ball Game*).
- **Plain, unsynchronised lyrics** (*Amazing Grace*).
- **No lyrics** (*Synthwave Sunset (Instrumental)*).

The sample timings define the simulated tracks themselves. They are never applied to real YouTube videos.

---

## How it works

```
 Phones (guests)          Host laptop (dashboard)          TV window (optional)
   /p/CODE                  /host/:id  ── output? ──┐         /tv/:id
      │                         │                    └── one screen runs the real player
      │   HTTPS JSON commands   │   player reports (playing/paused/ended/error/blocked)
      └──────────────┬──────────┴───────────────────────────────┘
                     ▼
        Next.js route handlers  (auth: hashed tokens in httpOnly cookies)
                     │
           PartyService ── pure domain logic (src/lib/domain) ── one source of rules
                     │
        PartyStore.mutate(partyId, fn)   ← exclusive per party:
          • MemoryStore:   synchronous in one Node process (+ JSON snapshot)
          • PostgresStore: transaction + SELECT … FOR UPDATE on the party row, then a row-level diff
                     │
        publish { version }  →  SSE  or  Supabase Realtime Broadcast
                     ▼
        clients refetch their own role-filtered snapshot (no secrets in broadcasts)
```

**Key design decisions**

- **One rulebook.** All party rules (limits, duplicates, approvals, voting order, playback, history, badges) live in
  pure functions in `src/lib/domain/party-logic.ts`. They're unit-tested and shared by both storage adapters.
- **Transaction-safe queue.** Each mutation loads one party's aggregate under an exclusive lock, applies the rule and
  writes only the changed rows. Simultaneous submissions can't lose entries or collide on positions. The tests cover
  this for both stores, including real Postgres.
- **Honest playback state.** The server stores an authoritative playback record: a position anchored to a timestamp,
  plus a numbered command. Exactly one screen is the "output". It applies each command once and reports what the
  player *actually* did. The server never assumes a song finished because a timer ran out: only the player's `ended`
  event (or the host) completes it. After a reload the stage shows **Resume from 1:23** instead of claiming playback
  continued.
- **Lyrics follow the real player.** The lyrics view reads `player.getCurrentTime()` every animation frame. It only
  interpolates between reads while the player reports PLAYING (capped at 1 s). So pause, seek, buffering, restarts and
  reconnects all stay in sync. Word highlighting is used only when the source supplies word timestamps.
- **YouTube rules respected.** The app uses the official IFrame API and never overlays, hides or restyles a playing
  video. Lyrics sit *beside* the player in the split and lyrics layouts. Ads, embedding restrictions and autoplay
  policies are left alone. If the browser blocks autoplay, a big **Play Next Song** button appears.

Project layout:

```
src/
  app/                    pages (/, /create, /join, /p/[code], /host/[partyId], /tv/[partyId]) + API routes
  components/
    stage/                Stage, YouTube + simulated players, lyrics display
    party/                queue (dnd-kit), song search, QR, settings, leaderboard, history, invite…
    ui/                   button, dialog (native <dialog>), switch, segmented, toast, states
  lib/
    domain/               types, settings, commands (zod), party-logic, snapshot (+ badges/estimates)
    server/               env, auth, rate limit, origin/LAN detection, realtime, party-service, store/*
    youtube/              URL validation, metadata classification, Data API + oEmbed service
    lyrics/               LRC parser, provider interface + providers, service (in-memory cache only)
    player/               player handle interface, IFrame API loader, media clock
    client/               data hooks (snapshot + realtime), stage output controller, notifications
    demo/                 sample catalog (original CC0 / public-domain lyrics)
supabase/migrations/      SQL schema, constraints, indexes, RLS
tests/unit/               Vitest: domain, parsers, search (mocked API), lyrics, stores (+ Postgres), service
tests/e2e/                Playwright: full party journeys
```

---

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional; leave them empty for demo mode.

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | server only | Enables live YouTube search. Never sent to the browser. |
| `YOUTUBE_REGION_CODE` | server only | Optional, e.g. `US`. Filters region-blocked videos. |
| `DATABASE_URL` | server only | Postgres connection string (Supabase). Enables the Postgres store. |
| `DATABASE_SSL` | server only | Set to `disable` only for a local Postgres without TLS. |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL (for Realtime). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public anon key, used only to *listen* to Realtime Broadcast. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Used only to *send* Realtime Broadcast messages. Never exposed. |
| `APP_URL` | server | Public URL in QR codes and links, e.g. `https://karaoke.example.com`. Recommended in production. |
| `CRON_SECRET` | server | Protects `/api/cron/cleanup` (Vercel Cron sends it as a Bearer token). |
| `PARTY_TTL_HOURS` | server | Idle parties expire after this long (default 24). |
| `HISTORY_RETENTION_DAYS` | server | Ended parties are deleted this long after ending (default 7). |
| `LYRICS_DATASET_DIR` | server | Directory of licensed lyrics files. See [Lyrics](#lyrics-whats-supported-and-licensing). |
| `LYRICS_PROVIDER_URL`, `LYRICS_PROVIDER_API_KEY`, `LYRICS_PROVIDER_NAME` | server | A licensed lyrics HTTP endpoint you operate or contract. |
| `DATA_DIR` | server | Where local mode keeps its JSON snapshot (default `.data`). |

Realtime uses Supabase only when all three Supabase variables are set. Otherwise it falls back to Server-Sent Events.

---

## Supabase setup

1. Create a Supabase project.
2. Apply the schema in `supabase/migrations/20261026000000_party_karaoke.sql`, using either:
   - the Supabase CLI: `supabase link --project-ref <ref> && supabase db push`, or
   - the bundled runner: `DATABASE_URL=… npm run db:migrate` (it tracks applied files in `app_migrations`), or
   - the SQL editor: paste the file and run it.
3. **Connection string.** Project Settings → Database → Connection string.
   - On Vercel, use the **Transaction pooler** URI (port `6543`). The app disables prepared statements for it.
   - On a long-running server you can use the direct connection.
4. **Realtime.** Copy the Project URL and anon key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY`.
   - The app uses **public Broadcast channels** named `party:<uuid>`. In Realtime settings, make sure public
     channels aren't disabled.
   - Messages only carry `{ version }`. Clients then refetch their own snapshot over HTTPS, so a listener learns nothing
     beyond "something changed".

**Schema & security model**

- **Tables:** `party_sessions`, `participants`, `songs`, `queue_items`, `playback_state`, `song_history`, `votes` and
  `lyrics_metadata`.
- **Integrity:**
  - Foreign keys with cascades.
  - A unique live join code.
  - Unique `(queue_item_id, participant_id)` on votes, so nobody can vote twice for the same song.
  - At most one `playing` item per party.
  - Hashed tokens only.
  - Check constraints on statuses and video ID format.
  - Indexes for queue order, activity and cleanup.
- **RLS:** row-level security is enabled on every table with **no policies**, and the default grants for
  `anon`/`authenticated` are revoked. The anon key can read or write nothing; all access goes through the server,
  which enforces host/guest permissions.
- **No lyric text:** `lyrics_metadata` stores availability, provider and licensing reference only, never lyric text.

---

## YouTube API setup

1. In Google Cloud Console, create or select a project and enable **YouTube Data API v3**.
2. Create an **API key**:
   - Restrict it to *YouTube Data API v3*.
   - Because the key is only used server-side, prefer an **IP address** restriction where your host allows it.
     Don't use an HTTP-referrer restriction; the server calls the API, not the browser.
3. Set `YOUTUBE_API_KEY` (optionally `YOUTUBE_REGION_CODE`).

**How it's used**

- **Calls per search:** `search.list` with `type=video&videoEmbeddable=true&safeSearch=moderate`, then `videos.list`
  for duration, embeddability, privacy, live status and region restrictions. Unplayable videos are filtered out.
- **Filters:** "Karaoke versions" appends *karaoke* to the query and ranks karaoke-titled videos first. "Lyrics videos"
  appends *lyrics*, and "Official videos" appends *official music video*. "Popular" and "Recently added" sort by view
  count and upload date.
- **Badges** come only from real metadata (title and channel). The tooltip says why, e.g. *Title mentions
  "karaoke"*. Nothing is labelled a karaoke version unless its metadata says so.
- **Quota:** each search costs ~101 units against the default 10,000/day, so roughly 100 searches a day. The app
  debounces typing (450 ms), caches results for 15 minutes and rate-limits per guest.
  - When quota runs out, guests see *"YouTube search is resting… paste a YouTube link instead"*. Links are resolved
    with `videos.list`, which costs 1 unit.
- **Errors:** private, deleted, embedding-disabled, region-blocked and live videos are rejected with specific
  messages. Player errors (`2`, `5`, `100`, `101`/`150`, `153`) show an explanation with **Choose another version**
  and **Skip** buttons, and the rest of the queue is untouched.

---

## Lyrics: what's supported and licensing

YouTube does **not** supply timed lyrics for videos, and the app never invents them. The stage chooses, in order:

1. **Karaoke video with lyrics in the picture.** Detected from its title or channel and labelled "Lyrics in video". It
   plays full-screen with no second overlay.
2. **Licensed synced lyrics** from a configured provider. They're shown large, beside the video, synced to the real
   player position. Highlighting is word-by-word when word timestamps exist, otherwise line-by-line.
3. **Licensed plain lyrics.** Shown with an explicit **"Lyrics · not synchronised"** label.
4. **Nothing available.** The video plays, and the stage says *"Separate lyrics unavailable"*. The host can pick
   another version (often a karaoke upload).

Unavailable lyrics never block adding or playing a song, and a provider outage only shows "Lyrics service unavailable".

**Integrated providers** (`src/lib/lyrics/providers.ts`, behind a `LyricsProvider` interface):

| Provider | Enabled | What it serves |
| --- | --- | --- |
| `SampleLyricsProvider` | always | The bundled demo tracks only: original lyrics (CC0) and public-domain songs. |
| `LicensedDatasetProvider` | `LYRICS_DATASET_DIR` | `<youtubeVideoId>.json` files **you are licensed to display**, timed for that exact video. |
| `LicensedHttpProvider` | `LYRICS_PROVIDER_URL` | A licensed lyrics API you operate or contract (or a thin proxy in front of one). |

Both licensed providers use this JSON contract. `license` is **required**, and entries without it are ignored:

```json
{
  "videoId": "dQw4w9WgXcQ",
  "license": "Licensed from <provider>, agreement #1234 — display only",
  "attribution": "Lyrics © <publisher>",
  "lrc": "[00:12.30]First line\n[00:15.80]<00:15.80>Word <00:16.20>level <00:16.70>works<00:17.40>",
  "plain": "Optional untimed lyrics",
  "offsetMs": 0
}
```

The HTTP provider is called as `GET LYRICS_PROVIDER_URL?videoId=…&title=…&artist=…&durationSeconds=…` with
`Authorization: Bearer LYRICS_PROVIDER_API_KEY`. It returns `404` when it has no lyrics, and times out after 3.5 s.

**Why no public lyrics site is integrated**

- Free sources such as crowd-sourced LRC databases, or sites that only host lyrics pages, don't grant a licence to
  display copyrighted lyrics.
- Scraping is off the table.
- Commercial providers (for example Musixmatch or LyricFind) offer synced and word-level lyrics under a paid
  agreement. Wire one up through `LicensedHttpProvider` once you have a contract that covers your use.
- Remember that **timestamps must match the specific recording or video**. A provider keyed to the audio track
  needs an offset or a match step for a given YouTube upload. `offsetMs` exists for that.

Lyric text is cached in memory only (1 h) and served to party members for songs in their party, so the app can't
become an open lyrics proxy. It is never written to the database.

---

## Running a party (TV tips)

- **Single laptop on the TV (simplest):** connect HDMI and mirror the display. Open the dashboard and press
  **TV mode** (or `F`). The stage goes full screen; move the mouse to reveal play/pause, skip and exit. `Space` toggles
  play/pause and `Esc` exits.
- **Laptop + TV as a second display:** press **TV window**, drag the window to the TV and click
  **Start the TV screen**. That click unlocks autoplay with sound. The TV window becomes the output, and the dashboard
  turns into a remote with a "Play on this screen instead" option.
- **Control from your phone:** **Control from phone** shows a secret host QR code. Only scan it with your own phone,
  because it grants host rights. Guests' QR codes never do.
- **Autoplay:**
  - Browsers may block videos with sound until someone clicks. If a song can't start by itself, the stage shows
    **Play Next Song**.
  - After a page reload it shows **Resume from m:ss**. The app never pretends playback resumed.
- **Sound effects:** an optional chime on completed songs. It's off by default (bell icon in the dashboard header).

---

## Testing

```bash
npm run lint             # ESLint (Next + React Compiler rules)
npm run typecheck        # route types + tsc
npm test                 # Vitest unit/integration tests
TEST_DATABASE_URL=postgres://user@localhost:5432/db npm test   # also runs the Postgres store tests (it resets that DB's public schema!)
npm run test:e2e         # Playwright E2E (builds and starts a production server on :3200)
E2E_DATABASE_URL=postgres://… npm run test:e2e                 # same E2E suite on the Postgres store (migrate the DB first)
```

What's covered:

- **Unit (89 tests):**
  - Every domain rule: creation, joining, name validation, limits, duplicates, approvals, removal permissions, voting
    modes, reordering, playback anchors, pause/seek/restart, stale and foreign player reports, the `ended` → history →
    performance count → auto-advance chain, skip/unavailable, replace version, replay, ending, snapshots hiding
    secrets, and badges.
  - Parsing and search: the LRC/enhanced-LRC parser and active-line lookup, YouTube URL validation, classification,
    live search against a mocked Data API (filtering, ranking, caching, quota and key errors, no key in logs), and
    demo search labelling.
  - Lyrics and stores: lyrics providers (licence required, outage → `error`), and the **store contract against both
    the memory store and real PostgreSQL** (round trip, concurrency, rollback, cleanup, DB-level duplicate-vote
    constraint, RLS enabled).
  - Service and helpers: service-level authorisation, party isolation, expiry and purge, join codes, token entropy,
    and rate limiting.
- **E2E (11 tests, Chromium, desktop + iPhone 13 viewports):**
  - The core journey: create a party and **decode the QR codes from screenshots**, rename, join, refresh and keep the
    identity, and lock guests out of host controls and the TV. Then add songs, see realtime queue updates, submit
    concurrently, reject duplicates and invalid links, reorder with the keyboard, remove songs (and guests can't
    remove others' songs). Then play with synced word-level lyrics: pause and resume (time and lyrics freeze), seek
    forward and back, refresh with an honest "Resume from" prompt, TV mode readability at 1080p (lyrics ≥ 56 px), and
    skip.
  - The lyrics fallbacks (karaoke video, plain lyrics, no lyrics), the auto-advance on the player's own `ended`, and
    the TV window handover.
  - Party management: voting rules, limits, approvals, paused submissions, removing a guest, ending the party (live
    guests see the goodbye screen, late joiners are refused), replay and export.
  - The YouTube path. This uses a **mock oEmbed server and a stub of the IFrame API** (`tests/support`), because the
    test sandbox can't reach youtube.com: link validation messages, queueing, play/pause through the player API,
    duration reporting, and an embedding-disabled error that can be skipped.

The YouTube E2E test verifies *our* integration with the IFrame API contract, not YouTube itself. Real playback
should be checked manually once: paste a YouTube karaoke link in demo mode, or configure a key and search.

---

## Deployment (Vercel + Supabase)

1. Complete [Supabase setup](#supabase-setup) and apply the migration.
2. Import the repo into Vercel.
3. Set the environment variables:
   - `DATABASE_URL` (transaction pooler URI)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
   - `YOUTUBE_API_KEY`
   - `APP_URL` (your production URL)
   - `CRON_SECRET`
4. Deploy. `vercel.json` schedules `/api/cron/cleanup` hourly to expire idle parties and purge old ones.
   - Long-running servers (`npm run build && npm start`) do the same from `src/instrumentation.ts`.
   - Parties are also expired lazily when they're opened.
5. Serve over HTTPS. Cookies are `Secure` automatically on HTTPS requests. A plain-HTTP LAN setup still works for
   local parties.

Self-hosting on one server, e.g. a Raspberry Pi by the TV, works with no external services: `npm run build &&
npm start`, demo or Postgres storage, and SSE realtime.

---

## Security & privacy

- **Identity:**
  - Hosts and guests get random 256-bit tokens in **httpOnly, SameSite=Lax cookies** scoped per party.
  - The server stores only SHA-256 hashes, compared in constant time.
  - Request bodies can't claim an identity: unknown fields are stripped, and the actor always comes from the cookie.
- **Authorisation:**
  - Host-only commands, export and the TV output require the host token.
  - Guest commands require a live (not removed) participant *of that party*. Guests can only remove their own,
    not-yet-started songs, and only when the host allows it.
  - A QR code only contains the join URL. Host remote links put the key in the URL **fragment** (never sent to
    servers or Referer headers), which is exchanged for a cookie.
- **Input validation:** zod schemas on every command. Names and party names are normalised, with control and bidi
  characters removed and length-limited. Avatars come from an allow-list. Video IDs and URLs are strictly validated,
  and song metadata is always fetched server-side (client-supplied titles are never trusted). Request bodies are
  size-capped. CSV export neutralises spreadsheet formulas.
- **Abuse controls:**
  - Per-IP and per-participant rate limits on create, join, lookup, search, link checks, song adds, lyrics and
    commands.
  - A same-origin check on cookie-authenticated mutations.
  - Search, lyrics and link checks require party membership, so the API key can't be farmed.
- **Secrets:** API keys and the service-role key are only read server-side (`server-only` modules). Logs never include
  request URLs that carry the key. Errors shown to users are friendly and never expose internals.
- **Data minimisation:**
  - The only personal data is a stage name and an emoji.
  - "Online" status is derived from a last-seen timestamp.
  - Idle parties expire (24 h by default), and ended parties are deleted after the retention window (7 days).
- **Headers:** `nosniff`, `X-Frame-Options: SAMEORIGIN`, a referrer policy compatible with YouTube embeds, and a
  restrictive `Permissions-Policy`.

---

## Known limitations

- **Real YouTube playback and live search weren't exercised in this repo's automated runs.** youtube.com is
  unreachable from the build sandbox and no API key was available. Both are covered by contract-level tests (mocked
  Data API responses, mocked oEmbed, IFrame API stub); please do a manual smoke test with a real key.
- **Supabase Realtime wasn't tested against a live Supabase project.** The Postgres store itself is tested against
  PostgreSQL 16. If the Realtime channel fails, clients fall back to polling (every 5 s while disconnected, 20 s
  otherwise) and refetch on focus or reconnect, so state still converges.
- **Lyrics:** only the bundled sample tracks have lyrics out of the box. Synced lyrics for real songs require a
  licensed provider, plus timing that matches the specific video.
- **YouTube constraints apply:** ads, embedding-disabled or region-locked videos, and browser autoplay policies. iOS
  Safari can be stricter about autoplay; tap **Play Next Song** when shown.
- **Local mode** (no `DATABASE_URL`) is single-process. It's perfect for a laptop or Pi, but not for serverless.
- **Rate limits** are per server instance. Put a shared limiter at the edge if you need strict global limits.
- **No singing scores:** the app counts performances, submissions and votes. It does not, and can't honestly, judge
  singing quality.
