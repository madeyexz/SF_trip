import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';

const DOC_LOCATION_FILE = path.join(process.cwd(), 'docs', 'my_location.md');
const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_CACHE_FILE = path.join(DATA_DIR, 'events-cache.json');
const SAMPLE_EVENTS_FILE = path.join(DATA_DIR, 'sample-events.json');
const STATIC_PLACES_FILE = path.join(DATA_DIR, 'static-places.json');
const GEOCODE_CACHE_FILE = path.join(DATA_DIR, 'geocode-cache.json');
const ROUTE_CACHE_FILE = path.join(DATA_DIR, 'route-cache.json');
const TRIP_CONFIG_FILE = path.join(DATA_DIR, 'trip-config.json');
const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;
const MISSED_SYNC_THRESHOLD = 2;
const DEFAULT_CORNER_LIST_URL = 'https://www.corner.inc/list/e65af393-70dd-46d5-948a-d774f472d2ee';
const SOURCE_TYPES = new Set(['event', 'spot']);
const SOURCE_STATUSES = new Set(['active', 'paused']);
const SPOT_TAGS = ['eat', 'bar', 'cafes', 'go out', 'shops'];

let geocodeCacheMapPromise = null;
let routeCacheMapPromise = null;

export function getCalendarUrls() {
  return (process.env.LUMA_CALENDAR_URLS || 'https://luma.com/sf,https://luma.com/cerebralvalley_')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getMaxEventUrls() {
  return Number(process.env.MAX_EVENT_URLS || 5);
}

export function getDefaultSpotSourceUrls() {
  return (process.env.SPOT_SOURCE_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function loadBaseLocation() {
  try {
    const value = await readFile(DOC_LOCATION_FILE, 'utf-8');
    return value.trim();
  } catch {
    return 'San Francisco, CA';
  }
}

export async function loadTripConfig() {
  try {
    const raw = await readFile(TRIP_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      tripStart: parsed.tripStart || '',
      tripEnd: parsed.tripEnd || '',
    };
  } catch {
    return { tripStart: '', tripEnd: '' };
  }
}

export async function saveTripConfig({ tripStart, tripEnd }) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TRIP_CONFIG_FILE, JSON.stringify({ tripStart, tripEnd }, null, 2), 'utf-8');
}

export async function resolveAddressCoordinates(addressText) {
  const geocoded = await geocodeAddressWithCache(addressText);
  if (!geocoded) {
    return null;
  }

  return {
    lat: geocoded.lat,
    lng: geocoded.lng
  };
}

export async function loadSourcesPayload() {
  const sources = await loadSourcesFromConvex();
  const fallbackEventSources = getCalendarUrls().map((url) => ({
    id: `fallback-event-${url}`,
    sourceType: 'event',
    url,
    label: url,
    status: 'active',
    readonly: true
  }));
  const fallbackSpotUrls = getDefaultSpotSourceUrls();
  const fallbackSpotSources = (fallbackSpotUrls.length > 0 ? fallbackSpotUrls : [DEFAULT_CORNER_LIST_URL]).map(
    (url) => ({
      id: `fallback-spot-${url}`,
      sourceType: 'spot',
      url,
      label: url,
      status: 'active',
      readonly: true
    })
  );
  const fallbackSources = [...fallbackEventSources, ...fallbackSpotSources];

  if (Array.isArray(sources) && sources.length > 0) {
    const hasEventSources = sources.some((source) => source.sourceType === 'event');
    const hasSpotSources = sources.some((source) => source.sourceType === 'spot');

    return {
      sources: [
        ...sources,
        ...(hasEventSources ? [] : fallbackEventSources),
        ...(hasSpotSources ? [] : fallbackSpotSources)
      ],
      source: 'convex'
    };
  }

  return {
    sources: fallbackSources,
    source: 'fallback'
  };
}

export async function createSourcePayload(input) {
  const client = createConvexClient();

  if (!client) {
    throw new Error('CONVEX_URL is missing. Configure Convex to persist global sources.');
  }

  const sourceType = cleanText(input?.sourceType).toLowerCase();
  const url = cleanText(input?.url);
  const label = cleanText(input?.label);

  if (!SOURCE_TYPES.has(sourceType)) {
    throw new Error('sourceType must be "event" or "spot".');
  }

  assertValidUrl(url);

  const source = await client.mutation('sources:createSource', {
    sourceType,
    url,
    label: label || url
  });
  const normalized = normalizeSourceRecord(source);
  if (!normalized) {
    throw new Error('Could not create source.');
  }

  return normalized;
}

export async function updateSourcePayload(sourceId, input) {
  const client = createConvexClient();

  if (!client) {
    throw new Error('CONVEX_URL is missing. Configure Convex to persist global sources.');
  }

  const patch = {};

  if (typeof input?.label === 'string') {
    patch.label = cleanText(input.label);
  }

  if (typeof input?.status === 'string') {
    const nextStatus = cleanText(input.status).toLowerCase();
    if (!SOURCE_STATUSES.has(nextStatus)) {
      throw new Error('status must be "active" or "paused".');
    }
    patch.status = nextStatus;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('Nothing to update. Provide "label" and/or "status".');
  }

  const source = await client.mutation('sources:updateSource', {
    sourceId,
    ...patch
  });

  if (!source) {
    throw new Error('Source not found.');
  }

  const normalized = normalizeSourceRecord(source);
  if (!normalized) {
    throw new Error('Could not update source.');
  }

  return normalized;
}

export async function deleteSourcePayload(sourceId) {
  const client = createConvexClient();

  if (!client) {
    throw new Error('CONVEX_URL is missing. Configure Convex to persist global sources.');
  }

  const result = await client.mutation('sources:deleteSource', { sourceId });
  if (!result?.deleted) {
    throw new Error('Source not found.');
  }

  return {
    deleted: true
  };
}

export async function loadEventsPayload() {
  const fallbackCalendars = getCalendarUrls();
  const fallbackPlaces = await loadStaticPlaces();
  const sources = await loadSourcesFromConvex();
  const sourceCalendars = getActiveSourceUrls(sources, 'event');
  const calendars = sourceCalendars.length > 0 ? sourceCalendars : fallbackCalendars;
  const spotsPayload = await loadSpotsFromConvex();
  const placesFromConvex = Array.isArray(spotsPayload?.spots) ? spotsPayload.spots : [];
  const places = placesFromConvex.length > 0 ? placesFromConvex : fallbackPlaces;
  const convexPayload = await loadEventsFromConvex(calendars);

  if (convexPayload) {
    return {
      ...convexPayload,
      meta: {
        ...convexPayload.meta,
        spotCount: places.length
      },
      places
    };
  }

  try {
    const raw = await readFile(EVENTS_CACHE_FILE, 'utf-8');
    const payload = JSON.parse(raw);
    const cachedPlaces = Array.isArray(payload?.places) ? payload.places.map(normalizePlaceCoordinates) : [];
    return {
      ...payload,
      places: cachedPlaces.length > 0 ? cachedPlaces : places
    };
  } catch {
    try {
      const sampleRaw = await readFile(SAMPLE_EVENTS_FILE, 'utf-8');
      const sampleEvents = JSON.parse(sampleRaw);
      return {
        meta: {
          syncedAt: null,
          calendars,
          eventCount: sampleEvents.length,
          spotCount: places.length,
          sampleData: true
        },
        events: sampleEvents,
        places
      };
    } catch {
      return {
        meta: {
          syncedAt: null,
          calendars,
          eventCount: 0,
          spotCount: places.length
        },
        events: [],
        places
      };
    }
  }
}

export async function loadPlannerPayload() {
  const plannerByDate = await loadPlannerFromConvex();

  return {
    plannerByDate: plannerByDate || {},
    source: plannerByDate ? 'convex' : 'local'
  };
}

export async function savePlannerPayload(plannerByDateInput) {
  const plannerByDate = sanitizePlannerByDateInput(plannerByDateInput);
  const persisted = await savePlannerToConvex(plannerByDate);

  return {
    plannerByDate,
    persisted: persisted ? 'convex' : 'local'
  };
}

export async function loadCachedRoutePayload(cacheKey) {
  if (!cacheKey) {
    return null;
  }

  const localRouteMap = await loadRouteCacheMap();
  const localCached = localRouteMap.get(cacheKey);
  if (localCached?.encodedPolyline) {
    return localCached;
  }

  const client = createConvexClient();
  if (!client) {
    return null;
  }

  try {
    const payload = await client.query('routeCache:getRouteByKey', { key: cacheKey });
    if (!payload) {
      return null;
    }

    const sanitized = sanitizeRoutePayload(payload);
    if (!sanitized.encodedPolyline) {
      return null;
    }

    localRouteMap.set(cacheKey, sanitized);
    await persistRouteCacheMap();
    return sanitized;
  } catch (error) {
    console.error('Convex route-cache read failed, falling back to live route generation.', error);
    return null;
  }
}

export async function saveCachedRoutePayload(cacheKey, routePayloadInput) {
  if (!cacheKey) {
    return false;
  }

  const routePayload = sanitizeRoutePayload(routePayloadInput);
  if (!routePayload.encodedPolyline) {
    return false;
  }

  const localRouteMap = await loadRouteCacheMap();
  localRouteMap.set(cacheKey, routePayload);
  await persistRouteCacheMap();

  const client = createConvexClient();
  if (!client) {
    return true;
  }

  try {
    await client.mutation('routeCache:upsertRouteByKey', {
      key: cacheKey,
      encodedPolyline: routePayload.encodedPolyline,
      totalDistanceMeters: routePayload.totalDistanceMeters,
      totalDurationSeconds: routePayload.totalDurationSeconds,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Convex route-cache write failed; continuing without route cache write.', error);
    return true;
  }
}

export async function syncEvents() {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';

  if (!firecrawlKey) {
    throw new Error('FIRECRAWL_API_KEY is missing. Add it in .env to sync events.');
  }

  await mkdir(DATA_DIR, { recursive: true });
  const nowIso = new Date().toISOString();
  const sourceSnapshot = await getSourceSnapshotForSync();
  const eventSyncResult = await syncEventsFromSources({
    eventSources: sourceSnapshot.eventSources,
    firecrawlKey,
    syncedAt: nowIso
  });
  const spotSyncResult = await syncSpotsFromSources({
    spotSources: sourceSnapshot.spotSources,
    firecrawlKey,
    syncedAt: nowIso
  });
  const fallbackPlaces =
    spotSyncResult.places.length > 0
      ? spotSyncResult.places
      : await ensureStaticPlacesCoordinates(await loadStaticPlaces());
  const allErrors = [...eventSyncResult.errors, ...spotSyncResult.errors];

  const payload = {
    meta: {
      syncedAt: nowIso,
      calendars: eventSyncResult.sourceUrls,
      eventCount: eventSyncResult.events.length,
      spotCount: fallbackPlaces.length,
      ingestionErrors: allErrors
    },
    events: eventSyncResult.events,
    places: fallbackPlaces
  };

  await writeFile(EVENTS_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  await Promise.allSettled([
    saveEventsToConvex(payload),
    saveSpotsToConvex({
      spots: fallbackPlaces,
      syncedAt: nowIso,
      sourceUrls: spotSyncResult.sourceUrls
    }),
    saveSourceSyncStatus(sourceSnapshot.eventSources, eventSyncResult.errors, nowIso),
    saveSourceSyncStatus(sourceSnapshot.spotSources, spotSyncResult.errors, nowIso)
  ]);

  return payload;
}

export async function syncSingleSource(sourceId) {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';

  if (!firecrawlKey) {
    throw new Error('FIRECRAWL_API_KEY is missing.');
  }

  const sourcesPayload = await loadSourcesPayload();
  const allSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
  const source = allSources.find((s) => s.id === sourceId);

  if (!source) {
    throw new Error('Source not found.');
  }

  const nowIso = new Date().toISOString();

  if (source.sourceType === 'event') {
    const result = await syncEventsFromSources({
      eventSources: [source],
      firecrawlKey,
      syncedAt: nowIso
    });
    await saveSourceSyncStatus([source], result.errors, nowIso);
    return { syncedAt: nowIso, events: result.events.length, errors: result.errors };
  }

  const result = await syncSpotsFromSources({
    spotSources: [source],
    firecrawlKey
  });
  await saveSourceSyncStatus([source], result.errors, nowIso);
  return { syncedAt: nowIso, spots: result.places.length, errors: result.errors };
}

async function loadStaticPlaces() {
  try {
    const raw = await readFile(STATIC_PLACES_FILE, 'utf-8');
    const places = JSON.parse(raw);
    return Array.isArray(places) ? places.map(normalizePlaceCoordinates) : [];
  } catch {
    return [];
  }
}

function getConvexUrl() {
  return process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
}

function createConvexClient() {
  const convexUrl = getConvexUrl();

  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl);
}

async function loadEventsFromConvex(calendars) {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const [events, syncMeta] = await Promise.all([
      client.query('events:listEvents', {}),
      client.query('events:getSyncMeta', {})
    ]);

    if (!Array.isArray(events)) {
      return null;
    }

    if (!syncMeta && events.length === 0) {
      return null;
    }

    return {
      meta: {
        syncedAt: syncMeta?.syncedAt || null,
        calendars: Array.isArray(syncMeta?.calendars) ? syncMeta.calendars : calendars,
        eventCount: typeof syncMeta?.eventCount === 'number' ? syncMeta.eventCount : events.length,
        source: 'convex'
      },
      events
    };
  } catch (error) {
    console.error('Convex read failed, falling back to file cache.', error);
    return null;
  }
}

async function saveEventsToConvex(payload) {
  const client = createConvexClient();

  if (!client) {
    return;
  }

  try {
    await client.mutation('events:upsertEvents', {
      events: payload.events,
      syncedAt: payload.meta.syncedAt,
      calendars: payload.meta.calendars,
      missedSyncThreshold: MISSED_SYNC_THRESHOLD
    });
  } catch (error) {
    console.error('Convex write failed; local cache is still updated.', error);
  }
}

async function loadPlannerFromConvex() {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const payload = await client.query('planner:getPlannerState', {});
    return sanitizePlannerByDateInput(payload?.plannerByDate || {});
  } catch (error) {
    console.error('Convex planner read failed, falling back to local planner cache.', error);
    return null;
  }
}

async function savePlannerToConvex(plannerByDate) {
  const client = createConvexClient();

  if (!client) {
    return false;
  }

  try {
    await client.mutation('planner:replacePlannerState', {
      plannerByDate,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Convex planner write failed; local planner cache is still used.', error);
    return false;
  }
}

async function loadSourcesFromConvex() {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const rows = await client.query('sources:listSources', {});
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => normalizeSourceRecord(row))
      .filter(Boolean);
  } catch (error) {
    console.error('Convex source read failed, falling back to env sources.', error);
    return null;
  }
}

async function loadSpotsFromConvex() {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const [spots, syncMeta] = await Promise.all([
      client.query('spots:listSpots', {}),
      client.query('spots:getSyncMeta', {})
    ]);

    if (!Array.isArray(spots)) {
      return null;
    }

    if (!syncMeta && spots.length === 0) {
      return null;
    }

    return {
      meta: {
        syncedAt: syncMeta?.syncedAt || null,
        sourceUrls: Array.isArray(syncMeta?.calendars) ? syncMeta.calendars : [],
        spotCount: typeof syncMeta?.eventCount === 'number' ? syncMeta.eventCount : spots.length,
        source: 'convex'
      },
      spots
    };
  } catch (error) {
    console.error('Convex spots read failed, falling back to file cache.', error);
    return null;
  }
}

