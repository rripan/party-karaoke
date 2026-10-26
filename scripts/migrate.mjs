#!/usr/bin/env node
// Applies supabase/migrations/*.sql in order to DATABASE_URL, once each.
// (With the Supabase CLI you can instead run `supabase db push`.)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, max: 1, ssl: process.env.DATABASE_SSL === "disable" || local ? false : "require", onnotice: () => {} });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations");

try {
  await sql`create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from app_migrations`).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
      await tx`insert into app_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}
