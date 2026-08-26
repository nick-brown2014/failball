# Failball

Failball is a reverse fantasy football application: NFL players earn fantasy
points for poor performance, such as interceptions, sacks, fumbles, missed
kicks, drops, and other negative outcomes. League members draft the players
they expect to struggle and compete to post the highest score.

## Stack

- Next.js 15, React 19, TypeScript, and Tailwind CSS v4
- PostgreSQL with Prisma
- NextAuth.js credentials authentication
- Resend email delivery
- Vercel hosting and scheduled jobs
- Vitest for unit tests and Playwright for browser monitoring

## Features

- League creation, invitations, settings, and standings
- Snake and auction drafts with realtime updates
- Rosters, weekly lineups, and automatic player locks at NFL kickoff
- Weekly schedules, live matchup scoring, playoffs, and season history
- Trade proposals, counteroffers, voting, commissioner review, and transaction history
- Rolling or FAAB waivers, free agency, and roster validation
- Commissioner controls for league, roster, trade, and schedule administration
- Email notifications for trade events and waiver results, with a per-user preference

## Local development

1. Copy `.env.example` to `.env` and provide the documented values.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Prisma Client and apply database migrations:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

4. Seed the database:

   ```bash
   npm run db:seed
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

The application is available at `http://localhost:3000`.

## Testing and builds

```bash
npm test
npx tsc --noEmit
npm run build
```

To watch browser console, page, and network errors while the development server
is running:

```bash
npm run monitor
npm run monitor:headed
```

## NFL data pipeline

Provider adapters in `src/lib/nfl/` ingest schedules, player metadata, live
play-by-play, historical stats, and charting data. Derived weekly statistics
feed the scoring engine and matchup records. Live score updates are published
to signed-in clients through the `/api/live/stream` Server-Sent Events route.

Vercel schedules the production jobs defined in `vercel.json`:

| Route | Schedule | Purpose |
| --- | --- | --- |
| `/api/sync/schedule` | Daily at 09:00 UTC | Refresh the NFL schedule |
| `/api/sync/players` | Daily at 09:30 UTC | Refresh players and injuries |
| `/api/sync/live` | Every minute | Ingest live games and recompute scores |
| `/api/sync/charting` | Tuesdays at 08:00 UTC | Reconcile charting-only statistics |
| `/api/sync/finalize` | Daily at 10:00 UTC | Finalize completed weeks and standings |
| `/api/sync/waivers` | Daily at 11:00 UTC | Process eligible league waiver claims |

Sync endpoints require `CRON_SECRET` through the Vercel bearer token or
`x-cron-secret` header. The stats backfill route is available for historical
re-derivation and audits but is not scheduled in `vercel.json`.

## Project layout

- `src/app/` — application pages and API route handlers
- `src/lib/` — domain services for scoring, drafts, trades, waivers, NFL data,
  realtime events, scheduling, roster rules, history, and transactions
- `prisma/schema.prisma` — PostgreSQL data model
- `prisma/migrations/` — database migrations
- `tests/` — Vitest unit tests
- `docs/IMPLEMENTATION_PLAN.md` — architecture and implementation history
