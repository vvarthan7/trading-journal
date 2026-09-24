-- Brokerage and transaction charges on public.trades.
--
-- Run this in the Supabase SQL editor, after trade_details_groups.sql. Like the other files
-- here, this is the record of what was run, not a migration anything applies automatically.
--
-- WHERE THE NUMBERS COME FROM
-- The broker proxy asks SmartAPI's charges estimator about each of today's orders at sync time,
-- and the app splits each order's charges across the lots it touched, pro rata by quantity:
--
--   Buy 150 (order O1, ₹40 charges)  ->  lot A qty 75, lot B qty 75: ₹20 of O1 each
--   Sell 75 (order O2, ₹30 charges)  ->  closes lot A: A carries ₹20 + ₹30
--
-- So an open lot carries only its entry order's share, and picks up the exit share on the sync
-- that closes it. Summed over every lot, the charges add back up to the orders'.
--
-- These are broker fact, like the option identity columns: they DO belong in toInsert, and a
-- re-sync is free to overwrite them. Rows synced before this file was run stay NULL — SmartAPI
-- has no historical trade book, so there is nothing to backfill them from.
--
--   brokerage    — the broker's own fee
--   txn_charges  — everything else: exchange transaction charges, STT/CTT, stamp duty, SEBI fees
--                  and GST

alter table public.trades
  add column if not exists brokerage   numeric(18, 2),
  add column if not exists txn_charges numeric(18, 2);

-- P&L after costs. Written out in full rather than as `pnl - …` because a generated column may
-- not reference another one. NULL until the lot is closed and its charges are known, so a gross
-- number can never be mistaken for a net one.
alter table public.trades
  add column if not exists net_pnl numeric(18, 2) generated always as (
    (exit_price - entry_price) * quantity *
    (case when direction = 'long' then 1 else -1 end)
    - brokerage - txn_charges
  ) stored;