async function saveSpotsToConvex({ spots, syncedAt, sourceUrls }) {
  const client = createConvexClient();

  if (!client) {
    return;
  }

  try {
    await client.mutation('spots:upsertSpots', {
      spots,
      syncedAt,
      sourceUrls,
      missedSyncThreshold: MISSED_SYNC_THRESHOLD
    });
  } catch (error) {
    console.error('Convex spots write failed; local cache is still updated.', error);
  }
}

function getActiveSourceUrls(sources, sourceType) {
  if (!Array.isArray(sources)) {
    return [];
  }

  return Array.from(new Set(
    sources
      .filter((source) => source?.sourceType === sourceType)
      .filter((source) => source?.status === 'active')
      .map((source) => cleanText(source.url))
      .filter(Boolean)
  ));
}

function getActiveSourcesByType(sources, sourceType) {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .filter((source) => source?.sourceType === sourceType && source?.status === 'active')
    .map((source) => ({
      ...source,
      url: cleanText(source.url),
      label: cleanText(source.label) || cleanText(source.url)
    }))
    .filter((source) => source.url);
}

function makeFallbackSource(sourceType, url) {
  const nextUrl = cleanText(url);
  return {
    id: `fallback-${sourceType}-${nextUrl}`,
    sourceType,
    url: nextUrl,
    label: nextUrl,
    status: 'active',
    readonly: true
  };
}

