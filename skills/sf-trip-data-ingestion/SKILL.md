---
name: sf-trip-data-ingestion
description: Fetch, normalize, and persist SF trip map data (Luma events + static Corner places). Use when updating event feeds, rebuilding curated place data, or validating map payload integrity.
---

# SF Trip Data Ingestion

## Overview
Use this skill to maintain the trip planner data pipeline in this repository.

Use this skill when you need to:
- refresh event data from Luma calendars through Firecrawl
- perform one-time or manual refresh of static curated places from Corner
- validate that `/api/events` returns both event and place payloads

## Workflow

### 1. Refresh Luma events (recurring)
1. Ensure environment variables exist in `.env`: `FIRECRAWL_API_KEY`, `MAX_EVENT_URLS`, and optional `CONVEX_URL`.
   - `MAX_EVENT_URLS` limits how many individual event pages are scraped per sync (default `5` across all configured calendars).
2. Start the app and trigger sync:
   - `pnpm dev`
   - `curl -X POST http://127.0.0.1:3000/api/sync`
3. Validate resulting payload:
   - `curl http://127.0.0.1:3000/api/events`
4. Confirm expected behavior:
   - events are fetched from `LUMA_CALENDAR_URLS`
   - sync writes local cache (`data/events-cache.json`)
   - sync writes Convex when `CONVEX_URL` is configured

Read `references/firecrawl-prompts.md` when adjusting extraction prompts.
Read `references/data-contracts.md` when changing response shape.

### 2. Refresh static Corner places (one-time/manual)
Run:
- `node skills/sf-trip-data-ingestion/scripts/fetch_corner_places.mjs`

Default output:
- `data/static-places.json`

Optional overrides:
- `CORNER_LIST_URL` for a different list URL
- `OUTPUT_FILE` for a different destination file

This script normalizes:
- `name`
- `tag` (`eat`, `bar`, `cafes`, `go out`, `shops`)
- `location`
- `mapLink`
- `cornerLink`
- `curatorComment`
- `description`
- `details`

### 3. Validate app-level integration
1. Build the app:
   - `pnpm build`
2. Check API shape quickly:
   - `curl http://127.0.0.1:3000/api/events | jq '{events:(.events|length), places:(.places|length)}'`
3. Confirm UI assumptions:
   - event markers exist
   - place markers exist
   - place tags and comments render

## References
- `references/data-contracts.md`
- `references/firecrawl-prompts.md`
