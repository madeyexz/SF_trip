# SF Trip Events Map

Next.js app that:

1. syncs event data from iCal feeds and Beehiiv RSS
2. uses Firecrawl to extract event listings from new Beehiiv newsletter posts
3. plots events on Google Maps
4. pins your base location (from `docs/my_location.md`)
5. estimates travel time from your base location to each event
6. filters events by date with a slider
7. shows a static curated places layer (cafes/bars/eat/go out/shops)

## Requirements

- Node.js 18+
- Firecrawl API key (for Beehiiv RSS newsletter extraction)
- Google Maps Platform browser API key
- Google Maps Platform server API key with Routes API enabled (recommended for route drawing)
- Optional: Convex project (for persistent cloud DB)

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill in `.env`:

- `FIRECRAWL_API_KEY` (for Beehiiv RSS extraction in `/api/sync`)
- `GOOGLE_MAPS_BROWSER_KEY` (for map rendering)
- `GOOGLE_MAPS_ROUTES_KEY` (server key used by `/api/route` to draw day routes)
- `GOOGLE_MAPS_GEOCODING_KEY` (optional server key used by `/api/sync` for pre-geocoding; falls back to server/browser key)
- `CONVEX_URL` (optional, enables Convex read/write persistence)
- `RSS_INITIAL_ITEMS` (optional, number of newsletter posts to process on first sync; default `1`)
- `RSS_MAX_ITEMS_PER_SYNC` (optional, cap on new newsletter posts processed per sync; default `3`)

3. Install dependencies:

```bash
pnpm install
```

4. Start dev server:

```bash
pnpm dev
```

5. Open:

- `http://localhost:3000`

## Production

```bash
pnpm build
pnpm start
```

## Usage

- Click **Sync Events** to pull fresh events from:
  - `https://luma.com/sf`
  - `https://luma.com/cerebralvalley_`
- `/api/sync` also polls `https://rss.beehiiv.com/feeds/9B98D9gG4C.xml` and only parses unseen/updated newsletter items using RSS `guid` (or link) + item update version (`atom:updated` / `atom:published` / `pubDate`).
- Open **Sources** tab to add/pause/delete global event and spot source URLs.
- Use the **Date filter** slider to switch days.
- Use **Travel mode** to switch driving/transit/walking.
- Click **Use My Device Location** to use live GPS instead of the location in `docs/my_location.md`.
- In **Day Route Builder**, use **Download .ics** to export planner stops as iCalendar events.
- In **Day Route Builder**, use **Add Stops to Google Calendar** to open one prefilled Google Calendar draft per stop.

## Convex Setup (Optional)

If you want events persisted in a database (instead of only local JSON cache):

1. Initialize/login once:

```bash
pnpm convex:dev
```

2. Copy your Convex deployment URL into `.env`:

- `CONVEX_URL=https://<your-deployment>.convex.cloud`

3. Deploy Convex functions/schema:

```bash
pnpm convex:deploy
```

After this, `/api/events` reads from Convex first. `/api/sync` writes to both Convex and local cache.
Global source management is available at `/api/sources` (requires `CONVEX_URL`).
Planner day routes are also persisted in Convex via `/api/planner` when `CONVEX_URL` is configured.

## Notes

- Some events hide exact addresses unless you register. Those may only show city-level location.
- Without Convex configured, the app stores synced events in `data/events-cache.json`.
- Address geocoding cache is persisted in `data/geocode-cache.json`.
- Generated route cache is also persisted locally in `data/route-cache.json`.
- With Convex configured, events are persisted in Convex and survive redeploys.
- With Convex configured, geocode cache is persisted in Convex (`geocodeCache` table).
- With Convex configured, planner day routes (create/update/delete per date) are persisted in Convex.
- With Convex configured, generated map routes are additionally cached in Convex and reused across sessions/deploys.
- If no cache exists, it falls back to `data/sample-events.json`.
- Static curated places are stored one-time in `data/static-places.json` and are not part of event sync.

## Dedup Strategy

