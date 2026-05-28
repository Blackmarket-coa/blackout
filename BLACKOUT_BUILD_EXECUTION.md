# BLACKOUT_BUILD_PLAN Execution Log

> **STATUS — 2026-05-10:** the deployment-checklist failures recorded later
> in this document (TypeScript errors in `apps/blackout-client`, missing
> `vercel`/`eas` CLIs) are **stale**. Railway has been removed as a deploy target. Verified `pnpm install`
> + `pnpm --filter @blackout/client build` and `pnpm --filter @blackout/client
> typecheck` both pass cleanly; the original failure was caused by an empty
> `node_modules` in the audit environment, not a code defect. The CLI gaps
> are environment-only, not a code issue. Treat the historical Phase 0–6
> entries below as a record of work; consult
> `docs/rollout-readiness-status.md` and `docs/project_completion_tracker.md`
> for the current readiness picture.

## Phase 0: Foundation Setup
- ✅ Verified monorepo already configured with `apps/*` and `packages/*` workspaces.
- ✅ Added plan-aligned package scaffolds:
  - `packages/api`
  - `packages/web`
  - `packages/mobile` (Expo-style directory scaffold)
  - `packages/desktop` (wrapper scaffold)
- ✅ Expanded `packages/core` with plan-aligned modules:
  - `crypto`, `governance`, `federation`, `types`

## Phase 1: Core Infrastructure
- ✅ Added API foundation in `packages/api/src/index.ts` with Hono route wiring.
- ✅ Added route scaffolds for auth/messages/governance/federation/channels.
- ✅ Added middleware placeholders for auth and rate limit.
- ✅ Added DB schema artifacts:
  - SQL schema starter in `packages/api/src/db/schema.sql`
  - table-name registry in `packages/api/src/db/schema.ts`
- ✅ Added integrations placeholders for Matrix, Stripe, and email.
- ✅ Added `.env.example` to `packages/api`.

## Phase 2: Authentication & Core Features
- ✅ Implemented register/login route stubs with token responses.
- ✅ Implemented message endpoint stub with stego + E2E + signature hooks from `@blackout/core`.
- ✅ Included federation-ready message formatting helper usage.

## Phase 3: Governance System
- ✅ Implemented vote creation/casting/results scaffold endpoints.
- ✅ Added core vote tally utility.
- ✅ Added reputation scoring utility scaffolding (`services/reputation.ts`).

## Phase 4: Federation
- ✅ Added federation link + community listing route stubs.
- ✅ Added Matrix client integration placeholder.

## Phase 5: Frontend (React UI)
- ✅ Added plan-template components:
  - `MessageComposer`, `FeatureMenu`, `MessageList`, `Poll`, `StegoSelector`, `ChannelPanel`
- ✅ Added hooks:
  - `useMessages`, `useGovernance`, `useFederation`
- ✅ Added pages:
  - `Chat`, `Login`, `Settings`
- ✅ Added `App.tsx` + `main.tsx` entry scaffolds.

## Phase 6: Mobile Apps
- ✅ Added Expo-like file structure in `packages/mobile/app`:
  - `(tabs)/chat.tsx`, `(tabs)/governance.tsx`, `(tabs)/settings.tsx`
  - `login.tsx`, `_layout.tsx`

## Deployment Checklist Execution (from BLACKOUT_BUILD_PLAN)
1. `npm run test` → ❌ failed due pre-existing parse error in `apps/blackout-web/src/app.ts`.
2. `npm run build` → ❌ failed due same pre-existing TypeScript syntax errors in `apps/blackout-web/src/app.ts`.
3. `vercel deploy --prod` → ⚠️ unavailable (`vercel` CLI missing).
5. `eas build --platform ios --auto-submit` → ⚠️ unavailable (`eas` CLI missing).
6. `eas build --platform android` → ⚠️ unavailable (`eas` CLI missing).
7. Smoke tests / monitoring steps require deployable runtime + infra credentials and were not runnable in this container-only environment.

## Follow-up Remediation Pass
- ✅ Unblocked `apps/blackout-web` parse error by repairing malformed event binding structure in `bindEvents` and removing duplicate/corrupted workspace rendering segments.
- ✅ Restored integration expectations for sidebar workspace names (`Alpha Ops`, `Beta Crew`) by rendering real server names in sidebar navigation.
- ✅ Replaced API stubs with concrete service layers:
  - In-memory persistence layer for users/channels/messages/votes/federation links
  - Password hashing + JWT signing/verification
  - Matrix registration/send integrations using homeserver APIs when configured
  - Governance vote persistence and federation link persistence
  - Added Phase 1 migration file under `packages/api/src/db/migrations/001_phase1_schema.sql`
- ✅ Replaced web in-memory hooks with API-backed and websocket-backed client hooks (`useMessages`, `useGovernance`, `useFederation`).
- ✅ Wired mobile auth and chat message flows (login API call, session state, message fetch/post path).

## Deployment Checklist Re-run
1. `npm run test` → ✅ pass.
2. `npm run build` → ❌ fails in `apps/blackout-client` due existing TypeScript errors unrelated to this pass.
3. `vercel deploy --prod` → ⚠️ unavailable (`vercel` CLI missing).
5. `eas build --platform ios --auto-submit` → ⚠️ unavailable (`eas` CLI missing).
6. `eas build --platform android` → ⚠️ unavailable (`eas` CLI missing).
