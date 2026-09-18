-- Corrects the unique key on public.trades. Run this after trades.sql.
--
-- WHY
-- The original key was (user_id, entry_fill_id, exit_fill_id). A lot that is still open has
-- exit_fill_id = '', so when it later closes its key changes — and a re-sync inserts a second
-- row instead of updating the first, leaving a stale open row behind. Any position that is
-- closed in more than one go duplicates.
--
-- A lot's identity is its position within its entry fill, which never changes:
--
--   Buy 150 (fill F1)   ->  lot_seq 0, qty 150, open
--   Sell 75  (fill F2)  ->  lot_seq 0, qty 75, closed by F2
--                           lot_seq 1, qty 75, still open
--   Sell 75  (fill F3)  ->  lot_seq 1 updates in place, closed by F3
--
-- Keying on (entry_fill_id, lot_seq) means each sync UPDATES the row it already wrote, so a
-- stop price typed against a lot survives the position being closed later.
--
-- exit_fill_id stays as a data column; it is simply no longer part of the identity.

alter table public.trades
  add column if not exists lot_seq smallint not null default 0;

alter table public.trades
  drop constraint if exists trades_fill_unique;

alter table public.trades
  drop constraint if exists trades_lot_unique;

alter table public.trades
  add constraint trades_lot_unique unique (user_id, entry_fill_id, lot_seq);