async function getSourceSnapshotForSync() {
  const convexSources = await loadSourcesFromConvex();
  const eventSourcesFromConvex = getActiveSourcesByType(convexSources, 'event');
  const spotSourcesFromConvex = getActiveSourcesByType(convexSources, 'spot');
  const eventFallbackUrls = getCalendarUrls();
  const spotFallbackUrls = getDefaultSpotSourceUrls();

  const eventSources =
    eventSourcesFromConvex.length > 0
      ? eventSourcesFromConvex
      : eventFallbackUrls.map((url) => makeFallbackSource('event', url));
  const spotSources =
    spotSourcesFromConvex.length > 0
      ? spotSourcesFromConvex
      : (spotFallbackUrls.length > 0 ? spotFallbackUrls : [DEFAULT_CORNER_LIST_URL])
          .map((url) => makeFallbackSource('spot', url));

  return {
    eventSources,
    spotSources
  };
}

async function syncEventsFromSources({ eventSources, firecrawlKey }) {
  const errors = [];
  const maxEventUrls = getMaxEventUrls();
  const eventSourceByUrl = new Map();

  for (const source of eventSources) {
    try {
      const discovered = await fetchEventUrlsFromCalendars([source.url], firecrawlKey);
      let candidateUrls = discovered;

      if (candidateUrls.length === 0 && isLikelyDirectLumaEventUrl(source.url)) {
        candidateUrls = [source.url];
      }

      if (candidateUrls.length === 0) {
        errors.push(createIngestionError({
          sourceType: 'event',
          sourceId: source.id,
          sourceUrl: source.url,
          stage: 'discover',
          message: 'No event URLs discovered from source.'
        }));
      }

      for (const eventUrl of candidateUrls) {
        if (!eventSourceByUrl.has(eventUrl)) {
          eventSourceByUrl.set(eventUrl, source);
        }
      }
    } catch (error) {
      errors.push(createIngestionError({
        sourceType: 'event',
        sourceId: source.id,
        sourceUrl: source.url,
        stage: 'discover',
        message: error instanceof Error ? error.message : 'Event URL discovery failed.'
      }));
    }
  }

  const eventUrls = Array.from(eventSourceByUrl.keys()).slice(0, maxEventUrls);
  const events = [];
  const chunkSize = 4;

  for (let index = 0; index < eventUrls.length; index += chunkSize) {
    const chunk = eventUrls.slice(index, index + chunkSize);
    const result = await Promise.allSettled(
      chunk.map((eventUrl) => fetchEventDetailsWithRetry(eventUrl, firecrawlKey))
    );

    for (let resultIndex = 0; resultIndex < result.length; resultIndex += 1) {
      const item = result[resultIndex];
      const eventUrl = chunk[resultIndex];
      const source = eventSourceByUrl.get(eventUrl);

      if (item.status !== 'fulfilled') {
        errors.push(createIngestionError({
          sourceType: 'event',
          sourceId: source?.id,
          sourceUrl: source?.url || '',
          eventUrl,
          stage: 'details',
          message: item.reason instanceof Error ? item.reason.message : `Failed to fetch ${eventUrl}`
        }));
        continue;
      }

      const normalized = normalizeEvent(item.value);
      if (!normalized) {
        errors.push(createIngestionError({
          sourceType: 'event',
          sourceId: source?.id,
          sourceUrl: source?.url || '',
          eventUrl,
          stage: 'normalize',
          message: 'Event payload was missing required fields.'
        }));
        continue;
      }

      events.push({
        ...normalized,
        sourceId: source?.id || '',
        sourceUrl: source?.url || '',
        confidence: scoreEvent(normalized) >= 6 ? 1 : 0.7
      });
    }
  }

  const deduped = dedupeAndSortEvents(events);
  const withCoordinates = await enrichEventsWithCoordinates(deduped);

  return {
    events: withCoordinates,
    sourceUrls: eventSources.map((source) => source.url),
    errors
  };
}

