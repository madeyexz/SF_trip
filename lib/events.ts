// @ts-nocheck
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ical from 'node-ical';
import { ConvexHttpClient } from 'convex/browser';
import { getScopedConvexClient } from './convex-client-context.ts';
import { mapAsyncWithConcurrency } from './async-map.ts';
import { validateIngestionSourceUrlForFetch } from './security-server.ts';

const DOC_LOCATION_FILE = path.join(process.cwd(), 'docs', 'my_location.md');
const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_CACHE_FILE = path.join(DATA_DIR, 'events-cache.json');
const SAMPLE_EVENTS_FILE = path.join(DATA_DIR, 'sample-events.json');
const STATIC_PLACES_FILE = path.join(DATA_DIR, 'static-places.json');
const GEOCODE_CACHE_FILE = path.join(DATA_DIR, 'geocode-cache.json');
const ROUTE_CACHE_FILE = path.join(DATA_DIR, 'route-cache.json');
const TRIP_CONFIG_FILE = path.join(DATA_DIR, 'trip-config.json');
const MISSED_SYNC_THRESHOLD = 2;
const DEFAULT_CORNER_LIST_URL = 'https://www.corner.inc/list/e65af393-70dd-46d5-948a-d774f472d2ee';
// const DEFAULT_BEEHIIV_RSS_URL = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev';
const DEFAULT_RSS_INITIAL_ITEMS = 1;
const DEFAULT_RSS_MAX_ITEMS_PER_SYNC = 3;
const DEFAULT_RSS_STATE_MAX_ITEMS = 500;
const GEOCODE_BATCH_CONCURRENCY = 4;
const SOURCE_TYPES = new Set(['event', 'spot']);
const SOURCE_STATUSES = new Set(['active', 'paused']);
const SPOT_TAGS = ['eat', 'bar', 'cafes', 'go out', 'shops', 'sightseeing', 'avoid', 'safe'];
const CONVEX_EVENT_FIELDS = [
  'id',
  'name',
  'description',
  'eventUrl',
  'startDateTimeText',
  'startDateISO',
  'locationText',
  'lat',
  'lng',
  'sourceId',
  'sourceUrl',
  'confidence'
];
const CONVEX_SPOT_FIELDS = [
  'id',
  'name',
  'tag',
  'location',
  'mapLink',
  'cornerLink',
  'curatorComment',
  'description',
  'details',
  'lat',
  'lng'
];

let geocodeCacheMapPromise = null;
let routeCacheMapPromise = null;

export function resetEventsCachesForTesting() {
  geocodeCacheMapPromise = null;
  routeCacheMapPromise = null;
}

function isReadOnlyFilesystemError(error) {
  const code = cleanText(error?.code).toUpperCase();
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

async function ensureDataDirWritable() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    return true;
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      console.warn('Local data directory is read-only; skipping local cache writes.');
      return false;
    }
    throw error;
  }
}

async function writeTextFileBestEffort(filePath, contents, { ensureDataDir = false, label = 'local file' } = {}) {
  if (ensureDataDir) {
    const canWriteToDataDir = await ensureDataDirWritable();
    if (!canWriteToDataDir) {
      return false;
    }
  }

  try {
    await writeFile(filePath, contents, 'utf-8');
    return true;
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      console.warn(`Skipping ${label} write on read-only filesystem (${filePath}).`);
      return false;
    }
    throw error;
  }
}

export function getCalendarUrls() {
  return [
    'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB',
    'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka'
    // Firecrawl/RSS disabled: intentionally not auto-including Beehiiv RSS fallback.
    // DEFAULT_BEEHIIV_RSS_URL
  ];
}

