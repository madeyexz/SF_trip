# Storage and Auth Model

This document describes the current personal-only model.

## Storage Layers

### Browser

- No planner or source data is persisted in `localStorage`.
- Geocode cache stays in memory only.
- UI-only preferences such as hidden map categories may still use browser storage.

### Local server files (`data/`)

- `data/events-cache.json`
- `data/geocode-cache.json`
- `data/route-cache.json`
- `data/trip-config.json`

These files are local fallbacks and write-through caches for development resilience and offline-ish recovery when Convex is unavailable.

### Convex

Primary tables in use:
- `events`
- `spots`
- `placeRecommendations`
- `sources`
- `syncMeta`
- `plannerEntries`
- `geocodeCache`
- `routeCache`

User profile and trip configuration live on the authenticated user document in `users`.

## Auth Model

- The app uses Convex auth.
- API routes that mutate personal data require an authenticated Convex client.
- There is no owner role, shared planner room, or pair membership layer.

Profile shape returned by `/api/me`:
- `userId`
- `email`

## Planner Model

- Planner state is personal-only.
- Convex stores planner rows in `plannerEntries`, keyed by `userId`.
- `GET /api/planner` returns the authenticated user's `plannerByDate`.
- `POST /api/planner` fully replaces the authenticated user's planner rows.

## Sources Model

- Sources are personal-only.
- Convex stores source rows in `sources`, keyed by `userId`.
- Default required sources are appended at read time and exposed as read-only in the UI.
- User-created sources can be created, paused, resumed, synced, or deleted.

## Friend Recommendations

- Friend-attributed place recommendations live in `placeRecommendations`.
- These rows are shared globally across the app.
- Users can hide or show shared recommendations with `users.showSharedPlaceRecommendations`.
- Shared editorial recommendations can include attribution metadata such as `friendUrl`.
- Recommendation rows are merged onto canonical spots at read time.
- If there is no canonical spot match, the recommendation is surfaced as a synthetic place row instead of being written into `spots`.

## Sync Behavior

- `/api/events` reads from Convex first, then falls back to local cache or sample data when needed.
- `/api/sync` syncs the authenticated user's sources, writes results to Convex, and updates local caches.
- RSS ingestion still depends on `FIRECRAWL_API_KEY`.

## Notes

- `events`, `spots`, and `syncMeta` are still global tables today.
- `sources` and `plannerEntries` are already personal-only.
- Friend recommendations stay as annotation rows, not as a return to shared planner state.
