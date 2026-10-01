import { consumeRateLimit, getRequestRateLimitIp } from '@/lib/security';
import { CRIME_DATASET_ID, loadCrimeData, type CrimeBounds } from '@/lib/crime-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_HOURS = 24;
const MAX_HOURS = 7 * 24;
const DEFAULT_LIMIT = 4000;
const MAX_LIMIT = 10000;

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampFloat(value: string | null, min: number, max: number) {
  const parsed = Number.parseFloat(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function parseCrimeBounds(searchParams: URLSearchParams): CrimeBounds | null {
  const south = clampFloat(searchParams.get('south'), -90, 90);
  const west = clampFloat(searchParams.get('west'), -180, 180);
  const north = clampFloat(searchParams.get('north'), -90, 90);
  const east = clampFloat(searchParams.get('east'), -180, 180);
  if ([south, west, north, east].some((v) => !Number.isFinite(v))) return null;
  if ((south as number) >= (north as number)) return null;
  if ((west as number) >= (east as number)) return null;
  return {
    south: Number(south),
    west: Number(west),
    north: Number(north),
    east: Number(east)
  };
}

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit({
    key: `api:crime:${getRequestRateLimitIp(request)}`,
    limit: 30,
    windowMs: 60_000
  });
  if (!rateLimit.ok) {
    return Response.json(
      {
        error: 'Too many crime data requests. Please retry shortly.'
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const url = new URL(request.url);
  const hours = clampInteger(url.searchParams.get('hours'), DEFAULT_HOURS, 1, MAX_HOURS);
  const limit = clampInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 200, MAX_LIMIT);
  const bounds = parseCrimeBounds(url.searchParams);
  const result = await loadCrimeData({
    hours, limit, bounds,
    appToken: process.env.SFGOV_APP_TOKEN
  });
  if (!result.ok) {
    return Response.json(
      { error: result.error, unavailable: true },
      { status: result.status }
    );
  }
  const incidents = result.incidents;

  return Response.json(
    {
      incidents,
      hours,
      limit,
      count: incidents.length,
      source: {
        provider: 'SF Open Data',
        datasetId: CRIME_DATASET_ID,
        datasetUrl: `https://data.sfgov.org/d/${CRIME_DATASET_ID}`
      },
      bounds,
      generatedAt: new Date().toISOString()
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    }
  );
}
