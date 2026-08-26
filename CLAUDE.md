# Failball architecture guide

Failball is a reverse fantasy football application built with Next.js 15,
React 19, TypeScript, Tailwind CSS v4, PostgreSQL, and Prisma. Poor NFL
performance earns points.

## Commands

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
npm test
npx tsc --noEmit
npm run build
npm run monitor
```

`npm run monitor:headed` opens the Playwright browser monitor with developer
tools. Keep `.env` values based on `.env.example`; production credentials and
provider configuration are managed outside the repository.

## Application layout

- `src/app/` contains App Router pages and route handlers.
  - `src/app/leagues/[id]/` contains league pages for rosters, lineups, drafts,
    matchups, standings, trades, waivers, commissioner tools, and history.
  - `src/app/api/` contains authentication, user, league, draft, scoring,
    transaction, and scheduled-sync endpoints.
- `src/lib/` contains domain logic.
  - `scoring/` implements reverse scoring and matchup updates.
  - `draft/` implements snake and auction draft state and validation.
  - `trades/` implements trade validation and commissioner actions.
  - `waivers/` implements rolling-priority and FAAB claim resolution.
  - `nfl/` contains provider interfaces, ingestion, derived statistics, and live sync.
  - `realtime/` contains event publication and client subscriptions.
  - `transactions/` records the league activity feed.
  - `roster/`, `schedule/`, and `history/` implement their corresponding domains.
  - `email/` contains shared Resend delivery and event notification templates.
- `prisma/schema.prisma` is the source of truth for the PostgreSQL data model.
- `prisma/migrations/` contains generated schema migrations.
- `tests/` contains Vitest tests for domain logic and notifications.
- `docs/IMPLEMENTATION_PLAN.md` documents the system design and implementation status.

## Data and transaction boundaries

Route handlers use the shared Prisma client in `src/lib/prisma.ts`. League
activity is recorded through the transactions domain and must remain intact
when adding new side effects.

Trade and waiver email notifications are additive. Resolve recipients through
Prisma, dispatch only after the surrounding database transaction commits, and
catch delivery errors so they cannot roll back league state. Respect
`User.emailNotificationsEnabled`. The shared sender and URL fallback logic live
under `src/lib/email/`.

Rosters and lineup players lock automatically at their NFL game kickoff. This
is intentional; do not add a manual league-wide or commissioner roster-lock
switch.

## NFL sync and scoring

Scheduled handlers live under `src/app/api/sync/`:

- `schedule` refreshes NFL games.
- `players` refreshes player and injury metadata.
- `live` ingests current games, derives statistics, and recomputes matchup scores.
- `stats` backfills or audits a completed week.
- `charting` reconciles charting-only fields after games.
- `finalize` completes eligible weeks and rebuilds records.
- `waivers` processes eligible league claims.

All sync handlers require `CRON_SECRET`; Vercel Cron authenticates with
`Authorization: Bearer <secret>`, and local/manual calls may use
`x-cron-secret`. Production schedules are defined in `vercel.json`.

Live score changes are published by `src/lib/realtime/events.ts` and served by
the authenticated `/api/live/stream` Server-Sent Events route. Client code uses
`EventSource` through `src/lib/realtime/useLiveScores.ts`; the stream sends
heartbeat frames to keep connections open.

## Testing

Vitest configuration is in `vitest.config.ts`; tests live under `tests/`.
Prefer pure domain tests or narrow fake-Prisma clients. Mock email delivery and
other network providers. Never make real Resend or NFL-provider requests in
unit tests.

Before opening a pull request, run TypeScript checking. Run the full Vitest
suite and production build before considering the change complete.