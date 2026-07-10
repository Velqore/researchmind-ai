-- ResearchMind AI — Supabase schema
-- Run this in the Supabase SQL editor (Database → SQL Editor → New query).

-- ─── License keys (keys stored as SHA-256 hashes, never plain text) ─────────
create table if not exists license_keys (
  id                      uuid primary key default gen_random_uuid(),
  key_hash                text unique not null,
  email                   text not null,
  paypal_subscription_id  text unique,
  paypal_transaction_id   text,
  expires_at              timestamptz not null,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);
create index if not exists idx_license_keys_hash on license_keys (key_hash);
create index if not exists idx_license_keys_sub  on license_keys (paypal_subscription_id);

-- ─── Usage analytics (feature usage, DAU, free→pro conversion) ──────────────
create table if not exists usage_logs (
  id          bigint generated always as identity primary key,
  key_hash    text,              -- null for free-tier usage
  feature     text not null,
  ip_hash     text,              -- hashed IP for suspicious-activity detection
  created_at  timestamptz not null default now()
);
create index if not exists idx_usage_logs_key     on usage_logs (key_hash);
create index if not exists idx_usage_logs_created on usage_logs (created_at);

-- ─── Response cache (same paper → cached summary for 24h) ──────────────────
create table if not exists cached_summaries (
  id          bigint generated always as identity primary key,
  url_hash    text unique not null,
  summary     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);
create index if not exists idx_cached_summaries_hash on cached_summaries (url_hash);

-- ─── Waitlist ────────────────────────────────────────────────────────────────
create table if not exists waitlist (
  id          bigint generated always as identity primary key,
  email       text unique not null,
  created_at  timestamptz not null default now()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- The backend uses the service-role key (bypasses RLS). Enabling RLS with no
-- policies blocks all access via the public anon key.
alter table license_keys     enable row level security;
alter table usage_logs       enable row level security;
alter table cached_summaries enable row level security;
alter table waitlist         enable row level security;

-- ─── Scheduled cleanup (requires the pg_cron extension) ─────────────────────
-- Enable: Database → Extensions → pg_cron
create extension if not exists pg_cron;

-- Monthly: delete keys expired for over 30 days (grace period for renewals)
select cron.schedule(
  'purge-expired-license-keys',
  '0 3 1 * *',
  $$ delete from license_keys where expires_at < now() - interval '30 days' $$
);

-- Hourly: drop expired summary cache entries
select cron.schedule(
  'purge-expired-summaries',
  '15 * * * *',
  $$ delete from cached_summaries where expires_at < now() $$
);
