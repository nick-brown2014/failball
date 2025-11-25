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

The app requires integration with an NFL player data API for:
- Player names, positions, teams
- Weekly stats (passing, rushing, receiving, etc.)
- Game schedules and scores
- Injury status

**Recommended APIs to evaluate:**
- Sleeper API (free, good for fantasy)
- ESPN API (unofficial)
- NFL official API
- SportsData.io (paid)
- MySportsFeeds (paid)

The schema uses `externalPlayerId` fields to reference players from whichever API is chosen, keeping the database decoupled from any specific provider.

---

## Next Steps

1. Set up PostgreSQL database (local or cloud)
2. Configure DATABASE_URL environment variable
3. Run `npx prisma migrate dev` to create tables
4. Install NextAuth.js and begin Phase 1