async function syncSpotsFromSources({ spotSources, firecrawlKey }) {
  const errors = [];
  const places = [];

  for (const source of spotSources) {
    try {
      const rawPlaces = await fetchSpotsFromSource(source.url, firecrawlKey);
      const normalized = normalizeSpots(rawPlaces, source);

      if (normalized.length === 0) {
        errors.push(createIngestionError({
          sourceType: 'spot',
          sourceId: source.id,
          sourceUrl: source.url,
          stage: 'normalize',
          message: 'No places parsed from source.'
        }));
      }

      places.push(...normalized);
    } catch (error) {
      errors.push(createIngestionError({
        sourceType: 'spot',
        sourceId: source.id,
        sourceUrl: source.url,
        stage: 'extract',
        message: error instanceof Error ? error.message : 'Spot extraction failed.'
      }));
    }
  }

  const deduped = dedupeAndSortSpots(places);
  const withCoordinates = await enrichPlacesWithCoordinates(deduped);

  return {
    places: withCoordinates,
    sourceUrls: spotSources.map((source) => source.url),
    errors
  };
}

async function fetchSpotsFromSource(sourceUrl, firecrawlKey) {
  const schema = {
    type: 'object',
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tag: { type: 'string' },
            location: { type: 'string' },
            mapLink: { type: 'string' },
            cornerLink: { type: 'string' },
            curatorComment: { type: 'string' },
            shortDescription: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  };

  const prompt = [
    'Extract all places in this specific list or landing page.',
    'For each place include: name, tag (eat/bar/cafes/go out/shops if inferable),',
    'location text, direct place URL, best map URL if shown,',
    'curatorComment, shortDescription, and any important details.'
  ].join(' ');

  const response = await callFirecrawl('/v1/extract', {
    urls: [sourceUrl],
    prompt,
    schema,
    allowExternalLinks: false,
    includeSubdomains: false,
    enableWebSearch: false
  }, firecrawlKey);

  const places = response?.data?.places;
  return Array.isArray(places) ? places : [];
}

async function enrichPlacesWithCoordinates(places) {
  const nextPlaces = [];

  for (const place of places) {
    const normalized = normalizePlaceCoordinates(place);

    if (isFiniteCoordinate(normalized.lat) && isFiniteCoordinate(normalized.lng)) {
      nextPlaces.push(normalized);
      continue;
    }

    const fromMapUrl = parseLatLngFromMapUrl(normalized.mapLink || '');
    if (fromMapUrl) {
      nextPlaces.push({
        ...normalized,
        lat: fromMapUrl.lat,
        lng: fromMapUrl.lng
      });
      continue;
    }

    const geocodeTarget = normalized.location || normalized.name;
    const geocoded = await geocodeAddressWithCache(geocodeTarget);

    if (geocoded) {
      nextPlaces.push({
        ...normalized,
        lat: geocoded.lat,
        lng: geocoded.lng
      });
      continue;
    }

    nextPlaces.push(normalized);
  }

  return nextPlaces;
}

