-- Trade journal, one row per entry lot.
--
-- Run this in the Supabase SQL editor. The schema is managed by hand there — this file is the
-- record of what was run, not a migration anything applies automatically.
--
-- MODEL
-- A row is one entry matched to one exit. An entry is inserted with exit_price NULL and filled
-- in when the closing fill arrives. Scaling in creates additional rows; a sell smaller than a
-- row's quantity splits that row, so every row stays exactly one entry against one exit. That
-- is what keeps stop, Initial Risk and R:R meaningful per row.
--
--   Buy  75 @180  ->  row A (open)
--   Buy  75 @184  ->  row B (open)
--   Sell 150 @190 ->  closes A and B, both exit 190
--
--   Buy  150 @180 ->  row A (open, qty 150)
--   Sell  75 @190 ->  row A splits: 75 closed @190, 75 left open
--
-- Note: `date` and `time` from the field list are folded into trade_date plus entry_time /
-- exit_time, so there is no second, redundant timestamp to keep in step.

create table if not exists public.trades (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Broker linkage. These are what make a re-sync idempotent: the same fill can only ever
  -- produce the same row. exit_fill_id is '' rather than NULL while the trade is open, so the
  -- unique constraint below works on every Postgres version.
  broker         text not null default 'angelone',
  entry_fill_id  text not null,
  entry_order_id text not null default '',
  exit_fill_id   text not null default '',
  exit_order_id  text not null default '',

  trade_date  date not null,

  instrument  text not null,
  -- Options | Futures | Equity
  type        text not null default '',
  exchange    text not null default '',
  -- long = bought first, short = sold first. Required: it sets the sign of P&L.
  direction   text not null check (direction in ('long', 'short')),

  quantity    integer not null check (quantity > 0),
  lot         integer,

  entry_price numeric(18, 4) not null,
  exit_price  numeric(18, 4),
  entry_time  time,
  exit_time   time,

  -- The initial stop loss, entered by hand — the broker never reports it.
  stop_price  numeric(18, 4),

  -- Derived, so they can never disagree with the prices above.
  -- Each references only stored columns, which is Postgres's rule for generated columns.
  pnl numeric(18, 2) generated always as (
    (exit_price - entry_price) * quantity *
    (case when direction = 'long' then 1 else -1 end)
  ) stored,

  initial_risk numeric(18, 2) generated always as (
    abs(entry_price - stop_price) * quantity
  ) stored,

  -- Realised R: reward per unit of risk. NULL until both an exit and a stop exist, and
  -- guarded with nullif so a stop set at the entry price cannot divide by zero.
  rr numeric(18, 4) generated always as (
    (exit_price - entry_price) *
    (case when direction = 'long' then 1 else -1 end)
    / nullif(abs(entry_price - stop_price), 0)
  ) stored,

  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per entry fill per exit fill. Re-running a sync updates instead of duplicating.
  constraint trades_fill_unique unique (user_id, entry_fill_id, exit_fill_id)
);

create index if not exists trades_user_date_idx
  on public.trades (user_id, trade_date desc, entry_time desc);

-- Open positions are the common lookup while the market is running.
create index if not exists trades_open_idx
  on public.trades (user_id)
  where exit_price is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trades_touch_updated_at on public.trades;
create trigger trades_touch_updated_at
  before update on public.trades
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- NOTE: journal_entries lets anyone select. This table does NOT — it holds real positions and
-- P&L, and the publishable key ships inside the browser bundle, so a public select policy would
-- put your live trading record on the open internet. Reading requires being signed in. To
-- deliberately match journal_entries, change the select policy's USING clause to `true`.
-- ---------------------------------------------------------------------------
alter table public.trades enable row level security;

drop policy if exists "trades owner read"   on public.trades;
drop policy if exists "trades owner insert" on public.trades;
drop policy if exists "trades owner update" on public.trades;
drop policy if exists "trades owner delete" on public.trades;

create policy "trades owner read"
  on public.trades for select
  using (user_id = auth.uid());

create policy "trades owner insert"
  on public.trades for insert
  with check (user_id = auth.uid());

create policy "trades owner update"
  on public.trades for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trades owner delete"
  on public.trades for delete
  using (user_id = auth.uid());
