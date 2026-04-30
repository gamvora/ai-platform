-- Nova AI — Migration 002: User settings columns
-- Adds avatar_url and preferences (JSONB) to users table.
-- Safe to re-run.

alter table public.users
  add column if not exists avatar_url text;

alter table public.users
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- Optional index to filter users who uploaded an avatar (rarely needed).
create index if not exists users_avatar_notnull_idx
  on public.users (id)
  where avatar_url is not null;
