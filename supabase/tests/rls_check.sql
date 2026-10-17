-- Run in the Supabase SQL editor AFTER schema.sql. Proves, inside your own project, that row-level security is on
-- and that the anon role has no table access. Every row of the result should say ok = true.
select c.relname as table_name, c.relrowsecurity as ok, 'row level security enabled' as check
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('imports','products','observations','watchlists','watchlist_items','alert_rules','alerts','keywords','keyword_observations','fee_profiles','settings','projects','project_items','calc_runs','ad_terms','suppliers')
union all
select c.relname, count(p.polname) = 1, 'exactly one policy ("own rows")'
from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('imports','products','observations','watchlists','watchlist_items','alert_rules','alerts','keywords','keyword_observations','fee_profiles','settings','projects','project_items','calc_runs','ad_terms','suppliers')
group by c.relname
union all
select c.relname, not has_table_privilege('anon', c.oid, 'select,insert,update,delete'), 'anon has no access'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('imports','products','observations','watchlists','watchlist_items','alert_rules','alerts','keywords','keyword_observations','fee_profiles','settings','projects','project_items','calc_runs','ad_terms','suppliers')
order by 1, 3;