export function getDefaultSpotSourceUrls() {
  return (process.env.SPOT_SOURCE_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function loadBaseLocation() {
  try {
    const client = createConvexClient();
    if (client) {
      const result = await client.query('tripConfig:getTripConfig', {});
      if (result?.baseLocation) {
        return result.baseLocation;
      }
    }
  } catch {
    // fall through to file fallback
  }
  try {
    const value = await readFile(DOC_LOCATION_FILE, 'utf-8');
    return value.trim();
  } catch {
    return 'San Francisco, CA';
  }
}

export async function saveBaseLocation(text) {
  const trimmed = (text || '').trim();
  const client = createConvexClient();
  if (client) {
    const existing = await client.query('tripConfig:getTripConfig', {});
    await client.mutation('tripConfig:saveTripConfig', {
      tripStart: existing?.tripStart || '',
      tripEnd: existing?.tripEnd || '',
      baseLocation: trimmed,
      showSharedPlaceRecommendations: existing?.showSharedPlaceRecommendations ?? true
    });
  }
  await writeTextFileBestEffort(DOC_LOCATION_FILE, trimmed, { label: 'base location' });
}

export async function loadTripConfig() {
  try {
    const client = createConvexClient();
    if (client) {
      const result = await client.query('tripConfig:getTripConfig', {});
      if (result) {
        return {
          tripStart: result.tripStart ?? '',
          tripEnd: result.tripEnd ?? '',
          baseLocation: result.baseLocation ?? '',
          showSharedPlaceRecommendations: result.showSharedPlaceRecommendations ?? true
        };
      }
    }
  } catch {
    // fall through to file fallback
  }
  try {
    const raw = await readFile(TRIP_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      tripStart: parsed.tripStart || '',
      tripEnd: parsed.tripEnd || '',
      baseLocation: parsed.baseLocation || '',
      showSharedPlaceRecommendations: parsed.showSharedPlaceRecommendations ?? true
    };
  } catch {
    return { tripStart: '', tripEnd: '', baseLocation: '', showSharedPlaceRecommendations: true };
  }
}

export async function saveTripConfig({ tripStart, tripEnd, baseLocation, showSharedPlaceRecommendations }) {
  const client = createConvexClient();
  if (client) {
    await client.mutation('tripConfig:saveTripConfig', {
      tripStart: tripStart || '',
      tripEnd: tripEnd || '',
      ...(baseLocation !== undefined ? { baseLocation } : {}),
      ...(showSharedPlaceRecommendations !== undefined ? { showSharedPlaceRecommendations } : {})
    });
  }
  await writeTextFileBestEffort(TRIP_CONFIG_FILE, JSON.stringify({
    tripStart,
    tripEnd,
    ...(baseLocation !== undefined ? { baseLocation } : {}),
    ...(showSharedPlaceRecommendations !== undefined ? { showSharedPlaceRecommendations } : {})
  }, null, 2), {
    ensureDataDir: true,
    label: 'trip config'
  });
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

function buildSourceKey(sourceType, url) {
  return `${cleanText(sourceType).toLowerCase()}:${normalizeComparableUrl(url)}`;
}

function getRequiredDefaultSpotUrls() {
  return Array.from(new Set([DEFAULT_CORNER_LIST_URL, ...getDefaultSpotSourceUrls()]))
    .map((url) => cleanText(url))
    .filter(Boolean);
}

function getRequiredDefaultSources() {
  const defaultEventSources = getCalendarUrls().map((url) => ({
    id: `fallback-event-${url}`,
    userId: '',
    sourceType: 'event',
    url,
    label: url,
    status: 'active',
    readonly: true
  }));
  const defaultSpotSources = getRequiredDefaultSpotUrls().map((url) => ({
    id: `fallback-spot-${url}`,
    userId: '',
    sourceType: 'spot',
    url,
    label: url,
    status: 'active',
    readonly: true
  }));

  return [...defaultEventSources, ...defaultSpotSources];
}

function markRequiredSourcesReadonly(sources) {
  const requiredDefaultKeys = new Set(
    getRequiredDefaultSources()
      .map((source) => buildSourceKey(source.sourceType, source.url))
  );

  return (Array.isArray(sources) ? sources : []).map((source) => {
    if (!requiredDefaultKeys.has(buildSourceKey(source?.sourceType, source?.url))) {
      return source;
    }

    return {
      ...source,
      status: 'active',
      readonly: true
    };
  });
}

function appendMissingRequiredDefaultSources(sources) {
  const nextSources = markRequiredSourcesReadonly(sources);
  const requiredDefaults = getRequiredDefaultSources();
  const seenSourceKeys = new Set(
    nextSources.map((source) => buildSourceKey(source?.sourceType, source?.url))
  );

  for (const requiredSource of requiredDefaults) {
    const sourceKey = buildSourceKey(requiredSource.sourceType, requiredSource.url);
    if (seenSourceKeys.has(sourceKey)) {
      continue;
    }
    nextSources.push(requiredSource);
    seenSourceKeys.add(sourceKey);
  }

  return nextSources;
}

function appendRequiredDefaultSourceUrls(urls, sourceType) {
  const nextUrls = Array.isArray(urls)
    ? urls.map((url) => cleanText(url)).filter(Boolean)
    : [];
  const requiredDefaultUrls = sourceType === 'event'
    ? getCalendarUrls()
    : sourceType === 'spot'
      ? getRequiredDefaultSpotUrls()
      : [];
  const seenComparableUrls = new Set(nextUrls.map((url) => normalizeComparableUrl(url)));

  for (const requiredUrlRaw of requiredDefaultUrls) {
    const requiredUrl = cleanText(requiredUrlRaw);
    const comparableUrl = normalizeComparableUrl(requiredUrl);
    if (!requiredUrl || seenComparableUrls.has(comparableUrl)) {
      continue;
    }
    nextUrls.push(requiredUrl);
    seenComparableUrls.add(comparableUrl);
  }

  return nextUrls;
}

export async function loadSourcesPayload() {
  const sources = await loadSourcesFromConvex();
  const fallbackSources = getRequiredDefaultSources();
  // Firecrawl/RSS disabled: do not force Beehiiv as a required event source.
  // const requiredEventSources = [makeFallbackSource('event', DEFAULT_BEEHIIV_RSS_URL)];

  if (Array.isArray(sources) && sources.length > 0) {
    const withFallbacks = appendMissingRequiredDefaultSources(sources);

    return {
      sources: withFallbacks,
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
    throw new Error('CONVEX_URL is missing. Configure Convex to persist personal sources.');
  }

  const sourceType = cleanText(input?.sourceType).toLowerCase();
  const url = cleanText(input?.url);
  const label = cleanText(input?.label);
  if (sourceType !== 'event' && sourceType !== 'spot') {
    throw new Error('sourceType must be "event" or "spot".');
  }

  await assertValidSourceUrl(url);

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
    throw new Error('CONVEX_URL is missing. Configure Convex to persist personal sources.');
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
    throw new Error('CONVEX_URL is missing. Configure Convex to persist personal sources.');
  }

  const result = await client.mutation('sources:deleteSource', {
    sourceId
  });
  if (!result?.deleted) {
    throw new Error('Source not found.');
  }

  return { deleted: true };
}

export async function loadEventsPayload() {
  const fallbackPlaces = await ensureStaticPlacesCoordinates(await loadStaticPlaces());
  const sources = appendMissingRequiredDefaultSources(await loadSourcesFromConvex());
  const sourceCalendars = getActiveSourceUrls(sources, 'event');
  const spotSourceUrls = getActiveSourceUrls(sources, 'spot');
  const calendars = appendRequiredDefaultSourceUrls(sourceCalendars, 'event');
  const tripConfig = await loadTripConfig();
  const spotsPayload = await loadSpotsFromConvex();
  const placeRecommendations = await loadPlaceRecommendationsFromConvex();
  const convexPayload = await loadEventsFromConvex(calendars);
  const convexEvents = Array.isArray(convexPayload?.events) ? convexPayload.events : [];
  const placesFromConvex = Array.isArray(spotsPayload?.spots) ? spotsPayload.spots : [];
  const coordinateRows = [
    ...convexEvents.map((row) => wrapCoordinateRow('event', row)),
    ...placesFromConvex.map((row) => wrapCoordinateRow('spot', row)),
    ...placeRecommendations.map((row) => wrapCoordinateRow('recommendation', row))
  ];
  const {
    rows: hydratedCoordinateRows,
    stats: hydrationStats
  } = await enrichLocationRowsWithCoordinates(coordinateRows, {
    getMapLink: getWrappedCoordinateMapLink,
    getFallbackText: getWrappedCoordinateFallbackText,
    applyCoordinates: applyWrappedCoordinates
  });
  const hydratedEvents = unwrapCoordinateRows(hydratedCoordinateRows, 'event');
  const hydratedSpots = unwrapCoordinateRows(hydratedCoordinateRows, 'spot');
  const hydratedRecommendations = unwrapCoordinateRows(hydratedCoordinateRows, 'recommendation');
  const placeBase = mergeStaticRegionPlaces(
    hydratedSpots.length > 0 ? hydratedSpots : fallbackPlaces,
    fallbackPlaces
  );
  const places = mergePlaceRecommendationsIntoPlaces(
    placeBase,
    hydratedRecommendations,
    { enabled: tripConfig.showSharedPlaceRecommendations }
  );

  if (hydrationStats.updatedRows > 0) {
    console.info('Coordinate enrichment summary:', hydrationStats);
  }

  if (convexPayload) {
    const eventCoordinateChanges = getChangedRows(convexEvents, hydratedEvents);
    const spotCoordinateChanges = getChangedRows(placesFromConvex, hydratedSpots);
    const recommendationCoordinateChanges = getChangedRows(placeRecommendations, hydratedRecommendations);

    await Promise.allSettled([
      eventCoordinateChanges.length > 0
        ? saveEventsToConvex({
            meta: {
              syncedAt: convexPayload.meta.syncedAt || new Date().toISOString(),
              calendars: Array.isArray(convexPayload.meta.calendars) ? convexPayload.meta.calendars : calendars
            },
            events: hydratedEvents
          })
        : Promise.resolve(),
      spotCoordinateChanges.length > 0
        ? saveSpotsToConvex({
            spots: hydratedSpots,
            syncedAt: spotsPayload?.meta?.syncedAt || new Date().toISOString(),
            sourceUrls: Array.isArray(spotsPayload?.meta?.sourceUrls) ? spotsPayload.meta.sourceUrls : spotSourceUrls
          })
        : Promise.resolve(),
      recommendationCoordinateChanges.length > 0
        ? savePlaceRecommendationCoordinatesToConvex(recommendationCoordinateChanges)
        : Promise.resolve()
    ]);

    return {
      ...convexPayload,
      events: hydratedEvents,
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
    const cachedEvents = Array.isArray(payload?.events) ? await enrichEventsWithCoordinates(payload.events) : [];
    const cachedPlacesBase = Array.isArray(payload?.places)
      ? mergeStaticRegionPlaces((await _enrichPlacesWithCoordinates(payload.places)).rows, fallbackPlaces)
      : [];
    const cachedPlaces = mergePlaceRecommendationsIntoPlaces(
      cachedPlacesBase.length > 0 ? cachedPlacesBase : places,
      hydratedRecommendations,
      { enabled: tripConfig.showSharedPlaceRecommendations }
    );
    return {
      ...payload,
      events: cachedEvents.length > 0 ? cachedEvents : payload?.events || [],
      places: cachedPlaces.length > 0 ? cachedPlaces : places
    };
  } catch {
    try {
      const sampleRaw = await readFile(SAMPLE_EVENTS_FILE, 'utf-8');
      const sampleEvents = await enrichEventsWithCoordinates(JSON.parse(sampleRaw));
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
  const nowIso = new Date().toISOString();
  const sourceSnapshot = await getSourceSnapshotForSync();
  const tripConfig = await loadTripConfig();
  const rssFallbackStateBySourceUrl = await loadRssSeenBySourceUrlFromEventsCache();
  const eventSyncResult = await syncEventsFromSources({
    eventSources: sourceSnapshot.eventSources,
    rssFallbackStateBySourceUrl
  });
  const spotSyncResult = await syncSpotsFromSources({
    spotSources: sourceSnapshot.spotSources
  });
  const staticPlaces = await ensureStaticPlacesCoordinates(await loadStaticPlaces());
  const fallbackPlaces = mergeStaticRegionPlaces(
    spotSyncResult.places.length > 0 ? spotSyncResult.places : staticPlaces,
    staticPlaces
  );
  const placeRecommendations = await loadPlaceRecommendationsFromConvex();
  const mergedPlaces = mergePlaceRecommendationsIntoPlaces(fallbackPlaces, placeRecommendations, {
    enabled: tripConfig.showSharedPlaceRecommendations
  });
  const allErrors = [...eventSyncResult.errors, ...spotSyncResult.errors];

  const payload = {
    meta: {
      syncedAt: nowIso,
      calendars: eventSyncResult.sourceUrls,
      eventCount: eventSyncResult.events.length,
      spotCount: mergedPlaces.length,
      ingestionErrors: allErrors,
      rssSeenBySourceUrl: eventSyncResult.rssStateBySourceUrl
    },
    events: eventSyncResult.events,
    places: mergedPlaces
  };

  await writeTextFileBestEffort(EVENTS_CACHE_FILE, JSON.stringify(payload, null, 2), {
    ensureDataDir: true,
    label: 'events cache'
  });
  await Promise.allSettled([
    saveEventsToConvex(payload),
    saveSpotsToConvex({
      spots: fallbackPlaces,
      syncedAt: nowIso,
      sourceUrls: spotSyncResult.sourceUrls
    }),
    saveSourceSyncStatus(
      sourceSnapshot.eventSources,
      eventSyncResult.errors,
      nowIso,
      eventSyncResult.rssStateBySourceUrl
    ),
    saveSourceSyncStatus(sourceSnapshot.spotSources, spotSyncResult.errors, nowIso, {}),
    saveRssSeenBySourceUrlToEventsCache(eventSyncResult.rssStateBySourceUrl)
  ]);

  return payload;
}

export async function syncSingleSource(sourceId) {
  const sourcesPayload = await loadSourcesPayload();
  const allSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
  const source = allSources.find((s) => s.id === sourceId);

  if (!source) {
    throw new Error('Source not found.');
  }

  const nowIso = new Date().toISOString();

  if (source.sourceType === 'event') {
    const rssFallbackStateBySourceUrl = await loadRssSeenBySourceUrlFromEventsCache();
    const result = await syncEventsFromSources({
      eventSources: [source],
      rssFallbackStateBySourceUrl
    });
    await Promise.allSettled([
      saveSourceSyncStatus([source], result.errors, nowIso, result.rssStateBySourceUrl),
      saveRssSeenBySourceUrlToEventsCache(result.rssStateBySourceUrl)
    ]);
    return { syncedAt: nowIso, events: result.events.length, errors: result.errors };
  }

  const result = await syncSpotsFromSources({
    spotSources: [source]
  });
  await saveSourceSyncStatus([source], result.errors, nowIso, {});
  return { syncedAt: nowIso, spots: result.places.length, errors: result.errors };
}

export async function backfillConvexCoordinates({ dryRun = false, client: providedClient = null } = {}) {
  const client = providedClient || createAdminConvexClient();

  if (!client) {
    throw new Error('CONVEX_URL and CONVEX_ADMIN_KEY are required to backfill stored coordinates.');
  }

  const payload = await client.query('adminCleanup:listCoordinateBackfillRows', {});
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const spots = Array.isArray(payload?.spots) ? payload.spots : [];
  const placeRecommendations = Array.isArray(payload?.placeRecommendations) ? payload.placeRecommendations : [];
  const coordinateRows = [
    ...events.map((row) => wrapCoordinateRow('event', row)),
    ...spots.map((row) => wrapCoordinateRow('spot', row)),
    ...placeRecommendations.map((row) => wrapCoordinateRow('recommendation', row))
  ];
  const {
    rows: hydratedCoordinateRows,
    stats
  } = await enrichLocationRowsWithCoordinates(coordinateRows, {
    getMapLink: getWrappedCoordinateMapLink,
    getFallbackText: getWrappedCoordinateFallbackText,
    applyCoordinates: applyWrappedCoordinates,
    convexClient: client
  });

  const hydratedEvents = unwrapCoordinateRows(hydratedCoordinateRows, 'event');
  const hydratedSpots = unwrapCoordinateRows(hydratedCoordinateRows, 'spot');
  const hydratedRecommendations = unwrapCoordinateRows(hydratedCoordinateRows, 'recommendation');
  const eventUpdates = getChangedRows(events, hydratedEvents).map((row) => ({
    eventUrl: cleanText(row?.eventUrl),
    lat: row.lat,
    lng: row.lng
  }));
  const spotUpdates = getChangedRows(spots, hydratedSpots).map((row) => ({
    id: cleanText(row?.id),
    lat: row.lat,
    lng: row.lng
  }));
  const recommendationUpdates = getChangedRows(placeRecommendations, hydratedRecommendations).map((row) => ({
    placeKey: cleanText(row?.placeKey),
    friendName: cleanText(row?.friendName),
    lat: row.lat,
    lng: row.lng
  }));
  const writeSummary = await client.mutation('adminCleanup:applyCoordinateBackfill', {
    dryRun: Boolean(dryRun),
    events: eventUpdates,
    spots: spotUpdates,
    placeRecommendations: recommendationUpdates
  });

  return {
    dryRun: Boolean(dryRun),
    scanned: {
      events: events.length,
      spots: spots.length,
      placeRecommendations: placeRecommendations.length
    },
    updated: {
      events: eventUpdates.length,
      spots: spotUpdates.length,
      placeRecommendations: recommendationUpdates.length
    },
    unresolved: stats.unresolved,
    localCacheHits: stats.localCacheHits,
    convexCacheHits: stats.convexCacheHits,
    googleLookups: stats.googleLookups,
    googleResolved: stats.googleResolved,
    writeSummary
  };
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
  const scopedClient = getScopedConvexClient();
  if (scopedClient) {
    return scopedClient;
  }

  const convexUrl = getConvexUrl();

  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl);
}

function createAdminConvexClient() {
  const convexUrl = getConvexUrl();
  const adminKey = cleanText(process.env.CONVEX_ADMIN_KEY);

  if (!convexUrl || !adminKey) {
    return null;
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAdminAuth(adminKey);
  return client;
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

  const sanitizedEvents = Array.isArray(payload?.events)
    ? payload.events.map((event) => sanitizeEventForConvex(event))
    : [];

  try {
    await client.mutation('events:upsertEvents', {
      events: sanitizedEvents,
      syncedAt: payload.meta.syncedAt,
      calendars: payload.meta.calendars,
      missedSyncThreshold: MISSED_SYNC_THRESHOLD
    });
  } catch (error) {
    console.error('Convex write failed; local cache is still updated.', error);
  }
}

async function loadSourcesFromConvex() {
  const client = createConvexClient();

  if (!client) {
    return null;
  }

  try {
    const rows = await client.query('sources:listSources', {
    });
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

async function loadPlaceRecommendationsFromConvex() {
  const client = createConvexClient();

  if (!client) {
    return [];
  }

  try {
    const rows = await client.query('placeRecommendations:listPlaceRecommendations', {});
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error('Convex place recommendation read failed; continuing without friend recommendations.', error);
    return [];
  }
}

async function saveSpotsToConvex({ spots, syncedAt, sourceUrls }) {
  const client = createConvexClient();

  if (!client) {
    return;
  }

  const sanitizedSpots = Array.isArray(spots)
    ? spots.map((spot) => sanitizeSpotForConvex(spot))
    : [];

  try {
    await client.mutation('spots:upsertSpots', {
      spots: sanitizedSpots,
      syncedAt,
      sourceUrls,
      missedSyncThreshold: MISSED_SYNC_THRESHOLD
    });
  } catch (error) {
    console.error('Convex spots write failed; local cache is still updated.', error);
  }
}

async function savePlaceRecommendationCoordinatesToConvex(recommendationsInput) {
  const client = createConvexClient();

  if (!client) {
    return;
  }

  const recommendations = Array.isArray(recommendationsInput)
    ? recommendationsInput
        .map((row) => ({
          placeKey: cleanText(row?.placeKey),
          friendName: cleanText(row?.friendName),
          lat: toCoordinateNumber(row?.lat),
          lng: toCoordinateNumber(row?.lng)
        }))
        .filter((row) => row.placeKey && row.friendName && isFiniteCoordinate(row.lat) && isFiniteCoordinate(row.lng))
    : [];

  if (recommendations.length === 0) {
    return;
  }

  try {
    await client.mutation('placeRecommendations:updateCoordinates', {
      recommendations
    });
  } catch (error) {
    console.error('Convex recommendation coordinate write failed; continuing without writeback.', error);
  }
}

function sanitizeSpotForConvex(spot) {
  if (!spot || typeof spot !== 'object') {
    return spot;
  }

  return sanitizeObjectForConvex(spot, CONVEX_SPOT_FIELDS);
}

function sanitizeEventForConvex(event) {
  if (!event || typeof event !== 'object') {
    return event;
  }

  return sanitizeObjectForConvex(event, CONVEX_EVENT_FIELDS);
}

function sanitizeObjectForConvex(row, allowedFields) {
  const sanitizedRow = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(row, field) && row[field] !== undefined) {
      sanitizedRow[field] = row[field];
    }
  }

  return sanitizedRow;
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildComparablePlaceKey(placeLike) {
  const name = normalizeComparableText(placeLike?.name || placeLike?.placeName);
  const location = normalizeComparableText(placeLike?.location || placeLike?.locationText);
  const mapLink = normalizeComparableUrl(placeLike?.mapLink);

  if (name && location) {
    return `${name}|${location}`;
  }
  if (name) {
    return name;
  }
  if (mapLink) {
    return `map:${mapLink}`;
  }
  return '';
}

function buildPlaceRecommendationSummary(recommendationRows) {
  const recommendations = [];
  const seenFriends = new Set();
  const recommendedBy = [];

  for (const row of Array.isArray(recommendationRows) ? recommendationRows : []) {
    const friendName = cleanText(row?.friendName);
    const note = cleanText(row?.note);
    recommendations.push({
      friendName,
      friendUrl: cleanText(row?.friendUrl),
      note,
      details: cleanText(row?.details),
      sourceUrl: cleanText(row?.sourceUrl)
    });
    if (friendName && !seenFriends.has(friendName)) {
      seenFriends.add(friendName);
      recommendedBy.push(friendName);
    }
  }

  return {
    isRecommended: recommendedBy.length > 0,
    recommendedBy,
    recommendations
  };
}

function buildSyntheticPlaceFromRecommendation(recommendationRows) {
  const rows = Array.isArray(recommendationRows) ? recommendationRows : [];
  const first = rows[0];
  if (!first) {
    return null;
  }

  const summary = buildPlaceRecommendationSummary(rows);
  const placeKey = cleanText(first.placeKey) || buildComparablePlaceKey(first);
  const friendSlug = cleanText(first.friendName).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return normalizePlaceCoordinates({
    id: `friend-${friendSlug || 'recommendation'}-${placeKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}`,
    name: cleanText(first.placeName) || cleanText(first.name),
    tag: normalizeSpotTag(first.tag, `${first.placeName || ''} ${first.note || ''} ${first.details || ''}`),
    location: cleanText(first.location),
    mapLink: cleanText(first.mapLink),
    cornerLink: cleanText(first.cornerLink),
    curatorComment: '',
    description: cleanText(first.details) || cleanText(first.note) || `Recommended by ${summary.recommendedBy.join(', ')}`,
    details: cleanText(first.details),
    sourceType: 'friend_recommendation',
    lat: typeof first.lat === 'number' ? first.lat : undefined,
    lng: typeof first.lng === 'number' ? first.lng : undefined,
    ...summary
  });
}

export function mergePlaceRecommendationsIntoPlaces(placesInput, recommendationRowsInput, options = {}) {
  const places = Array.isArray(placesInput) ? placesInput.map((place) => ({ ...place })) : [];
  if (options.enabled === false) {
    return places
      .filter((place) => place?.sourceType !== 'friend_recommendation')
      .map((place) => {
        const nextPlace = { ...place };
        delete nextPlace.isRecommended;
        delete nextPlace.recommendedBy;
        delete nextPlace.recommendations;
        return nextPlace;
      });
  }
  const recommendationRows = Array.isArray(recommendationRowsInput) ? recommendationRowsInput : [];
  const recommendationsByKey = new Map();
  const existingKeys = new Map();

  for (const place of places) {
    const key = buildComparablePlaceKey(place);
    if (key && !existingKeys.has(key)) {
      existingKeys.set(key, place);
    }
  }

  for (const row of recommendationRows) {
    const key = cleanText(row?.placeKey) || buildComparablePlaceKey(row);
    if (!key) {
      continue;
    }
    if (!recommendationsByKey.has(key)) {
      recommendationsByKey.set(key, []);
    }
    recommendationsByKey.get(key).push(row);
  }

  for (const [key, rows] of recommendationsByKey.entries()) {
    const summary = buildPlaceRecommendationSummary(rows);
    const existing = existingKeys.get(key);
    if (existing) {
      Object.assign(existing, summary);
      continue;
    }

    const syntheticPlace = buildSyntheticPlaceFromRecommendation(rows);
    if (syntheticPlace) {
      places.push(syntheticPlace);
      existingKeys.set(key, syntheticPlace);
    }
  }

  return places.sort((left, right) => `${left.tag}|${left.name}`.localeCompare(`${right.tag}|${right.name}`));
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

// Firecrawl/RSS disabled: keeping helper commented for reference.
// function appendMissingEventSources(sources, requiredEventSources) {
//   const nextSources = Array.isArray(sources) ? [...sources] : [];
//   const required = Array.isArray(requiredEventSources) ? requiredEventSources : [];
//
//   for (const requiredSource of required) {
//     const alreadyExists = nextSources.some(
//       (source) =>
//         source?.sourceType === 'event' &&
//         urlsEqual(source.url, requiredSource.url)
//     );
//
//     if (!alreadyExists) {
//       nextSources.push(requiredSource);
//     }
//   }
//
//   return nextSources;
// }

// Firecrawl/RSS disabled: helper currently unused.
// function urlsEqual(left, right) {
//   return normalizeComparableUrl(left) === normalizeComparableUrl(right);
// }

function normalizeComparableUrl(value) {
  const text = cleanText(value).toLowerCase();
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

function looksLikeRssFeedUrl(url) {
  const value = cleanText(url).toLowerCase();
  if (!value) {
    return false;
  }

  return value.endsWith('.xml') || value.includes('/rss') || value.includes('/feeds/');
}

function buildRssSourceStateKey(sourceUrl) {
  return normalizeComparableUrl(sourceUrl);
}

function parseRssSeenState(primaryStateJson, fallbackState) {
  const fromPrimary = parseRssSeenStateJson(primaryStateJson);
  if (Object.keys(fromPrimary).length > 0) {
    return fromPrimary;
  }

  return parseRssSeenStateObject(fallbackState);
}

function parseRssSeenStateJson(value) {
  const text = cleanText(value);
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return parseRssSeenStateObject(parsed);
  } catch {
    return {};
  }
}

function parseRssSeenStateObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const nextState = {};
  for (const [itemId, seenVersion] of Object.entries(value)) {
    const normalizedItemId = cleanText(itemId);
    const normalizedSeenVersion = cleanText(seenVersion);
    if (!normalizedItemId || !normalizedSeenVersion) {
      continue;
    }
    nextState[normalizedItemId] = normalizedSeenVersion;
  }

  return trimRssSeenState(nextState);
}

function serializeRssSeenState(value) {
  const normalized = parseRssSeenStateObject(value);
  if (Object.keys(normalized).length === 0) {
    return '';
  }
  return JSON.stringify(normalized);
}

function trimRssSeenState(rssState) {
  const normalized = rssState && typeof rssState === 'object' ? rssState : {};
  const entries = Object.entries(normalized)
    .map(([itemId, seenVersion]) => {
      const seenDate = parseOptionalDate(seenVersion);
      return {
        itemId,
        seenVersion,
        rank: seenDate ? seenDate.getTime() : 0
      };
    })
    .sort((left, right) => right.rank - left.rank)
    .slice(0, DEFAULT_RSS_STATE_MAX_ITEMS);

  return Object.fromEntries(entries.map((entry) => [entry.itemId, entry.seenVersion]));
}

function shouldSyncRssItem(item, rssState) {
  const seenVersion = cleanText(rssState?.[item.itemId]);
  if (!seenVersion) {
    return true;
  }

  const seenAt = parseOptionalDate(seenVersion);
  const itemVersionAt = item.updatedAt || item.publishedAt;

  if (!seenAt || !itemVersionAt) {
    return false;
  }

  return itemVersionAt > seenAt;
}

async function loadRssSeenBySourceUrlFromEventsCache() {
  try {
    const raw = await readFile(EVENTS_CACHE_FILE, 'utf-8');
    const payload = JSON.parse(raw);
    const rawStateBySource = payload?.meta?.rssSeenBySourceUrl;

    if (!rawStateBySource || typeof rawStateBySource !== 'object' || Array.isArray(rawStateBySource)) {
      return {};
    }

    const nextStateBySource = {};
    for (const [sourceUrl, state] of Object.entries(rawStateBySource)) {
      const sourceKey = buildRssSourceStateKey(sourceUrl);
      const normalizedState = parseRssSeenStateObject(state);
      if (sourceKey && Object.keys(normalizedState).length > 0) {
        nextStateBySource[sourceKey] = normalizedState;
      }
    }

    return nextStateBySource;
  } catch {
    return {};
  }
}

async function saveRssSeenBySourceUrlToEventsCache(rssStateBySourceUrl) {
  const normalizedBySource = {};
  for (const [sourceUrl, state] of Object.entries(rssStateBySourceUrl || {})) {
    const sourceKey = buildRssSourceStateKey(sourceUrl);
    const normalizedState = parseRssSeenStateObject(state);
    if (!sourceKey || Object.keys(normalizedState).length === 0) {
      continue;
    }
    normalizedBySource[sourceKey] = normalizedState;
  }

  if (Object.keys(normalizedBySource).length === 0) {
    return;
  }

  let payload = {
    meta: {},
    events: [],
    places: []
  };

  try {
    const raw = await readFile(EVENTS_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    payload = {
      ...payload,
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    };
  } catch {
    // keep default payload
  }

  payload.meta = {
    ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    rssSeenBySourceUrl: {
      ...(
        payload.meta &&
        typeof payload.meta.rssSeenBySourceUrl === 'object' &&
        !Array.isArray(payload.meta.rssSeenBySourceUrl)
          ? payload.meta.rssSeenBySourceUrl
          : {}
      ),
      ...normalizedBySource
    }
  };

  await writeTextFileBestEffort(EVENTS_CACHE_FILE, JSON.stringify(payload, null, 2), {
    ensureDataDir: true,
    label: 'events cache'
  });
}

async function getSourceSnapshotForSync() {
  const convexSources = appendMissingRequiredDefaultSources(await loadSourcesFromConvex());
  const eventSourcesFromConvex = getActiveSourcesByType(convexSources, 'event');
  const spotSourcesFromConvex = getActiveSourcesByType(convexSources, 'spot');
  const eventSources = eventSourcesFromConvex;
  // Firecrawl/RSS disabled: do not force Beehiiv as a required sync source.
  // const eventSourcesWithRequired = appendMissingEventSources(
  //   eventSources,
  //   [makeFallbackSource('event', DEFAULT_BEEHIIV_RSS_URL)]
  // );
  const spotSources = spotSourcesFromConvex;

  return {
    eventSources,
    spotSources
  };
}

async function syncEventsFromSources({ eventSources, rssFallbackStateBySourceUrl = {} }) {
  const errors = [];
  const events = [];
  const rssStateBySourceUrl = {};

  for (const source of eventSources) {
    const sourceValidation = await validateIngestionSourceUrlForFetch(source?.url);
    if (!sourceValidation.ok) {
      errors.push(createIngestionError({
        sourceType: 'event',
        sourceId: source?.id,
        sourceUrl: source?.url,
        stage: 'source_validation',
        message: sourceValidation.error
      }));
      continue;
    }

    try {
      if (looksLikeRssFeedUrl(source.url)) {
        const sourceUrlKey = buildRssSourceStateKey(source.url);
        const fallbackRssState = rssFallbackStateBySourceUrl?.[sourceUrlKey];
        const sourceRssState = parseRssSeenState(source?.rssStateJson, fallbackRssState);
        rssStateBySourceUrl[sourceUrlKey] = sourceRssState;
        const rssResult = await syncEventsFromRssSource({
          source,
          rssState: sourceRssState
        });
        events.push(...rssResult.events);
        errors.push(...rssResult.errors);
        rssStateBySourceUrl[sourceUrlKey] = rssResult.rssState;
        continue;
      }

      const parsed = await ical.async.fromURL(source.url);

      for (const [, entry] of Object.entries(parsed)) {
        if (entry.type !== 'VEVENT') continue;

        const name = cleanText(entry.summary || '');
        if (!name) continue;

        const startDate = entry.start ? new Date(entry.start) : null;
        const startDateISO = startDate ? startDate.toISOString().slice(0, 10) : '';
        const startDateTimeText = startDate
          ? startDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Los_Angeles'
            })
          : '';

        const uid = cleanText(entry.uid || '');
        const rawLocation = cleanText(entry.location || '');
        const locationIsUrl = rawLocation.startsWith('https://') || rawLocation.startsWith('http://');
        const eventUrl = canonicalizeEventUrl(cleanText(entry.url || '') || (locationIsUrl ? rawLocation : ''));
        const locationText = locationIsUrl ? '' : rawLocation;
        const description = cleanText(entry.description || '').slice(0, 500);
        const geo = entry.geo || {};
        const lat = toCoordinateNumber(geo.lat);
        const lng = toCoordinateNumber(geo.lon || geo.lng);

        events.push({
          id: uid || eventUrl || `ical-${name}`,
          name,
          description,
          eventUrl,
          startDateTimeText,
          startDateISO,
          locationText,
          address: '',
          googleMapsUrl: '',
          ...(isFiniteCoordinate(lat) && isFiniteCoordinate(lng) ? { lat, lng } : {}),
          sourceId: source?.id || '',
          sourceUrl: source?.url || '',
          confidence: 1
        });
      }
    } catch (error) {
      errors.push(createIngestionError({
        sourceType: 'event',
        sourceId: source.id,
        sourceUrl: source.url,
        stage: looksLikeRssFeedUrl(source.url) ? 'rss' : 'ical',
        message: error instanceof Error ? error.message : 'iCal fetch failed.'
      }));
    }
  }

  const deduped = dedupeAndSortEvents(events);
  const withCoordinates = await enrichEventsWithCoordinates(deduped);

  return {
    events: withCoordinates,
    sourceUrls: eventSources.map((source) => source.url),
    errors,
    rssStateBySourceUrl
  };
}

async function syncSpotsFromSources({ spotSources }) {
  return {
    places: [],
    sourceUrls: spotSources.map((source) => source.url),
    errors: []
  };
}

async function syncEventsFromRssSource({ source, rssState = {} }) {
  const errors = [];
  const nextRssState = { ...rssState };
  const sourceValidation = await validateIngestionSourceUrlForFetch(source?.url);
  if (!sourceValidation.ok) {
    errors.push(createIngestionError({
      sourceType: 'event',
      sourceId: source?.id,
      sourceUrl: source?.url,
      stage: 'source_validation',
      message: sourceValidation.error
    }));
    return {
      events: [],
      errors,
      rssState: trimRssSeenState(nextRssState)
    };
  }

  const firecrawlEnabled = cleanText(process.env.ENABLE_FIRECRAWL).toLowerCase() === 'true';

  // Firecrawl/RSS disabled by default.
  // Set ENABLE_FIRECRAWL=true to re-enable this pipeline.
  if (!firecrawlEnabled) {
    return {
      events: [],
      errors,
      rssState: trimRssSeenState(nextRssState)
    };
  }

  const firecrawlApiKey = cleanText(process.env.FIRECRAWL_API_KEY);

  if (!firecrawlApiKey) {
    errors.push(createIngestionError({
      sourceType: 'event',
      sourceId: source.id,
      sourceUrl: source.url,
      stage: 'firecrawl',
      message: 'Missing FIRECRAWL_API_KEY for RSS event extraction.'
    }));
    return { events: [], errors, rssState: nextRssState };
  }

  const response = await fetch(source.url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`RSS fetch failed (${response.status}).`);
  }

  const xmlText = await response.text();
  const feedItems = parseRssItems(xmlText);
  const initialItems = Math.max(1, Number(process.env.RSS_INITIAL_ITEMS) || DEFAULT_RSS_INITIAL_ITEMS);
  const maxItemsPerSync = Math.max(
    1,
    Number(process.env.RSS_MAX_ITEMS_PER_SYNC) || DEFAULT_RSS_MAX_ITEMS_PER_SYNC
  );

  const candidateItems = selectRssItemsForSync({
    feedItems,
    rssState: nextRssState,
    initialItems,
    maxItemsPerSync
  });

  const extractedEvents = [];

  for (const item of candidateItems) {
    try {
      const postValidation = await validateIngestionSourceUrlForFetch(item.link);
      if (!postValidation.ok) {
        errors.push(createIngestionError({
          sourceType: 'event',
          sourceId: source.id,
          sourceUrl: source.url,
          eventUrl: item.link,
          stage: 'source_validation',
          message: postValidation.error
        }));
        continue;
      }

      const rawEvents = await extractEventsFromNewsletterPost(postValidation.url, firecrawlApiKey);
      for (const rawEvent of rawEvents) {
        const normalized = normalizeRssExtractedEvent(rawEvent, {
          source,
          item
        });
        if (normalized) {
          extractedEvents.push(normalized);
        }
      }
      nextRssState[item.itemId] = item.versionIso || '__seen__';
    } catch (error) {
      errors.push(createIngestionError({
        sourceType: 'event',
        sourceId: source.id,
        sourceUrl: source.url,
        eventUrl: item.link,
        stage: 'firecrawl',
        message: error instanceof Error ? error.message : 'Firecrawl RSS extraction failed.'
      }));
    }
  }

  return {
    events: dedupeAndSortEvents(extractedEvents),
    errors,
    rssState: trimRssSeenState(nextRssState)
  };
}

function selectRssItemsForSync({ feedItems, rssState, initialItems, maxItemsPerSync }) {
  if (!Array.isArray(feedItems) || feedItems.length === 0) {
    return [];
  }

  const seenState = rssState && typeof rssState === 'object' ? rssState : {};
  const hasSeenState = Object.keys(seenState).length > 0;
  const sorted = [...feedItems].sort((left, right) => left.sortAt - right.sortAt);
  const newItems = hasSeenState
    ? sorted.filter((item) => shouldSyncRssItem(item, seenState))
    : sorted.slice(-initialItems);

  if (newItems.length === 0) {
    return [];
  }

  return newItems.slice(-maxItemsPerSync);
}

function parseRssItems(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const title = decodeXmlText(extractXmlTag(itemXml, 'title'));
    const link = decodeXmlText(extractXmlTag(itemXml, 'link'));
    const guid = decodeXmlText(extractXmlTag(itemXml, 'guid'));
    const publishedText =
      decodeXmlText(extractXmlTag(itemXml, 'atom:published')) ||
      decodeXmlText(extractXmlTag(itemXml, 'pubDate'));
    const updatedText =
      decodeXmlText(extractXmlTag(itemXml, 'atom:updated')) ||
      publishedText;
    const publishedAt = parseOptionalDate(publishedText);
    const updatedAt = parseOptionalDate(updatedText) || publishedAt;
    const itemId = cleanText(guid || link);

    if (!isHttpUrl(link) || !itemId) {
      continue;
    }

    items.push({
      title,
      link,
      itemId,
      guid: guid || link,
      publishedAt: publishedAt || new Date(0),
      updatedAt: updatedAt || new Date(0),
      versionIso: (updatedAt || publishedAt || new Date(0)).toISOString(),
      sortAt: updatedAt || publishedAt || new Date(0)
    });
  }

  return items.sort((left, right) => right.sortAt - left.sortAt);
}

function extractXmlTag(xmlText, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlText.match(regex);
  if (!match?.[1]) {
    return '';
  }

  return stripCdata(match[1]);
}

function stripCdata(value) {
  const text = cleanText(value);
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return cdata?.[1] || text;
}

function decodeXmlText(value) {
  return cleanText(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function parseOptionalDate(value) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function extractEventsFromNewsletterPost(postUrl, firecrawlApiKey) {
  const payload = {
    urls: [postUrl],
    prompt: [
      'Extract upcoming event listings from this newsletter post.',
      'Return one item per event with fields:',
      'name, eventUrl, startDateISO (YYYY-MM-DD when available), startDateTimeText,',
      'locationText, address, description, googleMapsUrl.',
      'Only include actual event listings. Exclude ads, sponsors, subscribe links, and social links.'
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              eventUrl: { type: 'string' },
              startDateISO: { type: 'string' },
              startDateTimeText: { type: 'string' },
              locationText: { type: 'string' },
              address: { type: 'string' },
              description: { type: 'string' },
              googleMapsUrl: { type: 'string' }
            }
          }
        }
      }
    },
    allowExternalLinks: false,
    includeSubdomains: false,
    enableWebSearch: false
  };

  const extractResponse = await callFirecrawl('/v1/extract', payload, firecrawlApiKey);
  return Array.isArray(extractResponse?.data?.events) ? extractResponse.data.events : [];
}

async function callFirecrawl(endpoint, payload, apiKey) {
  const response = await fetch(`${FIRECRAWL_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
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
    return waitForFirecrawlExtract(jsonPayload.id, apiKey);
  }

  return jsonPayload;
}

async function waitForFirecrawlExtract(jobId, apiKey) {
  const maxAttempts = 40;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${FIRECRAWL_BASE_URL}/v1/extract/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      cache: 'no-store'
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

function normalizeRssExtractedEvent(rawEvent, { source, item }) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  const eventUrl = canonicalizeEventUrl(cleanText(rawEvent.eventUrl || rawEvent.url));
  const name = cleanText(rawEvent.name);
  if (!name || !isHttpUrl(eventUrl)) {
    return null;
  }

  const explicitDate = normalizeStartDateISO(cleanText(rawEvent.startDateISO));
  const startDateTimeText = cleanText(rawEvent.startDateTimeText);
  const startDateISO = explicitDate || inferDateISO(startDateTimeText);
  const googleMapsUrl = cleanText(rawEvent.googleMapsUrl);
  const mapCoordinates = parseLatLngFromMapUrl(googleMapsUrl);

  return {
    id: buildEventIdFromUrl(eventUrl),
    name,
    description: cleanText(rawEvent.description || item.title),
    eventUrl,
    startDateTimeText,
    startDateISO,
    locationText: cleanText(rawEvent.locationText),
    address: cleanText(rawEvent.address),
    googleMapsUrl,
    ...(mapCoordinates || {}),
    sourceId: source?.id || '',
    sourceUrl: source?.url || '',
    confidence: 1
  };
}

function buildEventIdFromUrl(eventUrl) {
  const text = cleanText(eventUrl)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return text ? `evt-${text}` : `evt-${Date.now()}`;
}

function createCoordinateStats() {
  return {
    totalRows: 0,
    alreadyResolved: 0,
    mapLinkResolved: 0,
    localCacheHits: 0,
    convexCacheHits: 0,
    googleLookups: 0,
    googleResolved: 0,
    unresolved: 0,
    updatedRows: 0
  };
}

function mergeCoordinateStats(...statsInput) {
  const merged = createCoordinateStats();
  for (const stats of statsInput) {
    if (!stats || typeof stats !== 'object') {
      continue;
    }
    for (const key of Object.keys(merged)) {
      merged[key] += Number(stats[key]) || 0;
    }
  }
  return merged;
}

function applyCoordinatesToRow(row, coordinates) {
  return {
    ...(row || {}),
    lat: coordinates.lat,
    lng: coordinates.lng
  };
}

function hasCoordinateChange(left, right) {
  return toCoordinateNumber(left?.lat) !== toCoordinateNumber(right?.lat) ||
    toCoordinateNumber(left?.lng) !== toCoordinateNumber(right?.lng);
}

function getChangedRows(previousRows, nextRows) {
  if (!Array.isArray(previousRows) || !Array.isArray(nextRows) || previousRows.length !== nextRows.length) {
    return Array.isArray(nextRows) ? nextRows : [];
  }

  return nextRows.filter((row, index) => hasCoordinateChange(previousRows[index], row));
}

async function resolveAddressCoordinatesBatch(addressTexts, { convexClient = null } = {}) {
  const coordinatesByAddressKey = new Map();
  const stats = createCoordinateStats();
  const addressEntriesByKey = new Map();

  for (const addressText of Array.isArray(addressTexts) ? addressTexts : []) {
    const cleanedAddress = cleanText(addressText);
    const addressKey = normalizeAddressKey(cleanedAddress);
    if (!addressKey || addressEntriesByKey.has(addressKey)) {
      continue;
    }
    addressEntriesByKey.set(addressKey, {
      addressKey,
      addressText: cleanedAddress
    });
  }

  if (addressEntriesByKey.size === 0) {
    return {
      coordinatesByAddressKey,
      stats
    };
  }

  const localCache = await loadGeocodeCacheMap();
  const missingAfterLocalCache = [];

  for (const entry of addressEntriesByKey.values()) {
    const localCached = localCache.get(entry.addressKey);
    if (localCached) {
      coordinatesByAddressKey.set(entry.addressKey, localCached);
      stats.localCacheHits += 1;
      continue;
    }
    missingAfterLocalCache.push(entry);
  }

  let shouldPersistLocalCache = false;
  const convexCachedMap = await loadGeocodesFromConvexBatch(
    missingAfterLocalCache.map((entry) => entry.addressKey),
    { client: convexClient }
  );
  const missingAfterConvexCache = [];

  for (const entry of missingAfterLocalCache) {
    const convexCached = convexCachedMap.get(entry.addressKey);
    if (convexCached) {
      coordinatesByAddressKey.set(entry.addressKey, convexCached);
      localCache.set(entry.addressKey, convexCached);
      stats.convexCacheHits += 1;
      shouldPersistLocalCache = true;
      continue;
    }
    missingAfterConvexCache.push(entry);
  }

  if (shouldPersistLocalCache) {
    await persistGeocodeCacheMap();
  }

  const geocodingKey = getGoogleGeocodingKey();
  if (!geocodingKey || missingAfterConvexCache.length === 0) {
    stats.unresolved += missingAfterConvexCache.length;
    return {
      coordinatesByAddressKey,
      stats
    };
  }

  stats.googleLookups += missingAfterConvexCache.length;
  const geocodedEntries = await mapAsyncWithConcurrency(
    missingAfterConvexCache,
    GEOCODE_BATCH_CONCURRENCY,
    async (entry) => ({
      ...entry,
      coordinates: await geocodeAddressViaGoogle(entry.addressText, geocodingKey)
    })
  );

  const newConvexEntries = [];
  let localCacheUpdatedFromGoogle = false;

  for (const entry of geocodedEntries) {
    if (!entry.coordinates) {
      stats.unresolved += 1;
      continue;
    }

    coordinatesByAddressKey.set(entry.addressKey, entry.coordinates);
    localCache.set(entry.addressKey, entry.coordinates);
    newConvexEntries.push({
      addressKey: entry.addressKey,
      addressText: entry.addressText,
      lat: entry.coordinates.lat,
      lng: entry.coordinates.lng,
      updatedAt: new Date().toISOString()
    });
    stats.googleResolved += 1;
    localCacheUpdatedFromGoogle = true;
  }

  await Promise.allSettled([
    localCacheUpdatedFromGoogle ? persistGeocodeCacheMap() : Promise.resolve(),
    newConvexEntries.length > 0 ? saveGeocodesToConvexBatch(newConvexEntries, { client: convexClient }) : Promise.resolve()
  ]);

  return {
    coordinatesByAddressKey,
    stats
  };
}

async function enrichLocationRowsWithCoordinates(
  rows,
  {
    getLat = (row) => row?.lat,
    getLng = (row) => row?.lng,
    getMapLink = () => '',
    getFallbackText = () => '',
    applyCoordinates = applyCoordinatesToRow,
    convexClient = null
  } = {}
) {
  const stats = createCoordinateStats();
  const nextRows = new Array(Array.isArray(rows) ? rows.length : 0);
  const pendingByAddressIndex = [];

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    stats.totalRows += 1;
    const lat = toCoordinateNumber(getLat(row));
    const lng = toCoordinateNumber(getLng(row));

    if (isFiniteCoordinate(lat) && isFiniteCoordinate(lng)) {
      nextRows[index] = applyCoordinates(row, { lat, lng });
      stats.alreadyResolved += 1;
      continue;
    }

    const fromMapUrl = parseLatLngFromMapUrl(getMapLink(row));
    if (fromMapUrl) {
      nextRows[index] = applyCoordinates(row, fromMapUrl);
      stats.mapLinkResolved += 1;
      stats.updatedRows += 1;
      continue;
    }

    const fallbackText = cleanText(getFallbackText(row));
    if (!fallbackText) {
      nextRows[index] = row;
      stats.unresolved += 1;
      continue;
    }

    pendingByAddressIndex.push({
      index,
      row,
      fallbackText,
      addressKey: normalizeAddressKey(fallbackText)
    });
  }

  const { coordinatesByAddressKey, stats: lookupStats } = await resolveAddressCoordinatesBatch(
    pendingByAddressIndex.map((entry) => entry.fallbackText),
    { convexClient }
  );

  for (const entry of pendingByAddressIndex) {
    const coordinates = coordinatesByAddressKey.get(entry.addressKey);
    if (!coordinates) {
      nextRows[entry.index] = entry.row;
      continue;
    }
    nextRows[entry.index] = applyCoordinates(entry.row, coordinates);
    stats.updatedRows += 1;
  }

  return {
    rows: nextRows,
    stats: mergeCoordinateStats(stats, lookupStats)
  };
}

function wrapCoordinateRow(kind, row) {
  return { kind, row };
}

function getWrappedCoordinateMapLink(item) {
  if (item?.kind === 'event') {
    return item?.row?.googleMapsUrl || '';
  }
  return item?.row?.mapLink || '';
}

function getWrappedCoordinateFallbackText(item) {
  if (item?.kind === 'event') {
    return item?.row?.address || item?.row?.locationText || '';
  }
  if (item?.kind === 'recommendation') {
    return item?.row?.location || item?.row?.placeName || '';
  }
  return item?.row?.location || item?.row?.name || '';
}

function applyWrappedCoordinates(item, coordinates) {
  if (item?.kind === 'event') {
    return wrapCoordinateRow(item.kind, {
      ...(item.row || {}),
      lat: coordinates.lat,
      lng: coordinates.lng
    });
  }

  if (item?.kind === 'recommendation') {
    return wrapCoordinateRow(item.kind, {
      ...(item.row || {}),
      lat: coordinates.lat,
      lng: coordinates.lng
    });
  }

  return wrapCoordinateRow(item?.kind || 'spot', normalizePlaceCoordinates({
    ...(item?.row || {}),
    lat: coordinates.lat,
    lng: coordinates.lng
  }));
}

function unwrapCoordinateRows(items, kind) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.kind === kind)
    .map((item) => item.row);
}

async function _enrichPlacesWithCoordinates(places) {
  return enrichLocationRowsWithCoordinates(
    Array.isArray(places) ? places.map(normalizePlaceCoordinates) : [],
    {
      getMapLink: (place) => place?.mapLink,
      getFallbackText: (place) => place?.location || place?.name,
      applyCoordinates: (place, coordinates) => normalizePlaceCoordinates({
        ...(place || {}),
        lat: coordinates.lat,
        lng: coordinates.lng
      })
    }
  );
}

function _normalizeSpots(rawPlaces, source) {
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

function _dedupeAndSortSpots(spots) {
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

function _buildSpotDedupKey(spot) {
  const cornerLink = cleanText(spot?.cornerLink);
  if (cornerLink) {
    return cornerLink.toLowerCase();
  }

  return `${cleanText(spot?.name).toLowerCase()}|${cleanText(spot?.location).toLowerCase()}`;
}

function buildSpotDedupeKey({ cornerLink, name, location }) {
  const link = cleanText(cornerLink);
  if (link) return link.toLowerCase();
  return `${cleanText(name).toLowerCase()}|${cleanText(location).toLowerCase()}`;
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
  if (/\b(sightseeing|landmark|museum|bridge|tower|trail|viewpoint|monument)\b/.test(haystack)) return 'sightseeing';
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

async function saveSourceSyncStatus(sources, errors, syncedAt, rssStateBySourceUrl = {}) {
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
    .map((source) => {
      const sourceUrlKey = buildRssSourceStateKey(source.url);
      const rssStateJson = serializeRssSeenState(rssStateBySourceUrl?.[sourceUrlKey]);
      const patch = {
        sourceId: source.id,
        lastSyncedAt: syncedAt,
        lastError: firstErrorBySource.get(source.id) || ''
      };
      if (rssStateJson) {
        patch.rssStateJson = rssStateJson;
      }
      return client.mutation('sources:updateSource', patch);
    });

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
    userId: cleanText(source.userId),
    sourceType,
    url,
    label: cleanText(source.label) || url,
    status,
    createdAt: cleanText(source.createdAt),
    updatedAt: cleanText(source.updatedAt),
    lastSyncedAt: cleanText(source.lastSyncedAt),
    lastError: cleanText(source.lastError),
    rssStateJson: cleanText(source.rssStateJson)
  };
}

async function assertValidSourceUrl(url) {
  const validation = await validateIngestionSourceUrlForFetch(url);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
}

async function ensureStaticPlacesCoordinates(places) {
  const { rows: nextPlaces } = await _enrichPlacesWithCoordinates(places);
  const changed = getChangedRows(Array.isArray(places) ? places.map(normalizePlaceCoordinates) : [], nextPlaces).length > 0;

  if (changed) {
    await writeTextFileBestEffort(STATIC_PLACES_FILE, `${JSON.stringify(nextPlaces, null, 2)}\n`, {
      ensureDataDir: true,
      label: 'static places cache'
    });
  }

  return nextPlaces;
}

async function enrichEventsWithCoordinates(events) {
  const { rows } = await enrichLocationRowsWithCoordinates(events, {
    getMapLink: (event) => event?.googleMapsUrl,
    getFallbackText: (event) => event?.address || event?.locationText,
    applyCoordinates: (event, coordinates) => ({
      ...(event || {}),
      lat: coordinates.lat,
      lng: coordinates.lng
    })
  });

  return rows;
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

function mergeStaticRegionPlaces(basePlaces, staticPlaces) {
  const merged = new Map();
  const normalizedBase = Array.isArray(basePlaces) ? basePlaces.map(normalizePlaceCoordinates) : [];
  const regionPlaces = Array.isArray(staticPlaces)
    ? staticPlaces.filter(isRegionOverlayPlace).map(normalizePlaceCoordinates)
    : [];

  for (const place of normalizedBase) {
    merged.set(buildPlaceMergeKey(place), place);
  }

  for (const regionPlace of regionPlaces) {
    const key = buildPlaceMergeKey(regionPlace);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, regionPlace);
      continue;
    }
    merged.set(key, {
      ...existing,
      ...regionPlace,
      lat: isFiniteCoordinate(regionPlace?.lat) ? regionPlace.lat : existing.lat,
      lng: isFiniteCoordinate(regionPlace?.lng) ? regionPlace.lng : existing.lng,
      boundary: Array.isArray(regionPlace?.boundary) ? regionPlace.boundary : existing.boundary
    });
  }

  return Array.from(merged.values());
}

function isRegionOverlayPlace(place) {
  const tag = cleanText(place?.tag).toLowerCase();
  return (tag === 'avoid' || tag === 'safe') && Array.isArray(place?.boundary) && place.boundary.length >= 3;
}

function buildPlaceMergeKey(place) {
  const id = cleanText(place?.id).toLowerCase();
  if (id) {
    return `id:${id}`;
  }
  return [
    cleanText(place?.name).toLowerCase(),
    cleanText(place?.location).toLowerCase(),
    cleanText(place?.tag).toLowerCase()
  ].join('|');
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

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function canonicalizeEventUrl(url) {
  const value = cleanText(url);
  if (!isHttpUrl(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const searchParams = parsed.searchParams;
    const removableParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const key of removableParams) {
      searchParams.delete(key);
    }
    parsed.hash = '';
    const queryString = searchParams.toString();
    parsed.search = queryString ? `?${queryString}` : '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

async function geocodeAddressWithCache(addressText) {
  const addressKey = normalizeAddressKey(addressText);
  if (!addressKey) {
    return null;
  }

  const { coordinatesByAddressKey } = await resolveAddressCoordinatesBatch([addressText]);
  return coordinatesByAddressKey.get(addressKey) || null;
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

  await writeTextFileBestEffort(GEOCODE_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, {
    ensureDataDir: true,
    label: 'geocode cache'
  });
}

async function loadGeocodesFromConvexBatch(addressKeys, { client: providedClient = null } = {}) {
  const client = providedClient || createConvexClient();
  const wantedKeys = Array.from(new Set((Array.isArray(addressKeys) ? addressKeys : []).map((value) => cleanText(value)).filter(Boolean)));
  const cachedByKey = new Map();

  if (!client || wantedKeys.length === 0) {
    return cachedByKey;
  }

  try {
    const rows = await client.query('geocodeCache:getByAddressKeys', { addressKeys: wantedKeys });
    for (const row of Array.isArray(rows) ? rows : []) {
      const lat = toCoordinateNumber(row?.lat);
      const lng = toCoordinateNumber(row?.lng);
      const addressKey = cleanText(row?.addressKey);
      if (!addressKey || !isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
        continue;
      }
      cachedByKey.set(addressKey, { lat, lng });
    }
  } catch {
    return new Map();
  }

  return cachedByKey;
}

async function saveGeocodesToConvexBatch(entriesInput, { client: providedClient = null } = {}) {
  const client = providedClient || createConvexClient();

  if (!client) {
    return;
  }

  const entries = Array.isArray(entriesInput)
    ? entriesInput
        .map((entry) => ({
          addressKey: cleanText(entry?.addressKey),
          addressText: cleanText(entry?.addressText),
          lat: toCoordinateNumber(entry?.lat),
          lng: toCoordinateNumber(entry?.lng),
          updatedAt: cleanText(entry?.updatedAt) || new Date().toISOString()
        }))
        .filter((entry) =>
          entry.addressKey &&
          entry.addressText &&
          isFiniteCoordinate(entry.lat) &&
          isFiniteCoordinate(entry.lng)
        )
    : [];

  if (entries.length === 0) {
    return;
  }

  try {
    await client.mutation('geocodeCache:upsertMany', { entries });
  } catch {
    // Ignore convex geocode cache write failures.
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function _normalizeEvent(rawEvent) {
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

function normalizeStartDateISO(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return '';
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function _cleanTextPreservingNewlines(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _firstMatch(text, regex) {
  const match = text.match(regex);
  if (!match) {
    return '';
  }

  return cleanText(match[1] || match[0] || '');
}

function _extractAboutDescription(markdown) {
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

function _slugToTitle(eventUrl) {
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

  await writeTextFileBestEffort(ROUTE_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, {
    ensureDataDir: true,
    label: 'route cache'
  });
}
