-- Run once in the Supabase SQL editor if you created the project from an earlier schema.sql. Safe to re-run.
create table if not exists public.reviews (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade, marketplace text, rating double precision, title text, body text,
  reviewed_at timestamptz, source text, kind text, import_id uuid);
create index if not exists ix_reviews_product on public.reviews(product_id);
create table if not exists public.provider_results (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null, tool text, marketplace text, params jsonb, result jsonb, retrieved_at timestamptz, note text);

do $$
declare t text;
begin
  foreach t in array array['reviews','provider_results']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
