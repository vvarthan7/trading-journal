-- What you write about a basket belongs to the basket, not to one arbitrary leg.
--
-- Run this in the Supabase SQL editor, after trade_groups.sql.
--
-- WHY
-- A basket is one trade, so it has one idea, one notes thread and one set of strategies. Hanging
-- them off a leg would mean picking a leg to be "the" leg, and that choice would be wrong the
-- moment the leg was removed from the basket — the writing would go with it.
--
-- So a trade_details row now belongs to exactly one of the two: a trade, or a group. It is the
-- same table and the same three kinds; only the owner column differs.
--
-- This is the one place in the whole basket change that *alters* an existing table rather than
-- adding to it: trade_id loses its NOT NULL. That is a widening — every row that was legal
-- before is still legal — and every existing row has trade_id set and group_id NULL, so the new
-- check passes for all of them. Confirm before running:
--
--   select count(*) from public.trade_details where trade_id is null;  -- must be 0

alter table public.trade_details
  add column if not exists group_id bigint
  references public.trade_groups (id) on delete cascade;

alter table public.trade_details
  alter column trade_id drop not null;

-- Exactly one owner. Without this a row could belong to both, or to neither and be unreachable.
alter table public.trade_details
  drop constraint if exists trade_details_one_owner;

alter table public.trade_details
  add constraint trade_details_one_owner
  check ((trade_id is null) <> (group_id is null));

-- ---------------------------------------------------------------------------
-- The existing partial indexes, restated per owner
--
-- Each one was written as "per trade"; a NULL trade_id does not collide in a unique index, so
-- left alone they would silently stop constraining group-owned rows — two ideas on one basket,
-- or the same strategy chosen twice. Each gets a group-side twin.
-- ---------------------------------------------------------------------------

-- One idea per basket, exactly as trade_details.sql gives one idea per trade.
create unique index if not exists trade_details_one_group_idea_idx
  on public.trade_details (group_id)
  where kind = 'idea' and group_id is not null;

-- One row per strategy per basket, as trade_details_strategies.sql does per trade.
create unique index if not exists trade_details_one_of_each_group_strategy_idx
  on public.trade_details (group_id, body)
  where kind = 'strategy' and group_id is not null;

-- The only read there is: everything written about one basket, oldest first.
create index if not exists trade_details_group_idx
  on public.trade_details (group_id, created_at)
  where group_id is not null;
