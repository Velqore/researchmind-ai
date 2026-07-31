-- ResearchMind AI — scaling migration. Run once in Supabase → SQL Editor.
-- Required before serving a large user base. Safe to run on an existing DB.

-- 1. The hot path: enforce_tier() runs a filtered count on usage_logs for EVERY
--    free-tier AI request (ip_hash + feature + created_at >= today). Without a
--    composite index this becomes a growing table scan that slows every request.
create index if not exists idx_usage_logs_ip_feat_time
  on usage_logs (ip_hash, feature, created_at);

-- 2. usage_logs gains one row per AI request and is otherwise unbounded — at a
--    few thousand users it fills the free-tier storage and slows queries. Keep
--    only what the daily-limit window needs (14 days of headroom). Requires
--    pg_cron (Database → Extensions → pg_cron).
create extension if not exists pg_cron;
select cron.schedule(
  'purge-old-usage-logs',
  '30 3 * * *',                       -- daily 03:30 UTC
  $$ delete from usage_logs where created_at < now() - interval '14 days' $$
);

-- 3. Shared summaries accumulate forever; drop links older than 180 days.
create index if not exists idx_shared_summaries_created
  on shared_summaries (created_at);
select cron.schedule(
  'purge-old-shared-summaries',
  '45 3 * * *',
  $$ delete from shared_summaries where created_at < now() - interval '180 days' $$
);
