-- Notes on a trade: many per trade, each with its own timestamp.
--
-- Run this in the Supabase SQL editor, after trades.sql. Like the other files here, this is the
-- record of what was run, not a migration anything applies automatically.
--
-- WHY A TABLE AND NOT A COLUMN
-- `trades.notes` was one text field, so every edit overwrote the last and there was no way to
-- say when a thought was had. A trade is reviewed more than once — at the close, that evening,
-- again a week later when the same setup reappears — and those readings are worth keeping
-- apart. One row per note gives each its own created_at, and lets one be edited or deleted
-- without touching the others.
--
-- The old column is backfilled into this table and then dropped, below.

create table if not exists public.trade_notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Deleting a trade takes its notes with it. Nothing deletes trades today, but the note has no
  -- meaning without the row it is about.
  trade_id   bigint not null references public.trades (id) on delete cascade,

  -- Whitespace-only notes are not a thing worth storing.
  body       text not null check (btrim(body) <> ''),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The only read there is: every note on one trade, oldest first.
create index if not exists trade_notes_trade_idx
  on public.trade_notes (trade_id, created_at);

-- `updated_at` is what tells the UI to show "edited"; the trigger function already exists from
-- trades.sql.
drop trigger if exists trade_notes_touch_updated_at on public.trade_notes;
create trigger trade_notes_touch_updated_at
  before update on public.trade_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same reasoning as trades: this is a private trading record and the publishable key ships in
-- the browser bundle, so reading requires being the owner — there is no public select policy.
-- ---------------------------------------------------------------------------
alter table public.trade_notes enable row level security;

drop policy if exists "trade notes owner read"   on public.trade_notes;
drop policy if exists "trade notes owner insert" on public.trade_notes;
drop policy if exists "trade notes owner update" on public.trade_notes;
drop policy if exists "trade notes owner delete" on public.trade_notes;

create policy "trade notes owner read"
  on public.trade_notes for select
  using (user_id = auth.uid());

create policy "trade notes owner insert"
  on public.trade_notes for insert
  with check (user_id = auth.uid());

create policy "trade notes owner update"
  on public.trade_notes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trade notes owner delete"
  on public.trade_notes for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Backfill and retire trades.notes
--
-- Guarded on the column still existing, so running this file twice is safe: the second run
-- finds no column, copies nothing, and drops nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trades' and column_name = 'notes'
  ) then
    insert into public.trade_notes (user_id, trade_id, body, created_at, updated_at)
    select user_id, id, notes, updated_at, updated_at
    from public.trades
    where notes is not null and btrim(notes) <> '';

    alter table public.trades drop column notes;
  end if;
end
$$;
