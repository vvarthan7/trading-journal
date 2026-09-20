-- Strategies join the idea and the notes in trade_details.
--
-- Run this in the Supabase SQL editor, after trade_details.sql.
--
-- WHY
-- `strategies` was a text[] on `trades`, which put one hand-entered thing in a different place
-- from every other hand-entered thing — you would look in trade_details for what you said about
-- a trade and not find the strategy there. It is the same kind of fact as the idea and the
-- notes, so it belongs in the same table.
--
-- A selection is one row per strategy, `body` holding the name:
--
--   kind = 'idea'      at most one per trade
--   kind = 'note'      any number, each timestamped
--   kind = 'strategy'  any number, one per strategy selected, no duplicates
--
-- So "which strategies did this trade use" is `where kind = 'strategy'`, and "every trade that
-- used KAR" is a plain lookup rather than array containment:
--
--   select trade_id from public.trade_details where kind = 'strategy' and body = 'KAR';
--
-- The names come from src/lib/strategies.ts and are stored as plain text, exactly as
-- `journal_entries.strategy` already is. There is no strategies table to point a foreign key at.

-- 'strategy' has to be a legal kind before any row can use it.
alter table public.trade_details
  drop constraint if exists trade_details_kind_check;

alter table public.trade_details
  add constraint trade_details_kind_check
  check (kind in ('idea', 'note', 'strategy'));

-- A trade either used a strategy or it did not; selecting it twice is not a thing.
create unique index if not exists trade_details_one_of_each_strategy_idx
  on public.trade_details (trade_id, body)
  where kind = 'strategy';

-- Reading back every trade that used a given strategy.
create index if not exists trade_details_strategy_idx
  on public.trade_details (body)
  where kind = 'strategy';

-- ---------------------------------------------------------------------------
-- Migrate trades.strategies in, then retire the column
--
-- Guarded on the column still existing, so running this file twice copies nothing the second
-- time. Skips blanks, and `on conflict do nothing` covers a half-finished earlier run.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trades' and column_name = 'strategies'
  ) then
    insert into public.trade_details (user_id, trade_id, kind, body, created_at, updated_at)
    select t.user_id, t.id, 'strategy', s, t.updated_at, t.updated_at
    from public.trades t
    cross join lateral unnest(t.strategies) as s
    where btrim(s) <> ''
    on conflict do nothing;

    drop index if exists public.trades_strategies_idx;
    alter table public.trades drop column strategies;
  end if;
end
$$;