function normalizeSpots(rawPlaces, source) {
  const normalized = [];
  const seen = new Set();

  for (const raw of rawPlaces) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const name = cleanText(raw.name);
    const location = cleanText(raw.location);
    if (!name || !location) {
      continue;
    }

    const cornerLink = cleanText(raw.cornerLink);
    const dedupeKey = buildSpotDedupeKey({
      cornerLink,
      name,
      location
    });

    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const tag = normalizeSpotTag(raw.tag, `${name} ${raw.shortDescription || ''} ${raw.details || ''}`);
    const mapLink = normalizeSpotMapLink(raw.mapLink, location);
    const id = createSpotIdFromKey(dedupeKey);
    const description = cleanText(raw.shortDescription);

    normalized.push({
      id,
      name,
      tag,
      location,
      mapLink,
      cornerLink,
      curatorComment: cleanText(raw.curatorComment),
      description,
      details: cleanText(raw.details),
      sourceId: source?.id || '',
      sourceUrl: source?.url || '',
      confidence: scoreSpot({
        name,
        location,
        mapLink,
        cornerLink,
        description
      }) >= 4 ? 1 : 0.7
    });
  }

  return normalized;
}

function dedupeAndSortSpots(spots) {
  const bestByKey = new Map();

  for (const spot of spots) {
    const key = buildSpotDedupeKey(spot);
    const existing = bestByKey.get(key);
    if (!existing || scoreSpot(spot) > scoreSpot(existing)) {
      bestByKey.set(key, spot);
    }
  }

  return Array.from(bestByKey.values()).sort((left, right) => {
    const leftKey = `${left.tag}|${left.name}`;
    const rightKey = `${right.tag}|${right.name}`;
    return leftKey.localeCompare(rightKey);
  });
}

function buildSpotDedupKey(spot) {
  const cornerLink = cleanText(spot?.cornerLink);
  if (cornerLink) {
    return cornerLink.toLowerCase();
  }

  return `${cleanText(spot?.name).toLowerCase()}|${cleanText(spot?.location).toLowerCase()}`;
}

function createSpotIdFromKey(key) {
  const slug = cleanText(key)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `spot-${slug || 'unknown'}`;
}

function normalizeSpotTag(tag, fallbackText) {
  const value = cleanText(tag).toLowerCase();
  if (SPOT_TAGS.includes(value)) {
    return value;
  }

  const haystack = `${value} ${cleanText(fallbackText).toLowerCase()}`;
  if (/(coffee|cafe|espresso|matcha|tea|bakery)/.test(haystack)) return 'cafes';
  if (/(bar|cocktail|wine|pub|brewery)/.test(haystack)) return 'bar';
  if (/(shop|store|boutique|retail|market)/.test(haystack)) return 'shops';
  if (/(club|night|party|dance|music venue|late night)/.test(haystack)) return 'go out';
  return 'eat';
}

function normalizeSpotMapLink(rawLink, location) {
  const link = cleanText(rawLink);
  if (link.startsWith('https://') || link.startsWith('http://')) {
    return link;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function scoreSpot(spot) {
  let score = 0;
  if (cleanText(spot?.name)) score += 1;
  if (cleanText(spot?.location)) score += 1;
  if (cleanText(spot?.mapLink)) score += 1;
  if (cleanText(spot?.cornerLink)) score += 1;
  if (cleanText(spot?.description)) score += 1;
  if (cleanText(spot?.details)) score += 1;
  if (isFiniteCoordinate(spot?.lat)) score += 1;
  if (isFiniteCoordinate(spot?.lng)) score += 1;
  return score;
}

async function saveSourceSyncStatus(sources, errors, syncedAt) {
  const client = createConvexClient();

  if (!client || !Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const firstErrorBySource = new Map();
  for (const error of errors || []) {
    const sourceId = cleanText(error?.sourceId);
    if (!sourceId || firstErrorBySource.has(sourceId)) {
      continue;
    }
    firstErrorBySource.set(sourceId, cleanText(error?.message));
  }

  const updateTasks = sources
    .filter((source) => !source?.readonly && cleanText(source?.id))
    .map((source) =>
      client.mutation('sources:updateSource', {
        sourceId: source.id,
        lastSyncedAt: syncedAt,
        lastError: firstErrorBySource.get(source.id) || ''
      })
    );

  await Promise.allSettled(updateTasks);
}

function createIngestionError({ sourceType, sourceId, sourceUrl, eventUrl, stage, message }) {
  return {
    sourceType,
    sourceId: cleanText(sourceId),
    sourceUrl: cleanText(sourceUrl),
    eventUrl: cleanText(eventUrl),
    stage: cleanText(stage),
    message: cleanText(message)
  };
}

function normalizeSourceRecord(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const sourceType = cleanText(source.sourceType).toLowerCase();
  const status = cleanText(source.status).toLowerCase();
  const url = cleanText(source.url);

  if (!SOURCE_TYPES.has(sourceType) || !SOURCE_STATUSES.has(status) || !url) {
    return null;
  }

  return {
    id: cleanText(source._id || source.id),
    sourceType,
    url,
    label: cleanText(source.label) || url,
    status,
    createdAt: cleanText(source.createdAt),
    updatedAt: cleanText(source.updatedAt),
    lastSyncedAt: cleanText(source.lastSyncedAt),
    lastError: cleanText(source.lastError)
  };
}

function assertValidUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error('Invalid URL. Use a full http(s) URL.');
  }
}

function isLikelyDirectLumaEventUrl(url) {
  if (!url.startsWith('https://luma.com/')) {
    return false;
  }

  if (url.includes('/map')) {
    return false;
  }

  const slug = url
    .replace('https://luma.com/', '')
    .split('?')[0]
    .split('#')[0]
    .toLowerCase();

  if (!slug || slug.includes('/')) {
    return false;
  }

  return slug !== 'sf' && slug !== 'cerebralvalley_';
}

async function ensureStaticPlacesCoordinates(places) {
  const nextPlaces = [];
  let changed = false;

  for (const place of places) {
    const normalized = normalizePlaceCoordinates(place);

    if (isFiniteCoordinate(normalized.lat) && isFiniteCoordinate(normalized.lng)) {
      nextPlaces.push(normalized);
      continue;
    }

    const fromMapUrl = parseLatLngFromMapUrl(normalized.mapLink || '');
    if (fromMapUrl) {
      nextPlaces.push({
        ...normalized,
        lat: fromMapUrl.lat,
        lng: fromMapUrl.lng
      });
      changed = true;
      continue;
    }

    const geocodeTarget = normalized.location || normalized.name;
    const geocoded = await geocodeAddressWithCache(geocodeTarget);

    if (geocoded) {
      nextPlaces.push({
        ...normalized,
        lat: geocoded.lat,
        lng: geocoded.lng
      });
      changed = true;
      continue;
    }

    nextPlaces.push(normalized);
  }

  if (changed) {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATIC_PLACES_FILE, `${JSON.stringify(nextPlaces, null, 2)}\n`, 'utf-8');
  }

  return nextPlaces;
}

