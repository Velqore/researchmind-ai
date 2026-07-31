-- ResearchMind AI — admin analytics function.
-- Run once in Supabase → SQL Editor. Powers the /admin dashboard.
-- Aggregates entirely inside Postgres (no row export), so it stays fast even
-- with millions of usage_logs rows. SECURITY DEFINER lets the backend call it
-- through the service-role key despite RLS.

create or replace function admin_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'generated_at', now(),
    'events_today',   (select count(*) from usage_logs where created_at >= date_trunc('day', now())),
    'events_7d',      (select count(*) from usage_logs where created_at >= now() - interval '7 days'),
    'events_all',     (select count(*) from usage_logs),
    'visitors_today', (select count(distinct ip_hash) from usage_logs where created_at >= date_trunc('day', now())),
    'visitors_7d',    (select count(distinct ip_hash) from usage_logs where created_at >= now() - interval '7 days'),
    'visitors_all',   (select count(distinct ip_hash) from usage_logs),
    'pro_active',     (select count(*) from license_keys where is_active and expires_at > now()),
    'by_feature_7d',  (select coalesce(json_object_agg(feature, c), '{}'::json)
                        from (select feature, count(*) c from usage_logs
                              where created_at >= now() - interval '7 days'
                              group by feature order by c desc) t),
    'by_feature_all', (select coalesce(json_object_agg(feature, c), '{}'::json)
                        from (select feature, count(*) c from usage_logs group by feature) t),
    'daily_14d',      (select coalesce(json_object_agg(d, c), '{}'::json)
                        from (select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') d, count(*) c
                              from usage_logs where created_at >= now() - interval '14 days'
                              group by 1 order by 1) t)
  );
$$;
