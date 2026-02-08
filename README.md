# SF Trip Events Map

Next.js app that:

1. syncs Luma event details via Firecrawl
2. plots events on Google Maps
3. pins your base location (from `docs/my_location.md`)
4. estimates travel time from your base location to each event
5. filters events by date with a slider
6. shows a static curated places layer (cafes/bars/eat/go out/shops)

## Requirements

- Node.js 18+
- Firecrawl API key
- Google Maps Platform browser API key
- Optional: Convex project (for persistent cloud DB)

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill in `.env`:

- `FIRECRAWL_API_KEY` (for event sync)
- `GOOGLE_MAPS_BROWSER_KEY` (for map rendering)
- `CONVEX_URL` (optional, enables Convex read/write persistence)
- `MAX_EVENT_URLS` (optional, max individual event pages scraped per sync; default `5`)

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
- Use the **Date filter** slider to switch days.
- Use **Travel mode** to switch driving/transit/walking.
- Click **Use My Device Location** to use live GPS instead of the location in `docs/my_location.md`.

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

## Notes

- Some events hide exact addresses unless you register. Those may only show city-level location.
- Without Convex configured, the app stores synced events in `data/events-cache.json`.
- With Convex configured, events are persisted in Convex and survive redeploys.
- If no cache exists, it falls back to `data/sample-events.json`.
- Static curated places are stored one-time in `data/static-places.json` and are not part of event sync.

## Google APIs used

This app uses a single API key (`GOOGLE_MAPS_BROWSER_KEY`) that powers:

| API | What it does |
|-----|-------------|
| Maps JavaScript API | Renders the interactive map |
| Geocoding API | Converts addresses to lat/lng coordinates |
| Distance Matrix API | Calculates travel times (walking/driving/transit) |
| Directions API | Plans optimized routes for day plans |
| Places Library | Loaded with the Maps JS SDK |

Google Maps Platform gives a **$200/month free credit** on the pay-as-you-go plan, which covers roughly 28k map loads or 40k geocode/directions/distance-matrix requests per month.

### Viewing your usage & quota

1. Open the **APIs & Services dashboard**: https://console.cloud.google.com/apis/dashboard
2. Click any enabled API to see request counts, errors, and latency.
3. Check billing spend: https://console.cloud.google.com/billing

### Key restrictions (recommended)

For `GOOGLE_MAPS_BROWSER_KEY`, lock by:

- HTTP referrers: `http://localhost:3000/*`
- API restrictions: Maps JavaScript API, Distance Matrix API, Geocoding API, Directions API
