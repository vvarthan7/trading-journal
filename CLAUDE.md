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

React 19 + Vite + TypeScript + Tailwind v4, no backend yet. Phase 1 is the design running on
mock data; phase 2 swaps in a FastAPI + SQLite service without touching the screens.

**The store is the intended seam.** `src/store.tsx` exposes `useJournal()`, a context holding
`useState(MOCK)` plus mutators (`updateTrade`, `acceptFill`, `discardFill`, `toggleGate`, …).
In phase 2 those `useState` calls become fetches and the mutators become PATCH/POST — every
screen keeps working. Keep new data access going through this hook.

**That seam currently leaks.** Two screens import from `src/data/mock.ts` directly instead of
going through the store: `ReviewScreen.tsx` (`DEPOSIT_MARKS`, `EQUITY_LABELS`,
`DISCIPLINE_STATS`, `STRATEGY_STATS`, `STYLE_STATS`, `TAG_STATS`) and `TradeDetailScreen.tsx`
(`BUCKET_NOTE`). These are the derived/aggregate values the backend will eventually compute.
Prefer routing new ones through the store rather than adding to the direct-import set.

**`src/types.ts` is written to be the DB schema**, not just view models — `Trade` is the round
trip, not the raw fill. Change it with that in mind; phase 2 builds tables from it.

**Routing** is flat in `App.tsx`: `/dashboard`, `/session`, `/trades`, `/trades/:id`, `/review`, `/playbook`,
`/capture`, with `/` and `*` redirecting to `/dashboard` (the landing page). Layout is a fixed 212px sidebar grid
plus a `min-w-[1180px]` main column — this is a desktop-only design, not responsive.

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