async function enrichEventsWithCoordinates(events) {
  const nextEvents = [];

  for (const event of events) {
    if (isFiniteCoordinate(event.lat) && isFiniteCoordinate(event.lng)) {
      nextEvents.push(event);
      continue;
    }

    const fromMapUrl = parseLatLngFromMapUrl(event.googleMapsUrl || '');
    if (fromMapUrl) {
      nextEvents.push({
        ...event,
        lat: fromMapUrl.lat,
        lng: fromMapUrl.lng
      });
      continue;
    }

    const geocodeTarget = event.address || event.locationText;
    const geocoded = await geocodeAddressWithCache(geocodeTarget);

    if (geocoded) {
      nextEvents.push({
        ...event,
        lat: geocoded.lat,
        lng: geocoded.lng
      });
      continue;
    }

    nextEvents.push(event);
  }

  return nextEvents;
}

function normalizePlaceCoordinates(place) {
  const lat = toCoordinateNumber(place?.lat);
  const lng = toCoordinateNumber(place?.lng);

  if (isFiniteCoordinate(lat) && isFiniteCoordinate(lng)) {
    return {
      ...place,
      lat,
      lng
    };
  }

  const { lat: _, lng: __, ...rest } = place || {};
  return rest;
}

function parseLatLngFromMapUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const queryValue = parsedUrl.searchParams.get('query') || '';
    const parts = queryValue.split(',').map((part) => Number(part));

    if (parts.length === 2 && isFiniteCoordinate(parts[0]) && isFiniteCoordinate(parts[1])) {
      return {
        lat: parts[0],
        lng: parts[1]
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function geocodeAddressWithCache(addressText) {
  const addressKey = normalizeAddressKey(addressText);
  if (!addressKey) {
    return null;
  }

  const map = await loadGeocodeCacheMap();
  const localCached = map.get(addressKey);
  if (localCached) {
    return localCached;
  }

  const convexCached = await loadGeocodeFromConvex(addressKey);
  if (convexCached) {
    map.set(addressKey, convexCached);
    await persistGeocodeCacheMap();
    return convexCached;
  }

  const geocodingKey = getGoogleGeocodingKey();
  if (!geocodingKey) {
    return null;
  }

  const geocoded = await geocodeAddressViaGoogle(addressText, geocodingKey);
  if (!geocoded) {
    return null;
  }

  map.set(addressKey, geocoded);
  await Promise.allSettled([
    persistGeocodeCacheMap(),
    saveGeocodeToConvex(addressKey, geocoded, addressText)
  ]);

  return geocoded;
}

function getGoogleGeocodingKey() {
  return (
    process.env.GOOGLE_MAPS_GEOCODING_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    ''
  );
}

async function geocodeAddressViaGoogle(addressText, apiKey) {
  const query = new URLSearchParams({
    address: cleanText(addressText),
    key: apiKey
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (payload?.status !== 'OK') {
    return null;
  }

  const location = payload?.results?.[0]?.geometry?.location;
  const lat = toCoordinateNumber(location?.lat);
  const lng = toCoordinateNumber(location?.lng);

  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizeAddressKey(value) {
  const cleaned = cleanText(value || '')
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

function toCoordinateNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function loadGeocodeCacheMap() {
  if (geocodeCacheMapPromise) {
    return geocodeCacheMapPromise;
  }

  geocodeCacheMapPromise = (async () => {
    try {
      const raw = await readFile(GEOCODE_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);

      const map = new Map();
      for (const [addressKey, coordinates] of Object.entries(parsed || {})) {
        const lat = toCoordinateNumber(coordinates?.lat);
        const lng = toCoordinateNumber(coordinates?.lng);

        if (isFiniteCoordinate(lat) && isFiniteCoordinate(lng)) {
          map.set(addressKey, { lat, lng });
        }
      }

      return map;
    } catch {
      return new Map();
    }
  })();

  return geocodeCacheMapPromise;
}

async function persistGeocodeCacheMap() {
  const map = await loadGeocodeCacheMap();
  const payload = {};

  for (const [addressKey, coordinates] of map.entries()) {
    if (!isFiniteCoordinate(coordinates?.lat) || !isFiniteCoordinate(coordinates?.lng)) {
      continue;
    }

    payload[addressKey] = {
      lat: coordinates.lat,
      lng: coordinates.lng
    };
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GEOCODE_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function loadGeocodeFromConvex(addressKey) {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const cached = await client.query('events:getGeocodeByAddressKey', { addressKey });
    const lat = toCoordinateNumber(cached?.lat);
    const lng = toCoordinateNumber(cached?.lng);

    if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

async function saveGeocodeToConvex(addressKey, coordinates, addressText) {
  const client = createConvexClient();

  if (!client) {
    return;
  }

  try {
    await client.mutation('events:upsertGeocode', {
      addressKey,
      addressText: cleanText(addressText),
      lat: coordinates.lat,
      lng: coordinates.lng,
      updatedAt: new Date().toISOString()
    });
  } catch {
    // Ignore convex geocode cache write failures.
  }
}

async function fetchEventUrlsFromCalendars(calendarUrls, firecrawlKey) {
  const schema = {
    type: 'object',
    properties: {
      eventUrls: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  };

  const prompt = [
    'Extract upcoming Luma event page URLs from these calendar pages.',
    'Return only URLs for individual events with pattern https://luma.com/<event-slug>.',
    'Do not include calendar overview pages like /sf, /cerebralvalley_, or map pages.'
  ].join(' ');

  const response = await callFirecrawl('/v1/extract', {
    urls: calendarUrls,
    prompt,
    schema
  }, firecrawlKey);

  const urls = response?.data?.eventUrls || [];

  return Array.from(
    new Set(
      urls
        .map((value) => value.trim())
        .filter((value) => value.startsWith('https://luma.com/'))
        .filter((value) => !value.includes('/map'))
        .filter((value) => {
          const slug = value.replace('https://luma.com/', '').toLowerCase();
          return slug !== 'sf' && slug !== 'cerebralvalley_';
        })
    )
  );
}

async function fetchEventDetails(eventUrl, firecrawlKey) {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      url: { type: 'string' },
      startDateTimeText: { type: 'string' },
      startDateISO: { type: 'string' },
      locationText: { type: 'string' },
      address: { type: 'string' },
      googleMapsUrl: { type: 'string' }
    }
  };

  const prompt = [
    'Extract details for this specific Luma event page only.',
    'Return null or empty string for missing fields.',
    'Do not infer a different event from unrelated pages.',
    'Use the given URL as url.'
  ].join(' ');

  const response = await callFirecrawl('/v1/extract', {
    urls: [eventUrl],
    prompt,
    schema
  }, firecrawlKey);

  const rootData = response?.data || {};
  const data = Array.isArray(rootData.events) ? rootData.events[0] || {} : rootData;

  if (cleanText(data.name)) {
    return {
      ...data,
      url: eventUrl
    };
  }

  const scrapedFallback = await fetchEventDetailsFromScrape(eventUrl, firecrawlKey);

  return {
    ...scrapedFallback,
    ...data,
    name: cleanText(data.name) || cleanText(scrapedFallback.name) || slugToTitle(eventUrl),
    description: cleanText(data.description) || cleanText(scrapedFallback.description),
    startDateTimeText: cleanText(data.startDateTimeText) || cleanText(scrapedFallback.startDateTimeText),
    startDateISO: cleanText(data.startDateISO) || cleanText(scrapedFallback.startDateISO),
    locationText: cleanText(data.locationText) || cleanText(scrapedFallback.locationText),
    address: cleanText(data.address) || cleanText(scrapedFallback.address),
    googleMapsUrl: cleanText(data.googleMapsUrl) || cleanText(scrapedFallback.googleMapsUrl),
    url: eventUrl
  };
}

async function fetchEventDetailsWithRetry(eventUrl, firecrawlKey) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchEventDetails(eventUrl, firecrawlKey);
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch event details for ${eventUrl}`);
}

async function fetchEventDetailsFromScrape(eventUrl, firecrawlKey) {
  const response = await callFirecrawl('/v1/scrape', {
    url: eventUrl,
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: 8000
  }, firecrawlKey);

  const markdown = cleanTextPreservingNewlines(response?.data?.markdown || '');
  const metadataTitle = cleanText(response?.data?.metadata?.title).replace(/\s*·\s*Luma$/i, '');

  const headingName = firstMatch(markdown, /^#\s+(.+)$/m);
  const name = headingName || metadataTitle || slugToTitle(eventUrl);

  const mapsUrl = firstMatch(markdown, /(https:\/\/www\.google\.com\/maps\/search\/\?[^\s)]+)/);
  const locationFromMapsLine = firstMatch(
    markdown,
    /([A-Za-z][^\]\n]{2,90})\]\(https:\/\/www\.google\.com\/maps\/search\/\?[^)]+\)/
  );

  const address = firstMatch(
    markdown,
    /\b\d{1,6}\s+[^,\n]+,\s*[^,\n]+,\s*[A-Z]{2}\s*\d{5}(?:,\s*USA)?\b/
  );

  const dateLine = firstMatch(
    markdown,
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2}\b/
  );
  const timeLine = firstMatch(
    markdown,
    /\b\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)\s*[A-Za-z0-9:+-]+\b/
  );
  const startDateTimeText = [dateLine, timeLine].filter(Boolean).join(', ');

  const description = extractAboutDescription(markdown);

  return {
    name,
    description,
    url: eventUrl,
    startDateTimeText,
    startDateISO: inferDateISO(startDateTimeText),
    locationText: locationFromMapsLine || '',
    address: address || '',
    googleMapsUrl: mapsUrl || ''
  };
}

async function callFirecrawl(endpoint, payload, firecrawlKey) {
  const response = await fetch(`https://api.firecrawl.dev${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl request failed (${response.status}): ${text}`);
  }

  const jsonPayload = await response.json();

  if (jsonPayload?.success === false) {
    throw new Error(`Firecrawl error: ${jsonPayload.error || 'unknown error'}`);
  }

  if (endpoint === '/v1/extract' && jsonPayload?.id && !jsonPayload?.data) {
    return waitForFirecrawlExtract(jsonPayload.id, firecrawlKey);
  }

  return jsonPayload;
}

async function waitForFirecrawlExtract(jobId, firecrawlKey) {
  const maxAttempts = 40;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`https://api.firecrawl.dev/v1/extract/${jobId}`, {
      headers: {
        Authorization: `Bearer ${firecrawlKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firecrawl extract poll failed (${response.status}): ${text}`);
    }

    const payload = await response.json();

    if (payload?.success === false) {
      throw new Error(`Firecrawl extract poll error: ${payload.error || 'unknown error'}`);
    }

    if (payload?.status === 'completed') {
      return payload;
    }

    if (payload?.status === 'failed' || payload?.status === 'cancelled') {
      throw new Error(`Firecrawl extract job ${payload.status}`);
    }

    await sleep(delayMs);
  }

  throw new Error('Firecrawl extract polling timed out.');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  const eventUrl = cleanText(rawEvent.url);
  const name = cleanText(rawEvent.name);

  if (!eventUrl || !name || !eventUrl.startsWith('https://luma.com/')) {
    return null;
  }

  const startDateTimeText = cleanText(rawEvent.startDateTimeText);
  const explicitDate = cleanText(rawEvent.startDateISO).slice(0, 10);
  const startDateISO = explicitDate || inferDateISO(startDateTimeText);
  const googleMapsUrl = cleanText(rawEvent.googleMapsUrl);
  const mapCoordinates = parseLatLngFromMapUrl(googleMapsUrl);

  return {
    id: eventUrl.replace('https://luma.com/', ''),
    name,
    description: cleanText(rawEvent.description),
    eventUrl,
    startDateTimeText,
    startDateISO,
    locationText: cleanText(rawEvent.locationText),
    address: cleanText(rawEvent.address),
    googleMapsUrl,
    ...(mapCoordinates || {})
  };
}

function dedupeAndSortEvents(events) {
  const bestByUrl = new Map();

  for (const event of events) {
    const existing = bestByUrl.get(event.eventUrl);

    if (!existing || scoreEvent(event) > scoreEvent(existing)) {
      bestByUrl.set(event.eventUrl, event);
    }
  }

  return Array.from(bestByUrl.values()).sort((left, right) => {
    const leftValue = left.startDateISO || '9999-99-99';
    const rightValue = right.startDateISO || '9999-99-99';
    return leftValue.localeCompare(rightValue);
  });
}

function scoreEvent(event) {
  let score = 0;

  if (event.name) score += 1;
  if (event.description) score += 1;
  if (event.startDateTimeText) score += 1;
  if (event.startDateISO) score += 1;
  if (event.locationText) score += 1;
  if (event.address) score += 1;
  if (event.googleMapsUrl) score += 1;
  if (isFiniteCoordinate(event.lat)) score += 1;
  if (isFiniteCoordinate(event.lng)) score += 1;

  return score;
}

function inferDateISO(startDateTimeText) {
  if (!startDateTimeText) {
    return '';
  }

  const isoMatch = startDateTimeText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const date = new Date(startDateTimeText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function cleanTextPreservingNewlines(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  if (!match) {
    return '';
  }

  return cleanText(match[1] || match[0] || '');
}

function extractAboutDescription(markdown) {
  if (!markdown) {
    return '';
  }

  const aboutSectionMatch = markdown.match(/##\s*About Event([\s\S]*?)(\n##\s|\n#\s|$)/i);
  if (aboutSectionMatch?.[1]) {
    const lines = aboutSectionMatch[1]
      .split('\n')
      .map((line) => cleanText(line))
      .filter((line) => line && !line.startsWith('![') && !line.startsWith('['));

    if (lines.length) {
      return lines.join(' ');
    }
  }

  return '';
}

function slugToTitle(eventUrl) {
  const slug = cleanText(eventUrl).replace('https://luma.com/', '');
  if (!slug) {
    return '';
  }

  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizePlannerByDateInput(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const cleaned = {};

  for (const [dateISO, items] of Object.entries(value)) {
    if (!dateISO || !Array.isArray(items)) {
      continue;
    }

    const cleanedItems = items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const startMinutes = clampMinutes(Number(item.startMinutes), 0, MINUTES_IN_DAY);
        const endMinutes = clampMinutes(
          Number(item.endMinutes),
          startMinutes + MIN_PLAN_BLOCK_MINUTES,
          MINUTES_IN_DAY
        );

        return {
          id: cleanText(item.id) || createPlannerItemId(),
          kind: item.kind === 'event' ? 'event' : 'place',
          sourceKey: cleanText(item.sourceKey),
          title: cleanText(item.title) || 'Untitled stop',
          locationText: cleanText(item.locationText),
          link: cleanText(item.link),
          tag: cleanText(item.tag),
          startMinutes,
          endMinutes
        };
      })
      .filter((item) => item.sourceKey);

    if (cleanedItems.length > 0) {
      cleaned[dateISO] = cleanedItems;
    }
  }

  return cleaned;
}

function clampMinutes(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function createPlannerItemId() {
  return `plan-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeRoutePayload(value) {
  return {
    encodedPolyline: cleanText(value?.encodedPolyline),
    totalDistanceMeters: Math.max(0, Number(value?.totalDistanceMeters) || 0),
    totalDurationSeconds: Math.max(0, Number(value?.totalDurationSeconds) || 0)
  };
}

async function loadRouteCacheMap() {
  if (routeCacheMapPromise) {
    return routeCacheMapPromise;
  }

  routeCacheMapPromise = (async () => {
    try {
      const raw = await readFile(ROUTE_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const map = new Map();

      for (const [cacheKey, payload] of Object.entries(parsed || {})) {
        if (!cacheKey) {
          continue;
        }

        const sanitized = sanitizeRoutePayload(payload);
        if (!sanitized.encodedPolyline) {
          continue;
        }

        map.set(cacheKey, sanitized);
      }

      return map;
    } catch {
      return new Map();
    }
  })();

  return routeCacheMapPromise;
}

async function persistRouteCacheMap() {
  const map = await loadRouteCacheMap();
  const payload = {};

  for (const [cacheKey, routePayload] of map.entries()) {
    if (!cacheKey) {
      continue;
    }

    const sanitized = sanitizeRoutePayload(routePayload);
    if (!sanitized.encodedPolyline) {
      continue;
    }

    payload[cacheKey] = sanitized;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ROUTE_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}
