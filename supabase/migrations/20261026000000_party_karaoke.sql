-- Party Karaoke schema.
--
-- Access model: the browser never talks to these tables. All reads and writes
-- go through the Next.js server, which connects with DATABASE_URL (the
-- Postgres owner role) and enforces host/guest permissions. Row level security
-- is enabled with NO policies, so the public `anon` / `authenticated` roles
-- that ship with the Supabase anon key can read or write nothing.
--
-- Concurrency: every mutation runs in a transaction that first takes
-- `SELECT ... FOR UPDATE` on the party_sessions row, serialising all changes
-- to one party (queue positions, votes, playback) without blocking others.

create table if not exists party_sessions (
  id                uuid primary key,
  join_code         text not null check (join_code ~ '^[A-Z2-9]{6}$'),
  name              text not null check (char_length(name) between 1 and 60),
  host_identity     jsonb not null,               -- {"tokenHashes": [sha256 hex, ...]}; raw tokens are never stored
  status            text not null check (status in ('active', 'paused', 'ended')),
  settings          jsonb not null,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  ended_at          timestamptz,
  ended_reason      text check (ended_reason in ('host', 'expired'))
);

-- A join code is unique among parties that are still running.
create unique index if not exists party_sessions_live_join_code
  on party_sessions (join_code) where status <> 'ended';
create index if not exists party_sessions_join_code on party_sessions (join_code);
create index if not exists party_sessions_activity on party_sessions (status, last_activity_at);
create index if not exists party_sessions_ended on party_sessions (ended_at) where ended_at is not null;

create table if not exists participants (
  id                 uuid primary key,
  session_id         uuid not null references party_sessions (id) on delete cascade,
  display_name       text not null check (char_length(display_name) between 1 and 24),
  avatar             text not null check (char_length(avatar) between 1 and 16),
  token_hash         text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  joined_at          timestamptz not null,
  last_seen_at       timestamptz not null,
  removed_at         timestamptz,
  performance_count  integer not null default 0 check (performance_count >= 0)
);
create index if not exists participants_session on participants (session_id);
create unique index if not exists participants_token_hash on participants (token_hash);
create unique index if not exists participants_unique_live_name
  on participants (session_id, lower(display_name)) where removed_at is null;

create table if not exists songs (
  id                text primary key,             -- 'yt:<videoId>' or 'demo:<slug>'
  source            text not null check (source in ('youtube', 'demo')),
  youtube_video_id  text check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title             text not null,
  channel_name      text not null,
  thumbnail_url     text,
  duration_seconds  integer check (duration_seconds is null or duration_seconds > 0),
  metadata          jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  check ((source = 'youtube') = (youtube_video_id is not null))
);
create unique index if not exists songs_youtube_video_id on songs (youtube_video_id) where youtube_video_id is not null;

create table if not exists queue_items (
  id              uuid primary key,
  session_id      uuid not null references party_sessions (id) on delete cascade,
  song_id         text not null references songs (id),
  participant_id  uuid not null references participants (id) on delete cascade,
  position        integer not null check (position >= 0),
  status          text not null check (status in ('pending_approval', 'queued', 'playing', 'completed', 'skipped', 'removed', 'rejected')),
  pinned          boolean not null default false,
  status_reason   text,
  replay_of       uuid references queue_items (id) on delete set null,
  added_at        timestamptz not null,
  started_at      timestamptz,
  completed_at    timestamptz,
  skipped_at      timestamptz
);
create index if not exists queue_items_session_status_position on queue_items (session_id, status, position);
create index if not exists queue_items_participant on queue_items (participant_id);
-- At most one song on stage per party.
create unique index if not exists queue_items_one_playing on queue_items (session_id) where status = 'playing';

create table if not exists playback_state (
  session_id             uuid primary key references party_sessions (id) on delete cascade,
  current_queue_item_id  uuid references queue_items (id) on delete set null,
  playback_status        text not null check (playback_status in ('idle', 'intro', 'ready', 'playing', 'paused', 'buffering', 'error')),
  current_time_seconds   double precision not null default 0 check (current_time_seconds >= 0),
  playback_started_at    timestamptz,
  paused_at              timestamptz,
  duration_seconds       double precision,
  command                jsonb not null,
  error                  jsonb,
  autoplay_blocked       boolean not null default false,
  interrupted            boolean not null default false,
  intro_until            timestamptz,
  output_client_id       text,
  output_last_seen_at    timestamptz,
  updated_at             timestamptz not null
);

create table if not exists song_history (
  id                 uuid primary key,
  session_id         uuid not null references party_sessions (id) on delete cascade,
  song_id            text not null references songs (id),
  participant_id     uuid not null references participants (id) on delete cascade,
  queue_item_id      uuid references queue_items (id) on delete set null,
  played_at          timestamptz not null,
  ended_at           timestamptz not null,
  completion_status  text not null check (completion_status in ('completed', 'skipped', 'unavailable'))
);
create index if not exists song_history_session on song_history (session_id, ended_at desc);

create table if not exists votes (
  id              uuid primary key,
  session_id      uuid not null references party_sessions (id) on delete cascade,
  queue_item_id   uuid not null references queue_items (id) on delete cascade,
  participant_id  uuid not null references participants (id) on delete cascade,
  created_at      timestamptz not null,
  constraint votes_one_per_participant unique (queue_item_id, participant_id)
);
create index if not exists votes_session on votes (session_id);

-- Availability metadata only. Lyric text is not stored here unless the
-- provider's license explicitly allows it (the app never writes it).
create table if not exists lyrics_metadata (
  id                   uuid primary key,
  song_id              text not null unique references songs (id) on delete cascade,
  provider             text,
  availability_status  text not null check (availability_status in ('synced', 'plain', 'unavailable', 'error', 'unknown')),
  timing_format        text not null check (timing_format in ('word', 'line', 'none')),
  licensing_reference  text,
  metadata             jsonb not null default '{}'::jsonb,
  updated_at           timestamptz not null default now()
);

alter table party_sessions  enable row level security;
alter table participants    enable row level security;
alter table songs           enable row level security;
alter table queue_items     enable row level security;
alter table playback_state  enable row level security;
alter table song_history    enable row level security;
alter table votes           enable row level security;
alter table lyrics_metadata enable row level security;

-- Belt and braces on Supabase: remove default grants from the public API roles.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on party_sessions, participants, songs, queue_items, playback_state, song_history, votes, lyrics_metadata from %I', r);
    end if;
  end loop;
end $$;
