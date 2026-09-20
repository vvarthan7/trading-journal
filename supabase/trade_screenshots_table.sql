-- Screenshots as rows linked to a trade, not just files in a folder.
--
-- Run this in the Supabase SQL editor, after trades.sql and trade_screenshots.sql (which
-- creates the bucket and its policies — that file is still required; this one adds the link).
--
-- WHY A TABLE AS WELL AS THE BUCKET
-- The bytes stay in Storage; what was missing was the link. A folder convention
-- (`{user_id}/{trade_id}/…`) is not a foreign key: nothing stopped a path pointing at a trade
-- that no longer exists, deleting a trade left its images behind, and "which trades have
-- screenshots?" was not a question SQL could answer. A row per image fixes all three, and
-- leaves room for a caption or an explicit order later.
--
-- A trade may have as many as you like — the only uniqueness is on the storage path, so the
-- same object cannot be linked twice.

create table if not exists public.trade_screenshots (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  trade_id   bigint not null references public.trades (id) on delete cascade,

  -- Full object path inside the `trade-screenshots` bucket: {user_id}/{trade_id}/{uuid}.{ext}.
  path       text not null unique,

  created_at timestamptz not null default now()
);

-- Every screenshot on one trade, oldest first — the only read there is.
create index if not exists trade_screenshots_trade_idx
  on public.trade_screenshots (trade_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.trade_screenshots enable row level security;

drop policy if exists "trade screenshots owner read"   on public.trade_screenshots;
drop policy if exists "trade screenshots owner insert" on public.trade_screenshots;
drop policy if exists "trade screenshots owner delete" on public.trade_screenshots;

create policy "trade screenshots owner read"
  on public.trade_screenshots for select
  using (user_id = auth.uid());

create policy "trade screenshots owner insert"
  on public.trade_screenshots for insert
  with check (user_id = auth.uid());

create policy "trade screenshots owner delete"
  on public.trade_screenshots for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Adopt the images already in the bucket
--
-- Anything uploaded under the old folder-only scheme gets a row here, so nothing is stranded.
-- `on conflict (path) do nothing` makes this safe to run again.
-- ---------------------------------------------------------------------------
insert into public.trade_screenshots (user_id, trade_id, path, created_at)
select
  (storage.foldername(o.name))[1]::uuid,
  (storage.foldername(o.name))[2]::bigint,
  o.name,
  coalesce(o.created_at, now())
from storage.objects o
where o.bucket_id = 'trade-screenshots'
  -- {user_id}/{trade_id}/file — anything else is not one of ours.
  and array_length(storage.foldername(o.name), 1) = 2
  and (storage.foldername(o.name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(o.name))[2] ~ '^[0-9]+$'
  and exists (
    select 1 from public.trades t
    where t.id = (storage.foldername(o.name))[2]::bigint
  )
on conflict (path) do nothing;

-- NOT HANDLED HERE: deleting a trade removes its rows, but the objects themselves stay in the
-- bucket. Nothing deletes trades today (there is no UI for it), so no orphan can arise yet.
