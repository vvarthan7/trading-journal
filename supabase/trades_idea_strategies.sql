-- The two intent columns on public.trades: what the trade was for, and which strategies it used.
--
-- Run this in the Supabase SQL editor, after trades.sql. Like the other files here, this is the
-- record of what was run, not a migration anything applies automatically.
--
-- WHY COLUMNS AND NOT A TABLE
-- Both are exactly one value per trade, unlike trade_notes (many per trade, each timestamped).
-- `strategies` is a text[] rather than a join table because the vocabulary is a short fixed list
-- held in the app (src/lib/strategies.ts) — there is no strategies table for a foreign key to
-- point at, and array containment covers the only query this needs:
--
--   select * from trades where strategies @> array['KAR'];      -- used KAR
--   select * from trades where strategies && array['KAR','123']; -- used either
--
-- Both are hand-entered, so like stop_price they are left out of the sync's column list and
-- survive a re-sync untouched.

alter table public.trades
  -- The idea behind the trade, in your own words. '' rather than NULL so the textarea never has
  -- to think about which empty it is looking at.
  add column if not exists idea text not null default '';

alter table public.trades
  -- One or more strategy names. Empty array means none recorded yet.
  add column if not exists strategies text[] not null default '{}';

-- Finding every trade that used a given strategy is the point of storing them separately.
create index if not exists trades_strategies_idx
  on public.trades using gin (strategies);
