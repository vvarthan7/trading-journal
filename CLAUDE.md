# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server on http://localhost:5173
npm run typecheck  # tsc --noEmit — run this before committing
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
```

There is no test runner, linter, or formatter configured. `npm run typecheck` is the only gate,
and it is a strict one: `strict`, `noUnusedLocals`, `noUnusedParameters`, and
`verbatimModuleSyntax` are all on, so type-only imports must be written as `import type { … }`.

## Architecture

React 19 + Vite + TypeScript + Tailwind v4, with Supabase (Postgres + Auth) as the backend.
Only the dashboard journal (`journal_entries`) is persisted so far; every other screen still
runs on mock data.

**Supabase.** The client is `src/lib/supabase.ts`, reading `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. The schema is managed in the Supabase SQL
editor — there are no migrations in this repo. RLS on `journal_entries`: anyone may select;
insert/update/delete require the signed-in owner (`user_id = auth.uid()`, which is also the
column default). Sign-ups are disabled; the one user signs in on `SignInScreen`, an unlinked
page at `VITE_SIGN_IN_PATH` (default `/signin`) that sits outside the sidebar shell and
redirects to `/dashboard`. Nothing links to it — signed-out viewers see no sign-in control
anywhere, and the journal renders read-only. `AuthPanel` in the sidebar appears only when
signed in, for sign-out. An RLS-blocked write returns no error, only zero
rows, so writes chain `.select("id")` and treat an empty result as a failure.

**The store is the intended seam.** `src/store.tsx` exposes `useJournal()`, a context holding
`useState(MOCK)` plus mutators (`updateTrade`, `acceptFill`, `discardFill`, `toggleGate`, …).
Moving a slice to the backend means those `useState` calls become fetches and the mutators become
writes — every screen keeps working. Keep new data access going through this hook. `journal`
already works this way: it loads from `journal_entries`, edits apply locally at once and are
batched per row into one UPDATE 500ms later, and the camelCase ↔ snake_case mapping lives in
`src/lib/journalRows.ts`.

**That seam currently leaks.** `ReviewScreen.tsx` imports from `src/data/mock.ts` directly
instead of going through the store (`DEPOSIT_MARKS`, `EQUITY_LABELS`, `DISCIPLINE_STATS`,
`STRATEGY_STATS`, `STYLE_STATS`, `TAG_STATS`) — the derived/aggregate values the backend will
eventually compute. Prefer routing new ones through the store rather than adding to the
direct-import set.

**`src/types.ts` is written to be the DB schema**, not just view models — `Trade` is the round
trip, not the raw fill. Change it with that in mind; phase 2 builds tables from it.

**Routing** is flat in `App.tsx`: `/dashboard`, `/session`, `/trades`, `/trades/:id`, `/history`,
`/review`, `/playbook`, `/capture`, with `/` and `*` redirecting to `/dashboard` (the landing
page). `/trades` and `/history` are the same table over the same `trades` rows — `TradesScreen`
is scoped to `todayTrades` and owns the broker sync, `TradeHistoryScreen` shows every stored lot
and only ever reads Supabase (SmartAPI has no historical trade book, so history cannot come from
the broker). Neither is in the sidebar today; they link to each other, and each row's instrument
links to `/trades/:id`, passing `state.from` so Back returns to the table it came from.

**`TradeDetailScreen` runs on `dbTrades`**, so `:id` is a `public.trades` primary key.

**`trades` holds fact; three tables hang off it.** The split is deliberate: `trades` is what the
broker reported plus what Postgres generated from it, and everything you *write* about a trade
lives elsewhere, keyed on `trade_id`.

| | what | shape |
|---|---|---|
| `trades` | instrument, prices, times, P&L, R:R | one row per entry lot |
| `trade_details` | the idea, the notes, the strategies used | `kind = 'idea'` (at most one, partial unique index), `'note'` (any number, timestamped), or `'strategy'` (one row per strategy selected, no duplicates) |
| `trade_screenshots` | one row per image; bytes in the private bucket | any number per trade |

`stop_price` is the only hand-entered column left on `trades`, because Postgres generates
`initial_risk` and `rr` straight from it. It is excluded from `toInsert`, so a re-sync cannot
overwrite it.

**A multi-select is rows, not an array.** `strategies` was a `text[]` on `trades` and is now one
`kind = 'strategy'` row per selection, so everything you enter by hand is in one table and
`select trade_id from trade_details where kind = 'strategy' and body = 'KAR'` answers "every
trade that used KAR". The names are plain text from the fixed list in `src/lib/strategies.ts`
(there is no strategies table to point a foreign key at); that same list feeds the dashboard
journal's single-select, so do not fork it. `SessionScreen.tsx` still links to `/trades/:id` with a *mock* trade
id, so those links land on the "not in the journal" fallback; that screen is unlinked from the
sidebar and still entirely mock. These sit inside
`Shell`; the sign-in route is matched first, outside it, so it renders without the sidebar. Layout is a fixed 212px sidebar grid
plus a `min-w-[1180px]` main column — this is a desktop-only design, not responsive.

