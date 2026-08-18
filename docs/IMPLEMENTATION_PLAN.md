# Failball Implementation Plan

This document outlines the phased implementation plan for the Failball fantasy football application.

## Overview

Failball is a "reverse fantasy football" app where players score points for poor performance. The database schema has been designed to support all core features including user authentication, leagues, teams, drafts, trades, waivers, matchups, and historical records.

## Technology Stack

- **Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS v4
- **Backend**: Next.js API Routes / Server Actions
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js (Auth.js) with credentials and OAuth providers
- **External Data**: NFL player stats API integration (TBD)

---

## Phase 1: Authentication & User Management

**Goal**: Secure user registration, login, and session management

### Tasks

1. **Install and configure NextAuth.js**
   - Add `next-auth` package
   - Create `/api/auth/[...nextauth]` route
   - Configure session strategy (JWT or database sessions)

2. **Implement authentication providers**
   - Email/password with bcrypt hashing
   - Google OAuth (optional)
   - Email verification flow

3. **Create auth UI components**
   - Login page
   - Registration page
   - Password reset flow
   - User profile/settings page

4. **Middleware and route protection**
   - Protect authenticated routes
   - Redirect logic for logged-in/logged-out users

### Database Models Used
- User, Account, Session, VerificationToken

### Estimated Time: 1-2 weeks

---

## Phase 2: League Management

**Goal**: Users can create, join, and manage leagues

### Tasks

1. **League creation flow**
   - Create league form with settings
   - Auto-assign creator as COMMISSIONER
   - Generate default LeagueSettings with Failball scoring

2. **League invitation system**
   - Generate invite codes/links
   - Join league via invite code
   - Public league discovery (optional)

3. **League settings management**
   - Commissioner-only settings page
   - Customize scoring values
   - Configure roster slots, playoff settings, trade deadlines

4. **League dashboard**
   - View all leagues user belongs to
   - League standings
   - Recent activity feed

### Database Models Used
- League, LeagueMembership, LeagueInvite, LeagueSettings

### Estimated Time: 2-3 weeks

---

## Phase 3: Team & Roster Management

**Goal**: Users can create teams and manage rosters

### Tasks

1. **Team creation**
   - Create team when joining league
   - Team naming and customization

2. **Roster display**
   - View current roster with player details
   - Starter/bench/IR slot management
   - Position eligibility validation

3. **Player search and details**
   - Integrate with external NFL API
   - Player search functionality
   - Player detail pages with stats

4. **Lineup management**
   - Set weekly lineup
   - Move players between slots
   - Lineup lock at game time

### Database Models Used
- Team, RosterSlot

### External Integration
- NFL player data API (e.g., ESPN, Sleeper, or custom)

### Estimated Time: 2-3 weeks

---

## Phase 4: Draft System

**Goal**: Live snake draft functionality

### Tasks

1. **Draft setup**
   - Commissioner sets draft date/time
   - Randomize or set draft order
   - Configure seconds per pick

2. **Live draft room**
   - Real-time draft board (WebSocket or polling)
   - Current pick indicator
   - Pick timer with auto-pick
   - Player queue/watchlist

3. **Draft pick logic**
   - Snake order calculation
   - Pick validation (player available, correct turn)
   - Auto-draft for AFK users

4. **Post-draft**
   - Generate initial rosters from picks
   - Draft recap/results page

### Database Models Used
- Draft, DraftOrder, DraftPick

### Technical Considerations
- Real-time updates (consider Pusher, Socket.io, or Server-Sent Events)
- Concurrent pick handling
- Draft state persistence

### Estimated Time: 3-4 weeks

---

## Phase 5: Matchups & Scoring

**Goal**: Weekly head-to-head matchups with Failball scoring

### Tasks

1. **Schedule generation**
   - Generate regular season matchups
   - Playoff bracket generation
   - Bye week handling

2. **Scoring engine**
   - Fetch player stats from external API
   - Apply Failball scoring rules
   - Calculate weekly scores per team

