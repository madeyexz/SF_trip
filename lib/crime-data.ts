export const CRIME_DATASET_ID = 'wg3w-h783';
const DATASET_URL = `https://data.sfgov.org/resource/${CRIME_DATASET_ID}.json`;
const EXCLUDED_CATEGORIES = [
  'Non-Criminal', 'Case Closure', 'Lost Property', 'Courtesy Report', 'Recovered Vehicle'
];

export type CrimeBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

// Socrata's incident_datetime is a floating local timestamp, not UTC.
export function toSanFranciscoTimestamp(instant: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function buildCrimeQuery({
  hours, limit, bounds, now
}: { hours: number; limit: number; bounds: CrimeBounds | null; now: number }) {
  const since = toSanFranciscoTimestamp(now - hours * 60 * 60 * 1000);
  const clauses = [
    `incident_datetime >= '${since}'`,
    'latitude IS NOT NULL',
    'longitude IS NOT NULL',
    `incident_category NOT IN (${EXCLUDED_CATEGORIES.map(value => `'${value}'`).join(', ')})`
  ];
  if (bounds) {
    clauses.push(`latitude >= ${bounds.south} AND latitude <= ${bounds.north}`);
    clauses.push(`longitude >= ${bounds.west} AND longitude <= ${bounds.east}`);
  }
  const url = new URL(DATASET_URL);
  url.searchParams.set('$select', 'incident_datetime,incident_category,incident_subcategory,analysis_neighborhood,latitude,longitude');
  url.searchParams.set('$where', clauses.join(' AND '));
  url.searchParams.set('$order', 'incident_datetime DESC');
  url.searchParams.set('$limit', String(limit));
  return { url, since };
}

export async function loadCrimeData({
  hours, limit, bounds, now = Date.now(), appToken, fetchImpl = fetch
}: {
  hours: number;
  limit: number;
  bounds: CrimeBounds | null;
  now?: number;
  appToken?: string;
  fetchImpl?: typeof fetch;
}) {
  const { url, since } = buildCrimeQuery({ hours, limit, bounds, now });
  try {
    const response = await fetchImpl(url.toString(), {
      headers: appToken ? { 'X-App-Token': appToken } : {},
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      return {
        ok: false as const,
        status: 502,
        error: `SF Open Data is unavailable (upstream ${response.status}). The map and planner can still be used.`
      };
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid incident response');
    const incidents = rows.flatMap(row => {
      if (row?.latitude == null || row?.longitude == null) return [];
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const incidentDatetime = String(row?.incident_datetime || '');
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
      if (!incidentDatetime || incidentDatetime < since) return [];
      return [{
        lat, lng, incidentDatetime,
        incidentCategory: String(row?.incident_category || ''),
        incidentSubcategory: String(row?.incident_subcategory || ''),
        neighborhood: String(row?.analysis_neighborhood || '')
      }];
    });
    return { ok: true as const, incidents };
  } catch (error) {
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return {
      ok: false as const,
      status: timedOut ? 504 : 502,
      error: timedOut
        ? 'SF Open Data timed out. The map and planner can still be used; retry crime data later.'
        : 'SF Open Data could not be loaded. The map and planner can still be used.'
    };
  }
}
