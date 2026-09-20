-- Everything hand-written about a trade, in one table.
--
-- Run this in the Supabase SQL editor, after trades.sql, trade_notes.sql and
-- trades_idea_strategies.sql. Like the other files here, this is the record of what was run,
-- not a migration anything applies automatically.
--
-- WHY THIS SHAPE
-- `trades` holds what the broker reported and what Postgres derived from it — instrument, entry
-- price, quantity, P&L. Everything you type about a trade lives here instead, so there is one
-- place to look for "what did I say about this trade" and `trades` stays the record of fact.
--
-- The idea and the notes are the same kind of thing — a piece of writing about the trade, with
-- a timestamp — so they are rows in one table separated by `kind`, rather than a column in one
-- table plus a second table. The difference is only how many there may be:
--
--   kind = 'idea'  exactly one per trade (enforced by the partial unique index below)
--   kind = 'note'  as many as you like, each with its own created_at
--
-- This supersedes `trade_notes` and `trades.idea`; both are migrated into it and removed at the
-- bottom of this file.
--
-- STILL ON trades: `stop_price` and `strategies`. Both are single values the rest of the app
-- filters and sorts on (Postgres generates initial_risk and rr straight from stop_price, and
-- the strategies GIN index answers "every trade that used KAR"), so they stay on the row they
-- describe rather than becoming prose.

create table if not exists public.trade_details (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Deleting a trade takes its writing with it; neither has meaning without the trade.
  trade_id   bigint not null references public.trades (id) on delete cascade,

  kind       text not null check (kind in ('idea', 'note')),

  -- Whitespace-only entries are not a thing worth storing. Clearing the idea deletes its row.
  body       text not null check (btrim(body) <> ''),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One idea per trade; notes are unlimited, so the index is deliberately partial.
create unique index if not exists trade_details_one_idea_idx
  on public.trade_details (trade_id)
  where kind = 'idea';

-- The only read there is: everything written about one trade, oldest first.
create index if not exists trade_details_trade_idx
  on public.trade_details (trade_id, created_at);

-- `updated_at` is what tells the UI to show "edited"; the function already exists from trades.sql.
drop trigger if exists trade_details_touch_updated_at on public.trade_details;
create trigger trade_details_touch_updated_at
  before update on public.trade_details
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same reasoning as trades: a private trading record, and the publishable key ships in the
-- browser bundle, so there is no public select policy.
-- ---------------------------------------------------------------------------
alter table public.trade_details enable row level security;

drop policy if exists "trade details owner read"   on public.trade_details;
drop policy if exists "trade details owner insert" on public.trade_details;
drop policy if exists "trade details owner update" on public.trade_details;
drop policy if exists "trade details owner delete" on public.trade_details;

create policy "trade details owner read"
  on public.trade_details for select
  using (user_id = auth.uid());

create policy "trade details owner insert"
  on public.trade_details for insert
  with check (user_id = auth.uid());

create policy "trade details owner update"
  on public.trade_details for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trade details owner delete"
  on public.trade_details for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Migrate trade_notes and trades.idea in, then retire both
--
-- Each block is guarded on the old thing still existing, so running this file twice copies
-- nothing the second time.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.trade_notes') is not null then
    insert into public.trade_details (user_id, trade_id, kind, body, created_at, updated_at)
    select user_id, trade_id, 'note', body, created_at, updated_at
    from public.trade_notes;

    drop table public.trade_notes;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trades' and column_name = 'idea'
  ) then
    insert into public.trade_details (user_id, trade_id, kind, body, created_at, updated_at)
    select user_id, id, 'idea', idea, updated_at, updated_at
    from public.trades
    where btrim(idea) <> ''
    on conflict do nothing;

    alter table public.trades drop column idea;
  end if;
end
$$;