3. **Matchup display**
   - Weekly matchup view
   - Live scoring updates during games
   - Historical matchup results

4. **Standings**
   - League standings page
   - Playoff picture/scenarios
   - Tiebreaker logic

### Database Models Used
- Matchup, Team (wins/losses/points)

### Technical Considerations
- Scheduled jobs for score updates (cron or serverless functions)
- Caching strategy for API calls
- Score recalculation handling

### Estimated Time: 3-4 weeks

---

## Phase 6: Trades

**Goal**: Team-to-team player trades with league oversight

### Tasks

1. **Trade proposal**
   - Select players from both teams
   - Add trade notes/messages
   - Set expiration time

2. **Trade response**
   - Accept/reject/counter trade
   - Notification system

3. **Trade review period**
   - League-wide veto voting
   - Commissioner override
   - Trade deadline enforcement

4. **Trade processing**
   - Execute approved trades
   - Update rosters atomically
   - Transaction log entry

### Database Models Used
- Trade, TradePlayer, Transaction

### Estimated Time: 2 weeks

---

## Phase 7: Waivers & Free Agency

**Goal**: Waiver wire and free agent acquisition system

### Tasks

1. **Waiver claims**
   - Submit waiver claims with priority
   - Optional FAAB bidding
   - Drop player selection

2. **Waiver processing**
   - Scheduled waiver runs (e.g., Wednesday)
   - Priority-based claim resolution
   - FAAB bid resolution

3. **Free agent pickups**
   - Instant add/drop after waivers clear
   - Roster limit enforcement

4. **Waiver settings**
   - Rolling vs reset priority
   - FAAB budget management

### Database Models Used
- WaiverClaim, RosterSlot, Transaction

### Technical Considerations
- Scheduled waiver processing job
- Atomic roster updates
- Conflict resolution

### Estimated Time: 2 weeks

---

## Phase 8: Commissioner Tools

**Goal**: League management capabilities for commissioners

### Tasks

1. **League settings management**
   - Edit all league settings
   - Scoring adjustments

2. **Roster management**
   - Force add/drop players
   - Reverse transactions
   - Edit team rosters

3. **Trade management**
   - Push through trades
   - Veto trades
   - Reverse trades

4. **League controls**
   - Pause/resume draft
   - Lock/unlock rosters
   - Remove/add members
   - Transfer commissioner role

### Database Models Used
- All models (commissioner has elevated access)

### Estimated Time: 1-2 weeks

---

## Phase 9: Historical Data & Records

**Goal**: Track and display historical league data

### Tasks

1. **Season archival**
   - End-of-season snapshot
   - Store final standings
   - Playoff results

2. **All-time records**
   - League champions history
   - Individual team records
   - Highest/lowest scores

3. **Statistics pages**
   - Career stats per user
   - Head-to-head records
   - Transaction history

### Database Models Used
- SeasonRecord, Transaction

### Estimated Time: 1-2 weeks

---

## Phase 10: Polish & Launch

**Goal**: Production readiness

### Tasks

1. **Performance optimization**
   - Database indexing
   - Query optimization
   - Caching layer

2. **Mobile responsiveness**
   - Responsive design audit
   - Touch-friendly interactions

3. **Error handling**
   - Global error boundaries
   - User-friendly error messages
   - Error logging/monitoring

4. **Testing**
   - Unit tests for scoring logic
   - Integration tests for transactions
   - E2E tests for critical flows

5. **Deployment**
   - Production database setup
   - Environment configuration
   - CI/CD pipeline

### Estimated Time: 2-3 weeks

---

## Total Estimated Timeline

