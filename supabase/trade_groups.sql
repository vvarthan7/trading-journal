-- Trade baskets: several legs that were one decision.
--
-- Run this in the Supabase SQL editor, after trade_screenshots_table.sql. Like the other files
-- here, this is the record of what was run, not a migration anything applies automatically.
--
-- WHY THIS SHAPE
-- `trades` stores one entry fill matched to one exit fill, which is right for a single
-- directional position and wrong for a hedged one. Selling a put and buying a further OTM put
-- to cut margin is two rows but one trade; a synthetic future with a hedge is four rows but one
-- trade. Left ungrouped, the hedge leg — which is *designed* to lose — counts as its own losing
-- trade, so the trade count inflates and the win rate stops meaning anything.
--
-- A group is a layer over legs, the same way trade_details is. The legs stay exactly as the
-- broker reported them; nothing is merged, summed or rewritten in the database. Net P&L is the
-- sum of the legs and is computed in the app, because every leg is already loaded there.
--
--   sell NIFTY 24800 PE  ┐
--   buy  NIFTY 24600 PE  ┘  one group, "Option Selling W Hedge"
--
-- MOST TRADES ARE NOT GROUPS. A plain option buy, a futures trade, an equity position: each
-- stays one row with group_id NULL and behaves exactly as it did before this file was run.
--
-- `direction` is the basket's net bias. A single leg already has its own long/short; a basket
-- needs one of its own because its legs deliberately point both ways — a long synthetic is long
-- CE plus short PE, and neither leg's direction describes the trade.
--
-- `risk_amount` is hand-typed, because a basket's risk is not the sum of its legs' stops: the
-- whole point of the hedge is that the legs offset. NULL means "fall back to adding up whatever
-- per-leg stops are set", which is what the app does.

create table if not exists public.trade_groups (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- The earliest leg's date. Sorting and the month filter work off this.
  trade_date  date not null,

  name        text not null check (btrim(name) <> ''),

  -- From the fixed list in src/lib/tradeTypes.ts; '' until picked. Plain text for the same
  -- reason strategies are: there is no table to point a foreign key at.
  trade_type  text not null default '',

  direction   text not null default 'neutral'
              check (direction in ('long', 'short', 'neutral')),

  -- Risk on the whole basket. NULL means "add up the legs' stops instead".
  risk_amount numeric(18, 2),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trade_groups_user_date_idx
  on public.trade_groups (user_id, trade_date desc);

-- `updated_at` maintenance; the function already exists from trades.sql.
drop trigger if exists trade_groups_touch_updated_at on public.trade_groups;
create trigger trade_groups_touch_updated_at
  before update on public.trade_groups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same reasoning as trades: a private trading record, and the publishable key ships in the
-- browser bundle, so there is no public select policy.
-- ---------------------------------------------------------------------------
alter table public.trade_groups enable row level security;

drop policy if exists "trade groups owner read"   on public.trade_groups;
drop policy if exists "trade groups owner insert" on public.trade_groups;
drop policy if exists "trade groups owner update" on public.trade_groups;
drop policy if exists "trade groups owner delete" on public.trade_groups;

create policy "trade groups owner read"
  on public.trade_groups for select
  using (user_id = auth.uid());

create policy "trade groups owner insert"
  on public.trade_groups for insert
  with check (user_id = auth.uid());

create policy "trade groups owner update"
  on public.trade_groups for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trade groups owner delete"
  on public.trade_groups for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- What a group needs from `trades`
--
-- Every column below is added, never altered: existing rows take the default or NULL and
-- nothing is rewritten. The generated pnl / initial_risk / rr definitions are untouched, so
-- nothing recomputes.
-- ---------------------------------------------------------------------------

-- `on delete set null`, deliberately: deleting a basket ungroups its legs. A group is an
-- annotation over broker fact and must never be able to delete it.
alter table public.trades
  add column if not exists group_id bigint
  references public.trade_groups (id) on delete set null;

create index if not exists trades_group_idx on public.trades (group_id);

-- A single lot's trade type, from the same vocabulary a basket uses, so singles and baskets can
-- be compared side by side. '' means "never set by hand" and the app shows the type it derives
-- from the instrument instead — which is why this is excluded from toInsert like stop_price:
-- only a deliberate override ever reaches this column, and a re-sync must not wipe it.
alter table public.trades
  add column if not exists trade_type text not null default '';

-- ---------------------------------------------------------------------------
-- Broker-reported option identity
--
-- SmartAPI sends all five of these on every fill and the app threw them away, leaving strike,
-- expiry and CE/PE trapped inside the `instrument` string. The basket suggester needs to know
-- which legs share an underlying and an expiry, and telling a synthetic future from a hedged
-- sell means comparing strikes. Unlike the two columns above these are broker fact, so they
-- DO belong in toInsert and a re-sync is free to overwrite them.
-- ---------------------------------------------------------------------------
alter table public.trades
  add column if not exists underlying  text not null default '',  -- symbolgroup, e.g. NIFTY
  add column if not exists expiry      date,                      -- parsed from expirydate
  add column if not exists strike      numeric(18, 4),            -- 0 for non-options
  add column if not exists option_type text not null default '',  -- CE | PE | ''
  add column if not exists lot_size    integer;                   -- marketlot

-- How the suggester reads the table: today's ungrouped legs on one underlying and expiry.
create index if not exists trades_basket_lookup_idx
  on public.trades (user_id, trade_date, underlying, expiry)
  where group_id is null;
