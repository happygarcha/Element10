-- Run once in the Supabase SQL editor if your project predates niche imports. Safe to re-run.
create table if not exists public.niches (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text check (marketplace in ('CA','US')), name text not null, period text, metrics jsonb, labels jsonb, raw jsonb,
  as_of timestamptz, source text, kind text, import_id uuid);
create index if not exists ix_niches_mp on public.niches(marketplace, name);

do $$
declare t text;
begin
  foreach t in array array['niches']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
