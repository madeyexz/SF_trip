export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATASET_ID = 'wg3w-h783';
const DATASET_URL = `https://data.sfgov.org/resource/${DATASET_ID}.json`;
const DEFAULT_HOURS = 24;
const MAX_HOURS = 7 * 24;
const DEFAULT_LIMIT = 4000;
const MAX_LIMIT = 10000;
const EXCLUDED_CATEGORIES = [
  'Non-Criminal',
  'Case Closure',
  'Lost Property',
  'Courtesy Report',
  'Recovered Vehicle'
];

type CrimeBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

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

function sqlStringLiteral(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
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

function buildIncidentWhereClause(hours: number, bounds: CrimeBounds | null) {
  const sinceISO = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const excluded = EXCLUDED_CATEGORIES.map(sqlStringLiteral).join(', ');
  const clauses = [
    `incident_datetime >= ${sqlStringLiteral(sinceISO)}`,
    'latitude IS NOT NULL',
    'longitude IS NOT NULL',
    `incident_category NOT IN (${excluded})`
  ];
  if (bounds) {
    clauses.push(`latitude >= ${bounds.south} AND latitude <= ${bounds.north}`);
    clauses.push(`longitude >= ${bounds.west} AND longitude <= ${bounds.east}`);
  }
  return clauses.join(' AND ');
}

function normalizeIncident(row: any) {
  const lat = Number(row?.latitude);
  const lng = Number(row?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    incidentDatetime: String(row?.incident_datetime || ''),
    incidentCategory: String(row?.incident_category || ''),
    incidentSubcategory: String(row?.incident_subcategory || ''),
    neighborhood: String(row?.analysis_neighborhood || '')
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hours = clampInteger(url.searchParams.get('hours'), DEFAULT_HOURS, 1, MAX_HOURS);
  const limit = clampInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 200, MAX_LIMIT);
  const bounds = parseCrimeBounds(url.searchParams);
  const whereClause = buildIncidentWhereClause(hours, bounds);

  const queryUrl = new URL(DATASET_URL);
  queryUrl.searchParams.set(
    '$select',
    'incident_datetime,incident_category,incident_subcategory,analysis_neighborhood,latitude,longitude'
  );
  queryUrl.searchParams.set('$where', whereClause);
  queryUrl.searchParams.set('$order', 'incident_datetime DESC');
  queryUrl.searchParams.set('$limit', String(limit));

  const requestHeaders: Record<string, string> = {};
  if (process.env.SFGOV_APP_TOKEN) {
    requestHeaders['X-App-Token'] = process.env.SFGOV_APP_TOKEN;
  }

  const upstream = await fetch(queryUrl.toString(), {
    headers: requestHeaders,
    next: { revalidate: 60 }
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    return Response.json(
      {
        error: `Upstream SF Open Data request failed (${upstream.status}).`,
        details: body.slice(0, 300)
      },
      { status: 502 }
    );
  }

  const rows = await upstream.json().catch(() => []);
  const incidents = Array.isArray(rows)
    ? rows.map(normalizeIncident).filter(Boolean)
    : [];

  return Response.json(
    {
      incidents,
      hours,
      limit,
      count: incidents.length,
      source: {
        provider: 'SF Open Data',
        datasetId: DATASET_ID,
        datasetUrl: `https://data.sfgov.org/d/${DATASET_ID}`
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