**The SQL files are a history, and order matters.** Run them in the SQL editor in the order
listed at the top of each: `trades.sql` → `trades_lot_seq.sql` → `trade_notes.sql` →
`trades_idea_strategies.sql` → `trade_screenshots.sql` → `trade_details.sql` →
`trade_screenshots_table.sql`. The later files migrate the earlier shapes forward —
`trade_details.sql` absorbs `trade_notes` and `trades.idea` then drops both;
`trade_screenshots_table.sql` adopts images already sitting in the bucket. Every migration block
is guarded on the old thing still existing, so re-running a file is safe. The superseded files
are kept because they are the record of what the database has actually had done to it.

**Screenshots: rows link, Storage holds.** `trade_screenshots` rows are the linkage — a folder
convention was not a foreign key, so nothing stopped a path outliving its trade. The bytes stay
in the **private** `trade-screenshots` bucket (same reasoning as `trades` having no public
select policy: the publishable key ships in the bundle), read through one-hour signed URLs. Path
layout is still `{user_id}/{trade_id}/{uuid}.{ext}`, which is what the bucket policies check.
`TradeScreenshots.tsx` takes files from the picker, a drop, or a window-level `paste` listener —
all three funnel into one `add()`.

**A failed write must never look saved.** Both trade writes are optimistic — the value lands on
screen before Postgres has seen it — so `flushTrade` re-reads the row on *any* failure, and RLS
counts as a failure by matching zero rows rather than erroring (`data.length === 0`). Screens
that let you edit a trade must render `tradesError`; `TradeDetailScreen` does, next to the stop.
A silently dropped write is the bug this shape is prone to.

**Writing saves differently depending on how it is written.** The idea is one box you keep
editing, so it debounces at 500ms like the journal's fields (and flushes on blur and on unmount,
since navigating away fires no blur). A note is posted deliberately, so it writes on Add and
commits on Save — a half-typed note is never stored. Clearing the idea deletes its row, because
`body` may not be blank.

**`trade_notes` and screenshots are the two deliberate exceptions to "data access goes through
`useJournal`".** Both are scoped to a single trade and read only on its detail screen, so they
load in the component (`src/lib/tradeNotes.ts`, `src/lib/tradeShots.ts`) rather than in the
store — fetching every note and every image for every trade at boot would be work nothing asks
for. Anything app-wide still belongs in the store.

`dbTrades` edits are debounced the same way the journal's are: `patchTrade` in `store.tsx`
applies the change locally at once and batches one UPDATE per row 500ms later, reloading only
when `stop_price` moved (Postgres regenerates `initial_risk` and `rr` from it; `notes` derives
nothing, and reloading mid-typing would fight the textarea).

**Derived numbers live in `src/lib/format.ts`**, not in components: `computeKpis`, `money`,
`price`, `rLabel`, `plan{Label,Tone}`, `pnlTone`, the date formatters, and `seriesPath` (which
builds the SVG `d` string for the hand-rolled equity and trade charts — there is no charting
library). Currency is `₹` with `en-IN` locale throughout, and negatives use `−` (U+2212).

**`src/components/Header.tsx` is dead code** — a sticky top nav superseded by `Sidebar.tsx`.
The README still describes it.

## Styling conventions

Tailwind v4 with tokens in `@theme` in `src/index.css`; there is no `tailwind.config.js`.

The design sits on a **2.8px grid**, so `index.css` sets `--spacing: 2.8px`. Every spacing
utility is rescaled: `p-4` is 11.2px, `h-20` is 56px, `px-12` is 33.6px. Do not "correct" a
spacing value to a Tailwind default — the odd-looking numbers are the design's real numbers.

Semantic color utilities come from the same block (`bg-bg`, `text-ink`, `text-dim`,
`border-line-strong`, `text-win/loss/warn`, `bg-accent-soft`, …). Use those rather than raw
hex. Where a color has to go into an inline `style` (SVG fills, `Meter` bars), import the
`WIN` / `LOSS` / `WARN` constants from `src/components/ui.tsx`.

Font sizes are pinned in brackets (`text-[13.5px]`, `text-[11.5px]`) to match the design
exactly; follow the surrounding file rather than reaching for `text-sm`.

Icons are Phosphor via a CDN stylesheet in `index.html`, used as `<i className="ph ph-…" />`.

Shared primitives live in `src/components/ui.tsx` (`Divider`, `Eyebrow`, `PillGroup`,
`FocusRating`, `Tag`, `Meter`). Screens are otherwise self-contained — markup is not
over-extracted into components, so match that granularity.

## Phase 2 notes (from README)

Vite already proxies `/api` to `http://127.0.0.1:8000`, so no CORS work is needed. An
INDstocks sync job is planned to write raw fills, group them FIFO into round trips, and surface
anything unreviewed in the Session screen's capture inbox. `Trade.path` is a plain number array
today; real charts would swap it for OHLC and `lightweight-charts`.

The "Absorption confirmed before entry?" control in `TradeDetailScreen.tsx` (and
`Trade.absorptionConfirmed`) is a deliberate addition beyond the original design; it feeds the
Review screen's expectancy split.