- Events are deduped by `eventUrl` during sync. If duplicates are found, the row with the higher field-completeness score is kept.
- Event upsert in Convex also keys by `eventUrl`; records missing from a sync are not hard-deleted immediately.
- Spots are deduped by:
  - `cornerLink` when present
  - otherwise normalized `name|location`
- Spot IDs are generated from the dedupe key (`spot-...`) and Convex upsert keys on this ID.
- Stale handling for both events and spots uses soft delete:
  - each missed sync increments `missedSyncCount`
  - when `missedSyncCount >= 2`, record is marked `isDeleted=true`
  - active listing queries only return rows where `isDeleted` is not true
- Known caveat: there is currently a naming mismatch in spot dedupe helper usage (`buildSpotDedupeKey` vs `buildSpotDedupKey`) that should be fixed.

## Google APIs used

This app uses `GOOGLE_MAPS_BROWSER_KEY` for map rendering and travel estimates, `GOOGLE_MAPS_ROUTES_KEY` for day-plan route drawing, and optional `GOOGLE_MAPS_GEOCODING_KEY` for server pre-geocoding during sync.

| API | What it does |
|-----|-------------|
| Maps JavaScript API | Renders the interactive map |
| Geocoding API | Pre-geocodes addresses during `/api/sync`; runtime geocode is fallback-only |
| Distance Matrix API | Calculates travel times (walking/driving/transit) |
| Routes API | Plans day-plan routes without legacy Directions API |
| Places Library | Loaded with the Maps JS SDK |

## How we minimize Google API calls

This app intentionally uses multi-layer caching and request dedupe to reduce billable Google usage.

### 1) Geocoding API minimization

- Runtime geocoding goes through server endpoint `/api/geocode` (not direct browser Geocoder calls).
- Server geocode lookup order:
  1. in-memory map (per server process)
  2. `data/geocode-cache.json`
  3. Convex `geocodeCache` (if `CONVEX_URL` is configured)
  4. Google Geocoding API (only on miss)
- Client also keeps a browser cache (`localStorage` key: `sf-trip-geocode-cache-v1`) to avoid repeated lookups in the same browser.
- During sync, events/places are enriched with coordinates and persisted so future runtime geocoding is often skipped entirely.

### 2) Routes API minimization

- `/api/route` creates a deterministic hash key from `travelMode + origin + destination + waypoints`.
- Route lookup order:
  1. local server cache file `data/route-cache.json`
  2. Convex `routeCache` (if configured)
  3. Google Routes API (only on miss)
- Route results are written back to cache after live fetch.
- Client side also memoizes route results in-session and reuses identical route requests.
- Route draw requests are debounced and skipped while dragging planner blocks to avoid burst calls.

### 3) Distance Matrix API minimization

- Travel-time requests are cached in-session by `travelMode + base location + destination`.
- Cached destinations are not requested again.
- Only missing destinations are sent to Distance Matrix.
- Requests are chunked (up to 25 destinations per call).
- `"Unavailable"` responses are cached too, preventing repeated failed lookups.

### 4) Maps JavaScript API minimization

- Google Maps script is loaded once and reused for the session.
- Most data operations (geocode/route caching) are moved server-side to avoid extra client SDK requests.

### 5) Operational best practices

- Keep `lat/lng` on events and places whenever possible.
- Run sync to warm caches before heavy planning sessions.
- Keep `CONVEX_URL` enabled for cross-session persistence beyond local JSON files.

Google Maps Platform now uses **per-SKU monthly free usage caps** (the old `$200` credit model was retired in March 2025). Check current caps in the official pricing page.

### Viewing your usage & quota

1. Open the **APIs & Services dashboard**: https://console.cloud.google.com/apis/dashboard
2. Click any enabled API to see request counts, errors, and latency.
3. Check billing spend: https://console.cloud.google.com/billing

### Key restrictions (recommended)

For `GOOGLE_MAPS_BROWSER_KEY`, lock by:

- HTTP referrers: `http://localhost:3000/*`
- API restrictions: Maps JavaScript API, Distance Matrix API, Geocoding API

For `GOOGLE_MAPS_ROUTES_KEY`, lock by:

- API restrictions: Routes API
- Application restriction: IP addresses (server runtime) or keep unrestricted during local development
