-- Nova AI — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run (uses IF NOT EXISTS where possible).

-- ==========================
-- Enable required extensions
-- ==========================
create extension if not exists "pgcrypto";

-- ==========================
-- Users table
-- ==========================
-- We use our own users table (not Supabase auth.users) because the app
-- uses a custom JWT + bcrypt flow (src/lib/auth.ts). This keeps email/
-- password/name under our control.
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  avatar_url    text,
  preferences   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Backfill columns for existing installs (no-op if already present)
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists preferences jsonb not null default '{}'::jsonb;

create index if not exists users_email_lower_idx
  on public.users (lower(email));

-- ==========================
-- Conversations table
-- ==========================
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  title      text not null,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ==========================
-- Generations table (images / videos)
-- ==========================
create table if not exists public.generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null check (type in ('image','video','edit')),
  prompt     text not null,
  url        text not null,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);

create index if not exists generations_user_type_created_idx
  on public.generations (user_id, type, created_at desc);

-- ==========================
-- Row-Level Security
-- ==========================
-- We access the DB with the service_role key server-side, which bypasses RLS.
-- Still, enable RLS so anon/public tokens cannot read these tables directly.
alter table public.users          enable row level security;
alter table public.conversations  enable row level security;
alter table public.generations    enable row level security;

-- Deny-all policies (service_role bypasses RLS automatically).
drop policy if exists "users_no_public_access" on public.users;
create policy "users_no_public_access" on public.users
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "conversations_no_public_access" on public.conversations;
create policy "conversations_no_public_access" on public.conversations
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "generations_no_public_access" on public.generations;
create policy "generations_no_public_access" on public.generations
  for all to anon, authenticated using (false) with check (false);
