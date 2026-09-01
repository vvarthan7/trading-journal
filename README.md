# Ledgerbook — trading journal

Phase 1: the four screens from the design, running on mock data.
Phase 2: swap `src/data/mock.ts` for a real API without touching any screen.

## Run it

```bash
cd ledgerbook
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # before committing
```

## Why it's laid out this way

Every screen reads from `useJournal()` in `src/store.tsx`. That hook is the only
place that knows where data comes from. In phase 2 it starts calling the API and
nothing else changes.

```
src/
  index.css               design tokens (Tailwind v4 @theme)
  types.ts                domain model — mirrors the DB schema
  store.tsx               ← the single seam between UI and data
  data/mock.ts            placeholder data, deleted in phase 2
  lib/format.ts           money/R formatting, KPI maths, SVG path helpers
  components/
    Header.tsx            sticky nav + running capital
    ui.tsx                Divider, PillGroup, FocusRating, Tag, Meter
  screens/
    SessionScreen.tsx     today's timeline, capture inbox, discipline rail
    TradesScreen.tsx      log grouped by day, filters
    TradeDetailScreen.tsx chart, facts, notes, plan adherence
    ReviewScreen.tsx      KPIs, equity curve, breakdowns, capital ledger
```

### The spacing trick

The design is built on a 2.8px grid, not Tailwind's default 4px. `index.css`
overrides `--spacing: 2.8px`, so `px-12` is exactly 33.6px, `h-20` is exactly
56px, and every utility lands on the design's real numbers instead of an
approximation.

## Phase 2 — wiring the database

1. **Backend**: FastAPI + SQLite at `http://127.0.0.1:8000`. Vite already
   proxies `/api` to it (see `vite.config.ts`), so no CORS work is needed.
2. **Schema**: build the tables from `src/types.ts` — it was written to be the
   schema, not just view models.
3. **Replace the store internals**: `useState(TRADES)` becomes a fetch; the
   mutators (`updateTrade`, `acceptFill`) become PATCH/POST calls. Consider
   TanStack Query at that point.
4. **INDstocks sync**: a scheduled job hits `GET /trade-book`, writes raw fills,
   groups them FIFO into round trips, and anything unreviewed appears in the
   Session screen's capture inbox.
5. **Real charts**: `Trade.path` is a plain number array today. Swap it for OHLC
   from `GET /market/historical/{interval}` and render with `lightweight-charts`
   instead of the hand-rolled SVG.

## Deviation from the design

The trade detail rail has one extra control the design didn't include:
**"Absorption confirmed before entry?"**. It feeds the Review screen's
expectancy split. Delete that block in `TradeDetailScreen.tsx` and the
`absorptionConfirmed` field in `types.ts` if you don't want it.
