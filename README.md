# The Journal — trading journal

A personal trading journal built with React 19, Vite, TypeScript and Tailwind v4, with
Supabase (Postgres + Auth) as the backend. It deploys to GitHub Pages.

The **Dashboard** is live: its trade journal is stored in Supabase and anyone can view it,
but only the signed-in owner can edit it. The other screens are built but still run on mock
data, and they're hidden from the sidebar for now.

## Run it

```bash
cd thejournal
npm install
npm run dev          # http://localhost:5173/trading-journal/
npm run typecheck    # before committing — the only gate (no tests or linter)
npm run build        # tsc -b && vite build
npm run preview      # serve the production build
```

Create `.env.local` (it's gitignored):

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_SIGN_IN_PATH=/signin    # optional; pick something private
```

## What's there

### Dashboard (`/dashboard`, the landing page)

- **Trade journal**: one editable row per trade. It records date/time, instrument, trade type,
  MIS/Normal, strategy, profit/loss and skill/luck, plus eight yes/no behaviour flags (rules
  followed, position sizing, FOMO, revenge, early entry, early exit, overtrading, wrong trade).
  Each answer shows green or red depending on whether it's the good answer.
- **Level play**: six levels of ten boxes. Journal rows fill them in order, shown as W or L.

### Supabase

- The client is in `src/lib/supabase.ts`. The schema lives in the Supabase SQL editor; this
  repo has no migrations.
- Only the `journal_entries` table exists so far. Its RLS lets anyone select, and allows
  insert/update/delete only when `user_id = auth.uid()` (which is also the column default).
- Edits show up in the UI straight away. They're batched per row and written as one UPDATE
  500ms after the last change, and pending writes are flushed on `pagehide` and sign-out.
- A write that RLS blocks returns zero rows rather than an error. So writes chain
  `.select("id")`, treat an empty result as a failure, show the error in the journal header and
  reload from the DB.
- `src/lib/journalRows.ts` converts between camelCase and snake_case.

### Auth

- Sign-ups are disabled; there's only one user.
- The sign-in page lives at `VITE_SIGN_IN_PATH` (default `/signin`). Nothing links to it, it has
  no sidebar, and it redirects to `/dashboard` after sign-in.
- Signed-out visitors see the journal read-only and no sign-in control anywhere. Once signed
  in, the sidebar shows your email and a sign-out link.

### Other screens (mock data, hidden from the sidebar)

You can still reach them by URL: `/session`, `/trades`, `/trades/:id`, `/review`, `/playbook`,
`/capture`. Their sidebar entries are commented out in `src/components/Sidebar.tsx`.

## Layout

Every screen reads from `useJournal()` in `src/store.tsx`, and new data access should go
through it too. The journal slice already talks to Supabase this way. The other slices are
still `useState(MOCK)`. Two screens break this rule and import from `src/data/mock.ts`
directly: `ReviewScreen.tsx` and `TradeDetailScreen.tsx`.

```
src/
  index.css               design tokens (Tailwind v4 @theme)
  types.ts                domain model, written to double as the DB schema
  store.tsx               useJournal(): auth, Supabase journal sync, mock slices
  data/mock.ts            mock data for the non-dashboard screens
  lib/
    supabase.ts           Supabase client
    journalRows.ts        journal_entries row ↔ JournalEntry mapping
    format.ts             money/R formatting, KPI maths, levels, SVG path helpers
  components/
    Sidebar.tsx           nav + account block
    AuthPanel.tsx         signed-in email + sign out
    TradeJournal.tsx      the dashboard's editable journal table
    LevelPlay.tsx         the dashboard's 6×10 level grid
    ui.tsx                Divider, Eyebrow, PillGroup, FocusRating, Tag, Meter
    Header.tsx            unused (superseded by Sidebar)
  screens/
    DashboardScreen.tsx   level play + trade journal
    SignInScreen.tsx      unlinked email/password sign-in
    SessionScreen.tsx     today's timeline, capture inbox, discipline rail
    TradesScreen.tsx      log grouped by day, filters
    TradeDetailScreen.tsx chart, facts, notes, plan adherence
    ReviewScreen.tsx      KPIs, equity curve, breakdowns, capital ledger
    PlaybookScreen.tsx    strategies, rules, hard limits
    CaptureScreen.tsx     broker capture sources and rules
```

The layout is desktop-only: a 168px sidebar next to a `min-w-[1180px]` main column.

### The spacing trick

The design uses a 2.8px grid rather than Tailwind's default 4px. `index.css` sets
`--spacing: 2.8px`, which makes `px-12` exactly 33.6px and `h-20` exactly 56px. Every spacing
utility then lands on the design's real numbers, so don't round them to Tailwind defaults.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `master`.
You can also run it by hand.

- `vite.config.ts` sets `base: "/trading-journal/"`, and the router uses the same basename.
- The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the repo's
  Actions **variables**.
- GitHub Pages has no SPA fallback, so the workflow copies `index.html` to `404.html`. That
  keeps deep links and refreshes working.

## Deviation from the design

The trade detail rail has one extra control the design didn't include:
**"Absorption confirmed before entry?"**. It feeds the Review screen's expectancy split.
Delete that block in `TradeDetailScreen.tsx` and the `absorptionConfirmed` field in
`types.ts` if you don't want it.
