# Storage and Auth Model (Current)

This document describes how the app currently uses local browser storage, local server files, and Convex, plus how the admin password gates privileged actions.

## 1) Storage Layers

### Browser localStorage (per browser profile)

- Planner data (default): `sf-trip-day-plans-v1`
- Planner mode preference: `sf-trip-planner-mode-v1` (`local` or `shared`)
- Shared room preference: `sf-trip-shared-room-v1`
- Shared planner local cache copy: `sf-trip-day-plans-v1:shared:<roomId>`
- Geocode cache in browser: `sf-trip-geocode-cache-v1`

Behavior:
- Planner always writes to localStorage first.
- In shared mode, local cache is still used for immediate UX, then synced to server when unlocked.

### Local server files (`data/`)

- `data/events-cache.json`
- `data/geocode-cache.json`
- `data/route-cache.json`
- `data/trip-config.json`

Behavior:
- Used as local fallback and cache, including when Convex is unavailable.
- Useful for local/dev resilience.

### Convex (remote DB, when `CONVEX_URL` is configured)

Tables used:
- `events`, `spots`, `sources`, `syncMeta`
- `plannerState` (shared planner by `roomId`)
- `geocodeCache`, `routeCache`
- `tripConfig`

Behavior:
- `/api/events` reads from Convex first; falls back to local/sample when needed.
- `/api/sync` writes synced data to Convex and local caches.
- Shared planner persistence is in Convex (`plannerState`) by room ID.

## 2) Planner: Local vs Shared

### Local mode

- Planner data stays in browser localStorage only.
- No admin session required.
- No remote planner read/write.

### Shared mode (2-person mode)

- Requires:
  - Valid admin session (password unlock),
  - Valid room ID (2-64 chars, `a-z`, `0-9`, `_`, `-`),
  - Convex connectivity for remote persistence.
- Reads from `GET /api/planner?roomId=<id>`.
- Writes to `POST /api/planner?roomId=<id>` (debounced from client).
- If remote call fails, app continues with local cache and logs an error.

## 3) Admin Password and Session

Server env vars:
- `APP_ADMIN_PASSWORD` (required for auth-protected actions)
- `APP_SESSION_SECRET` (optional; defaults to `APP_ADMIN_PASSWORD` if omitted)

Session details:
- Cookie name: `sf_trip_admin_session`
- `HttpOnly`, `SameSite=Lax`, `Secure` in production
- Max age: 12 hours

Auth endpoints:
- `GET /api/auth/session` -> current auth status
- `POST /api/auth/session` with `{ "password": "..." }` -> unlocks, sets cookie
- `DELETE /api/auth/session` -> locks, clears cookie

Failure modes:
- `503` when password is not configured on server.
- `401` when password/session is missing or invalid.

## 4) What Is Password-Protected

Protected (requires unlocked admin session):
- `POST /api/sync`
- `POST /api/config`
- `POST /api/sources`
- `PATCH|POST(sync)|DELETE /api/sources/[sourceId]`
- `GET|POST /api/planner` when `roomId` is provided

Not protected:
- `GET /api/events`
- `GET /api/config`
- `GET /api/sources`
- Planner local mode operations in browser

## 5) Firecrawl and Sync

- Firecrawl is only invoked during sync flows inside server sync logic.
- Since sync is admin-protected, Firecrawl usage is effectively admin-gated.
- Missing `FIRECRAWL_API_KEY` will surface sync-stage errors for RSS extraction.

## 6) Password Operations (Recommended)

Do not commit actual passwords into repo docs or source.

Use env var `APP_ADMIN_PASSWORD` in:
- Local `.env` / `.env.local`
- Vercel envs (`development`, `preview`, `production`)

If rotating password:
1. Update local env.
2. Update Vercel env for all target environments.
3. Redeploy/restart so server picks up new env value.
4. Re-login in Config (old session cookie becomes invalid if signing secret/password changed).

Optional hardening:
- Set a dedicated `APP_SESSION_SECRET` so session signing is independent of password rotation.
