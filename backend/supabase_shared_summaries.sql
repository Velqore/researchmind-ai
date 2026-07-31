-- Table backing the shareable-summary links (/share and /s/{id}).
-- Run this once in Supabase → SQL Editor → New query → Run.
-- The backend uses the service_role key, which bypasses RLS.

create table if not exists public.shared_summaries (
  id          text primary key,          -- 8-char public slug in the /s/<id> URL
  title       text not null default 'Shared summary',
  summary     text not null,
  source_url  text default '',
  created_at  timestamptz not null default now()
);

-- Enable RLS and add NO anon policies: only the service_role key (server-side)
-- may read/write. Public viewing happens through the backend's /s/{id} route,
-- never directly from the browser.
alter table public.shared_summaries enable row level security;