| Phase | Duration |
|-------|----------|
| Phase 1: Authentication | 1-2 weeks |
| Phase 2: League Management | 2-3 weeks |
| Phase 3: Team & Roster | 2-3 weeks |
| Phase 4: Draft System | 3-4 weeks |
| Phase 5: Matchups & Scoring | 3-4 weeks |
| Phase 6: Trades | 2 weeks |
| Phase 7: Waivers | 2 weeks |
| Phase 8: Commissioner Tools | 1-2 weeks |
| Phase 9: Historical Data | 1-2 weeks |
| Phase 10: Polish & Launch | 2-3 weeks |
| **Total** | **19-27 weeks** |

---

## External API Considerations

### Decision (implemented)

No vendor sells the Failball model, so **we derive every scoring category ourselves from play-by-play** (`src/lib/nfl/derive.ts`) instead of buying fantasy stat lines. Raw plays are stored (`PlayEvent`) and stats are re-derived from the full play set on each pass, so mid-game feed corrections and post-game reconciliation are both just a re-derivation.

| Role | Source | Cost |
|------|--------|------|
| Primary live PBP (production default) | **SportsData.io** (`NFL_PBP_PROVIDER=sportsdataio`) | paid, live/real-time tier |
| Alternate live PBP | Sportradar (`sportradar`) | paid |
| Backfill / local testing / post-game reconciliation | nflverse / nflfastR (`nflverse`) | free |
| Player metadata, injuries, ADP | Sleeper | free |
| Charting: `pcDrop` + `pcRouteNotTargeted` **only** | charting vendor (SIS/PFF-style, `NFL_CHARTING_PROVIDER=charting`) | paid, narrow license |

A paid live feed (not free post-game data) is the default because live in-game scoring is a launch requirement — free nflverse PBP only publishes after games. All PBP providers implement one `NflPbpProvider` interface, so the source is swappable by env var and free data can be used in dev/CI without burning paid quota.

**Charting latency caveat:** drops and routes-not-targeted cannot be inferred from a play result, so they are the only fields we license charting for. They stay `0` during a game (scoring treats them as 0 without breaking totals), and `/api/sync/charting` fills them afterwards and flips `PlayerWeekStats.isFinal`. Live scores are therefore near-final, not final, until reconciliation runs.

**Cost implication:** a live-tier PBP subscription plus a narrow two-metric charting license — materially cheaper than a full charted-stats license, at the price of deriving (and owning the correctness of) the model ourselves. `/api/sync/stats?audit=1` re-derives a week from free nflverse data and diffs it against the live-derived rows to keep that honest.

### Pipeline / cadence

- `/api/sync/schedule` — daily, upserts `Game`.
- `/api/sync/players` — daily, Sleeper metadata + injuries.
- `/api/sync/live` — every 30–60s during game windows: live plays → `PlayEvent` (idempotent by play id) → derived `PlayerWeekStats` (`isFinal=false`) → matchup/team scores → push.
- `/api/sync/charting` — post-game, the two charted fields + `isFinal=true`.
- `/api/sync/stats` — full-week nflverse backfill or audit.

Schedules live in `vercel.json`; all routes are protected by a cron secret (`CRON_SECRET`, `src/lib/cron.ts`) and accept GET (what Vercel Cron sends) as well as POST. Note that sub-daily cron schedules require a paid Vercel plan, and Vercel Cron cannot go below 1/minute — if sub-minute latency matters, run `runLiveSync()` from a long-running worker instead of the route. Score updates are pushed to clients over SSE (`/api/live/stream`, sample subscriber in `src/lib/realtime/useLiveScores.ts`); swap in hosted pub/sub (Pusher/Ably) via `REALTIME_WEBHOOK_URL` if serverless instance affinity becomes a problem.

The schema uses `externalPlayerId` fields to reference players, plus ID-crosswalk columns on `Player` (`gsisId`, `sleeperId`, `sportsDataId`, `chartingId`) so all four sources resolve to one player.

---

## Next Steps

1. Set up PostgreSQL database (local or cloud)
2. Configure DATABASE_URL environment variable
3. Run `npx prisma migrate dev` to create tables
4. Install NextAuth.js and begin Phase 1
