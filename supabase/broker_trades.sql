-- Broker trades captured from Angel One SmartAPI.
--
-- Run this in the Supabase SQL editor. The schema is managed by hand there — this file is the
-- record of what was run, not a migration that anything applies automatically.
--
-- Shape: one row in broker_trades per round trip (a position held from flat back to flat), and
-- one row in broker_trade_fills per broker fill, so a single trade carries many order IDs across
-- its several entries and exits.
--
-- Raw broker values (exchange, instrument_type, product) are stored as they arrive; the display
-- forms the app shows — "NSE F&O", "Options", "Intraday" — are derived in src/lib/brokerTrades.ts
-- rather than stored, so a mapping fix never needs a backfill.

-- ---------------------------------------------------------------------------
-- Round trips
-- ---------------------------------------------------------------------------
create table if not exists public.broker_trades (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,

  broker       text not null default 'angelone',

  -- Identity of the round trip. SmartAPI fill IDs are unique and never reused, so the first
  -- entry fill names this trade for its whole life: as it scales in and finally closes, a
  -- re-sync upserts onto this key instead of inserting a duplicate.
  fingerprint  text not null,

  trade_date   date not null,

  symbol           text not null,
  exchange         text not null,
  instrument_type  text not null default '',
  product          text not null default '',

  direction    text not null check (direction in ('long', 'short')),
  units        integer not null,
  lots         integer,
  lot_size     integer,

  -- Size-weighted averages across the entry legs and the exit legs.
  avg_entry    numeric(18, 4) not null,
  avg_exit     numeric(18, 4),
  entry_time   time,
  exit_time    time,

  realised_pnl numeric(18, 2),
  is_open      boolean not null default false,

  -- Journalled by hand — the broker does not report any of this.
  -- stop is the initial stop loss, and is what makes realised R computable.
  stop         numeric(18, 4),
  target       numeric(18, 4),
  strategy     text,
  tags         text[] not null default '{}',
  plan         text check (plan in ('on', 'partly', 'off')),
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint broker_trades_fingerprint_unique unique (user_id, fingerprint)
);

create index if not exists broker_trades_user_date_idx
  on public.broker_trades (user_id, trade_date desc, entry_time desc);

-- ---------------------------------------------------------------------------
-- Individual fills, many per trade
-- ---------------------------------------------------------------------------
create table if not exists public.broker_trade_fills (
  id         bigint generated always as identity primary key,
  trade_id   bigint not null references public.broker_trades (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  order_id   text not null,
  fill_id    text not null,

  side       text not null check (side in ('entry', 'exit')),
  fill_time  time not null,
  price      numeric(18, 4) not null,
  units      integer not null,
  lots       integer,

  created_at timestamptz not null default now(),

  -- A fill belongs to exactly one trade, so re-syncing the same day is idempotent.
  constraint broker_trade_fills_fill_unique unique (user_id, fill_id)
);

create index if not exists broker_trade_fills_trade_idx
  on public.broker_trade_fills (trade_id, fill_time);

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

drop trigger if exists broker_trades_touch_updated_at on public.broker_trades;
create trigger broker_trades_touch_updated_at
  before update on public.broker_trades
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- NOTE: journal_entries lets anyone select. These tables do NOT — they hold real positions and
-- P&L, and the publishable key ships in the browser bundle, so a public select policy would put
-- your live trading record on the open internet. Reading therefore requires being signed in.
-- To deliberately match journal_entries instead, replace the select policy's USING clause
-- with `true`.
-- ---------------------------------------------------------------------------
alter table public.broker_trades enable row level security;
alter table public.broker_trade_fills enable row level security;

drop policy if exists "broker_trades owner read"   on public.broker_trades;
drop policy if exists "broker_trades owner write"  on public.broker_trades;
drop policy if exists "broker_trades owner update" on public.broker_trades;
drop policy if exists "broker_trades owner delete" on public.broker_trades;

create policy "broker_trades owner read"
  on public.broker_trades for select
  using (user_id = auth.uid());

create policy "broker_trades owner write"
  on public.broker_trades for insert
  with check (user_id = auth.uid());

create policy "broker_trades owner update"
  on public.broker_trades for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "broker_trades owner delete"
  on public.broker_trades for delete
  using (user_id = auth.uid());

drop policy if exists "broker_trade_fills owner read"   on public.broker_trade_fills;
drop policy if exists "broker_trade_fills owner write"  on public.broker_trade_fills;
drop policy if exists "broker_trade_fills owner update" on public.broker_trade_fills;
drop policy if exists "broker_trade_fills owner delete" on public.broker_trade_fills;

create policy "broker_trade_fills owner read"
  on public.broker_trade_fills for select
  using (user_id = auth.uid());

create policy "broker_trade_fills owner write"
  on public.broker_trade_fills for insert
  with check (user_id = auth.uid());

create policy "broker_trade_fills owner update"
  on public.broker_trade_fills for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "broker_trade_fills owner delete"
  on public.broker_trade_fills for delete
  using (user_id = auth.uid());
