-- Element10 database schema for Supabase (Postgres). Run once in the Supabase SQL editor.
-- Every table belongs to one login (user_id) and row-level security lets a login see and change ONLY its own rows.
-- Re-running this file is safe.

create table if not exists public.imports (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text, kind text, source_label text, marketplace text check (marketplace in ('CA','US')),
  uploaded_at timestamptz, rows_ok int default 0, rows_skipped int default 0, notes text);

create table if not exists public.products (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asin text not null, marketplace text not null check (marketplace in ('CA','US')),
  title text, brand text, category text, first_seen timestamptz, unique (user_id, asin, marketplace));

create table if not exists public.observations (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, metric text not null,
  value_num double precision, value_text text, unit text,
  kind text not null check (kind in ('observed','calculated','estimated','user_supplied','sample')),
  source text not null, as_of timestamptz not null, marketplace text, import_id uuid);
create index if not exists ix_obs_product on public.observations(product_id, metric, as_of);

create table if not exists public.watchlists (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, created_at timestamptz, unique (user_id, name));
create table if not exists public.watchlist_items (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, added_at timestamptz,
  unique (watchlist_id, product_id));
create table if not exists public.alert_rules (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  watchlist_id uuid references public.watchlists(id) on delete cascade, metric text not null,
  op text not null check (op in ('lt','gt','change_pct_gt')), threshold double precision not null,
  active boolean not null default true, created_at timestamptz);
create table if not exists public.alerts (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule_id uuid not null references public.alert_rules(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, metric text,
  value double precision, previous double precision, message text, triggered_at timestamptz,
  observation_id uuid, acknowledged boolean not null default false, unique (rule_id, product_id, observation_id));

create table if not exists public.keywords (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text not null check (marketplace in ('CA','US')), phrase text not null, unique (user_id, marketplace, phrase));
create table if not exists public.keyword_observations (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade, metric text not null,
  value_num double precision, asin text, kind text, source text, as_of timestamptz, import_id uuid);

create table if not exists public.fee_profiles (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text not null check (marketplace in ('CA','US')), data jsonb not null,
  verified_at timestamptz, source_note text, unique (user_id, marketplace));
create table if not exists public.settings (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, value jsonb, unique (user_id, key));

create table if not exists public.projects (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, notes text, created_at timestamptz, unique (user_id, name));
create table if not exists public.project_items (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, note text, unique (project_id, product_id));
create table if not exists public.calc_runs (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null, product_id uuid references public.products(id) on delete set null,
  label text, marketplace text, inputs jsonb, outputs jsonb, created_at timestamptz);
create table if not exists public.ad_terms (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id uuid, marketplace text, campaign text, term text, match_type text, impressions double precision,
  clicks double precision, spend double precision, sales double precision, orders double precision,
  as_of timestamptz, source text, kind text);

create table if not exists public.suppliers (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, name text not null, contact text, quote_unit_cost double precision,
  currency text, moq double precision, lead_days double precision, quoted_at timestamptz, notes text);

create table if not exists public.reviews (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade, marketplace text, rating double precision, title text, body text,
  reviewed_at timestamptz, source text, kind text, import_id uuid);
create index if not exists ix_reviews_product on public.reviews(product_id);
create table if not exists public.provider_results (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null, tool text, marketplace text, params jsonb, result jsonb, retrieved_at timestamptz, note text);

create table if not exists public.niches (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text check (marketplace in ('CA','US')), name text not null, period text, metrics jsonb, labels jsonb, raw jsonb,
  as_of timestamptz, source text, kind text, import_id uuid);
create index if not exists ix_niches_mp on public.niches(marketplace, name);

-- Row-level security: a login can only read and write its own rows. Nothing is readable without logging in.
do $$
declare t text;
begin
  foreach t in array array['imports','products','observations','watchlists','watchlist_items','alert_rules','alerts','keywords',
                           'keyword_observations','fee_profiles','settings','projects','project_items','calc_runs','ad_terms','suppliers','reviews','provider_results','niches']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
