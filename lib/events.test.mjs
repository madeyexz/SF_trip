import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ical from 'node-ical';
import { ConvexHttpClient } from 'convex/browser';

import {
  backfillConvexCoordinates,
  createSourcePayload,
  loadEventsPayload,
  loadSourcesPayload,
  resetEventsCachesForTesting,
  shouldLogCoordinateEnrichmentSummary,
  syncEvents
} from './events.ts';

const EVENTS_CACHE_FILE = path.join(process.cwd(), 'data', 'events-cache.json');
const GEOCODE_CACHE_FILE = path.join(process.cwd(), 'data', 'geocode-cache.json');
const STATIC_PLACES_FILE = path.join(process.cwd(), 'data', 'static-places.json');
const CALENDAR_URL_1 = 'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB';
const CALENDAR_URL_2 = 'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka';
const BEEHIIV_RSS_URL = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';
const DEFAULT_CORNER_LIST_URL = 'https://www.corner.inc/list/e65af393-70dd-46d5-948a-d774f472d2ee';
const ORIGINAL_ICAL_FROM_URL = ical.async.fromURL;
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CONVEX_QUERY = ConvexHttpClient.prototype.query;
const ORIGINAL_CONVEX_MUTATION = ConvexHttpClient.prototype.mutation;
const ORIGINAL_ENV = {
  CONVEX_URL: process.env.CONVEX_URL,
  CONVEX_ADMIN_KEY: process.env.CONVEX_ADMIN_KEY,
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  GOOGLE_MAPS_GEOCODING_KEY: process.env.GOOGLE_MAPS_GEOCODING_KEY,
  GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY,
  GOOGLE_MAPS_BROWSER_KEY: process.env.GOOGLE_MAPS_BROWSER_KEY
};

let hadOriginalEventsCache = false;
let originalEventsCache = '';
let hadOriginalGeocodeCache = false;
let originalGeocodeCache = '';
let hadOriginalStaticPlaces = false;
let originalStaticPlaces = '';

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(async () => {
  try {
    originalEventsCache = await readFile(EVENTS_CACHE_FILE, 'utf-8');
    hadOriginalEventsCache = true;
  } catch {
    originalEventsCache = '';
    hadOriginalEventsCache = false;
  }

  try {
    originalGeocodeCache = await readFile(GEOCODE_CACHE_FILE, 'utf-8');
    hadOriginalGeocodeCache = true;
  } catch {
    originalGeocodeCache = '';
    hadOriginalGeocodeCache = false;
  }

  try {
    originalStaticPlaces = await readFile(STATIC_PLACES_FILE, 'utf-8');
    hadOriginalStaticPlaces = true;
  } catch {
    originalStaticPlaces = '';
    hadOriginalStaticPlaces = false;
  }

  process.env.CONVEX_URL = '';
  process.env.NEXT_PUBLIC_CONVEX_URL = '';
  process.env.CONVEX_ADMIN_KEY = '';
  process.env.GOOGLE_MAPS_GEOCODING_KEY = '';
  process.env.GOOGLE_MAPS_SERVER_KEY = '';
  process.env.GOOGLE_MAPS_BROWSER_KEY = '';
  process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';

  ical.async.fromURL = ORIGINAL_ICAL_FROM_URL;
  globalThis.fetch = ORIGINAL_FETCH;
  ConvexHttpClient.prototype.query = ORIGINAL_CONVEX_QUERY;
  ConvexHttpClient.prototype.mutation = ORIGINAL_CONVEX_MUTATION;
  resetEventsCachesForTesting();
});

afterEach(async () => {
  restoreEnv();
  ical.async.fromURL = ORIGINAL_ICAL_FROM_URL;
  globalThis.fetch = ORIGINAL_FETCH;
  ConvexHttpClient.prototype.query = ORIGINAL_CONVEX_QUERY;
  ConvexHttpClient.prototype.mutation = ORIGINAL_CONVEX_MUTATION;

  if (hadOriginalEventsCache) {
    await writeFile(EVENTS_CACHE_FILE, originalEventsCache, 'utf-8');
  } else {
    await rm(EVENTS_CACHE_FILE, { force: true });
  }

  if (hadOriginalGeocodeCache) {
    await writeFile(GEOCODE_CACHE_FILE, originalGeocodeCache, 'utf-8');
  } else {
    await rm(GEOCODE_CACHE_FILE, { force: true });
  }

  if (hadOriginalStaticPlaces) {
    await writeFile(STATIC_PLACES_FILE, originalStaticPlaces, 'utf-8');
  } else {
    await rm(STATIC_PLACES_FILE, { force: true });
  }

  resetEventsCachesForTesting();
});

function buildEmptyRss() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>empty feed</title>',
    '</channel>',
    '</rss>'
  ].join('\n');
}

describe('syncEvents with deterministic mocked feeds', () => {
  it('rejects source creation for local/private ingestion URLs', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    ConvexHttpClient.prototype.mutation = async function mutation(functionName) {
      throw new Error(`Mutation should not be called for invalid URL (${functionName})`);
    };

    await assert.rejects(
      () => createSourcePayload({ sourceType: 'event', url: 'https://127.0.0.1/internal.ics' }),
      /public internet/i
    );
  });

  it('creates personal source records in Convex without public room codes', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    let createSourceArgs = null;

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'sources:createSource') {
        createSourceArgs = args;
        return {
          _id: 'src_123',
          userId: args?.userId || 'user-1',
          sourceType: args?.sourceType || 'event',
          url: args?.url || '',
          label: args?.label || '',
          status: 'active',
          createdAt: '2026-02-21T00:00:00.000Z',
          updatedAt: '2026-02-21T00:00:00.000Z'
        };
      }
      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    const source = await createSourcePayload(
      {
        sourceType: 'event',
        url: 'https://example.com/my-feed.ics',
        label: 'My Feed'
      }
    );

    assert.equal(createSourceArgs?.roomCode, undefined);
    assert.equal(createSourceArgs?.userId, undefined);
    assert.equal(createSourceArgs?.sourceType, 'event');
    assert.equal(createSourceArgs?.url, 'https://example.com/my-feed.ics');
    assert.equal(source?.id, 'src_123');
    assert.equal(source?.userId, 'user-1');
  });

  it('loads personal sources and always appends required default sources as readonly', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, undefined);
        return [{
          _id: 'src_event_only',
          userId: 'user-1',
          sourceType: 'event',
          url: 'https://example.com/event-feed.ics',
          label: 'Room Event Feed',
          status: 'active',
          createdAt: '2026-02-21T00:00:00.000Z',
          updatedAt: '2026-02-21T00:00:00.000Z'
        }];
      }
      throw new Error(`Unexpected Convex query in test: ${functionName}`);
    };

    const payload = await loadSourcesPayload();
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];

    assert.equal(payload?.source, 'convex');
    assert.equal(sources.some((source) => source.url === 'https://example.com/event-feed.ics'), true);
    assert.equal(sources.some((source) => source.sourceType === 'spot' && source.url === DEFAULT_CORNER_LIST_URL), true);
    assert.equal(sources.some((source) => source.sourceType === 'event' && source.url === CALENDAR_URL_1), true);
    assert.equal(sources.some((source) => source.sourceType === 'event' && source.url === CALENDAR_URL_2), true);
    assert.equal(
      sources.some((source) => source.sourceType === 'event' && source.url === CALENDAR_URL_1 && source.readonly),
      true
    );
  });

  it('merges saved custom spots into the places payload returned to the app', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, undefined);
        return [];
      }
      if (functionName === 'tripConfig:getTripConfig') {
        return {
          tripStart: '',
          tripEnd: '',
          baseLocation: 'San Francisco, CA',
          showSharedPlaceRecommendations: true
        };
      }
      if (functionName === 'spots:listSpots') {
        return [];
      }
      if (functionName === 'placeRecommendations:listPlaceRecommendations') {
        return [];
      }
      if (functionName === 'customSpots:listCustomSpots') {
        return [{
          _id: 'custom-1',
          id: 'custom-four-barrel',
          userId: 'user-1',
          sourceKey: 'google-place:place-1',
          name: 'Four Barrel Coffee',
          tag: 'cafes',
          location: '375 Valencia St, San Francisco, CA',
          mapLink: 'https://www.google.com/maps/search/?api=1&query=Four+Barrel+Coffee',
          cornerLink: '',
          curatorComment: '',
          description: 'Saved from map search',
          details: 'Google types: cafe, coffee_shop',
          lat: 37.767,
          lng: -122.421,
          createdAt: '2026-03-05T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z'
        }];
      }
      if (functionName === 'events:listEvents') {
        return [];
      }
      if (functionName === 'events:getSyncMeta') {
        return {
          syncedAt: '2026-03-05T00:00:00.000Z',
          calendars: [],
          eventCount: 0
        };
      }
      throw new Error(`Unexpected Convex query in test: ${functionName}`);
    };

    const payload = await loadEventsPayload();
    const places = Array.isArray(payload?.places) ? payload.places : [];

    assert.equal(places.some((place) => place.id === 'custom-four-barrel'), true);
    assert.equal(places.some((place) => place.name === 'Four Barrel Coffee' && place.tag === 'cafes'), true);
  });

  it('uses fallback source URLs when no stored source records exist', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    const fetchedCalendarUrls = [];

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, undefined);
        return [];
      }
      return null;
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'events:upsertEvents') {
        return { eventCount: Array.isArray(args?.events) ? args.events.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'spots:upsertSpots') {
        return { spotCount: Array.isArray(args?.spots) ? args.spots.length : 0, syncedAt: args?.syncedAt || '' };
      }
      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    ical.async.fromURL = async (url) => {
      fetchedCalendarUrls.push(url);
      if (url === CALENDAR_URL_1 || url === CALENDAR_URL_2) {
        return {
          one: {
            type: 'VEVENT',
            summary: 'Safe Event',
            uid: `safe-event-${url === CALENDAR_URL_1 ? 'one' : 'two'}`,
            start: new Date('2026-03-10T18:00:00.000Z'),
            location: '',
            geo: { lat: 37.77, lng: -122.42 },
            url: `https://luma.com/safe-event-${url === CALENDAR_URL_1 ? 'one' : 'two'}`
          }
        };
      }
      throw new Error(`Unexpected iCal URL in test: ${url}`);
    };

    const payload = await syncEvents();

    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_1), true);
    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_2), true);
    assert.equal(Array.isArray(payload?.events), true);
    assert.equal(payload.events.length, 2);
    assert.equal(Array.isArray(payload?.meta?.ingestionErrors), true);
    assert.equal(payload.meta.ingestionErrors.length, 0);
  });

  it('syncEvents always includes required default event feeds alongside custom personal feeds', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    const fetchedCalendarUrls = [];
    const customCalendarUrl = 'https://example.com/custom-room-feed.ics';

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, undefined);
        return [{
          _id: 'src_custom_event',
          userId: 'user-1',
          sourceType: 'event',
          url: customCalendarUrl,
          label: 'Custom Room Feed',
          status: 'active',
          createdAt: '2026-02-21T00:00:00.000Z',
          updatedAt: '2026-02-21T00:00:00.000Z'
        }];
      }
      return null;
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'events:upsertEvents') {
        return { eventCount: Array.isArray(args?.events) ? args.events.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'spots:upsertSpots') {
        return { spotCount: Array.isArray(args?.spots) ? args.spots.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'sources:updateSource') {
        return null;
      }
      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    ical.async.fromURL = async (url) => {
      fetchedCalendarUrls.push(url);
      return {
        one: {
          type: 'VEVENT',
          summary: `Event ${fetchedCalendarUrls.length}`,
          uid: `required-default-check-${fetchedCalendarUrls.length}`,
          start: new Date('2026-03-10T18:00:00.000Z'),
          location: '',
          geo: { lat: 37.77, lng: -122.42 },
          url: `https://luma.com/required-default-check-${fetchedCalendarUrls.length}`
        }
      };
    };

    await syncEvents();

    assert.equal(fetchedCalendarUrls.includes(customCalendarUrl), true);
    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_1), true);
    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_2), true);
  });

  it('parses iCal entries through production code path and canonicalizes URLs', async () => {
    ical.async.fromURL = async (url) => {
      if (url === CALENDAR_URL_1) {
        return {
          one: {
            type: 'VEVENT',
            summary: 'Launch Party',
            uid: 'uid-launch',
            start: new Date('2026-03-01T04:00:00.000Z'),
            location: 'https://luma.com/launch?utm_source=newsletter#top',
            description: '  big    night  '
          },
          two: {
            type: 'VEVENT',
            summary: 'Coffee Meetup',
            uid: 'uid-coffee',
            start: new Date('2026-03-02T18:30:00.000Z'),
            location: 'Mission District',
            url: 'https://luma.com/coffee/',
            description: 'Morning talks'
          },
          ignored: {
            type: 'VTODO',
            summary: 'Not an event'
          }
        };
      }

      if (url === CALENDAR_URL_2) {
        return {
          one: {
            type: 'VEVENT',
            summary: 'Warehouse Afterparty',
            uid: 'uid-afterparty',
            start: new Date('2026-03-02T06:00:00.000Z'),
            location: 'SOMA',
            url: 'https://luma.com/afterparty?utm_medium=email',
            description: 'Late set'
          }
        };
      }

      throw new Error(`Unexpected iCal URL in test: ${url}`);
    };

    globalThis.fetch = async (url) => {
      if (url === BEEHIIV_RSS_URL) {
        return new Response(buildEmptyRss(), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const payload = await syncEvents();
    const events = Array.isArray(payload?.events) ? payload.events : [];
    assert.equal(events.length, 3, 'should include only VEVENT entries from mocked calendars');
    assert.equal(Array.isArray(payload?.meta?.ingestionErrors), true);
    assert.equal(payload.meta.ingestionErrors.length, 0, 'should not return ingestion errors');

    const byName = new Map(events.map((event) => [event.name, event]));

    const launch = byName.get('Launch Party');
    assert.ok(launch, 'Launch Party should exist');
    assert.equal(launch.eventUrl, 'https://luma.com/launch');
    assert.equal(launch.locationText, '');
    assert.equal(launch.description, 'big night');
    assert.equal(typeof launch.startDateTimeText, 'string');
    assert.equal(launch.startDateISO, '2026-03-01');

    const coffee = byName.get('Coffee Meetup');
    assert.ok(coffee, 'Coffee Meetup should exist');
    assert.equal(coffee.eventUrl, 'https://luma.com/coffee');
    assert.equal(coffee.locationText, 'Mission District');
    assert.equal(coffee.startDateISO, '2026-03-02');

    const afterparty = byName.get('Warehouse Afterparty');
    assert.ok(afterparty, 'Warehouse Afterparty should exist');
    assert.equal(afterparty.eventUrl, 'https://luma.com/afterparty');
    assert.equal(afterparty.locationText, 'SOMA');
  });

  it('surfaces iCal ingestion errors deterministically when one source fails', async () => {
    ical.async.fromURL = async (url) => {
      if (url === CALENDAR_URL_1) {
        throw new Error('calendar fetch failed for test');
      }

      if (url === CALENDAR_URL_2) {
        return {
          one: {
            type: 'VEVENT',
            summary: 'Fallback Event',
            uid: 'uid-fallback',
            start: new Date('2026-03-03T20:00:00.000Z'),
            location: 'Downtown',
            url: 'https://luma.com/fallback'
          }
        };
      }

      throw new Error(`Unexpected iCal URL in test: ${url}`);
    };

    globalThis.fetch = async (url) => {
      if (url === BEEHIIV_RSS_URL) {
        return new Response(buildEmptyRss(), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const payload = await syncEvents();
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const errors = Array.isArray(payload?.meta?.ingestionErrors) ? payload.meta.ingestionErrors : [];

    assert.equal(events.length, 1, 'should still include events from healthy sources');
    assert.equal(events[0].name, 'Fallback Event');

    const icalError = errors.find((error) => error.stage === 'ical' && error.sourceUrl === CALENDAR_URL_1);
    assert.ok(icalError, 'expected an iCal-stage error for the failing source');
    assert.equal(icalError.message.includes('calendar fetch failed for test'), true);
  });

  it('does not send unsupported spot fields to Convex spot upsert mutation', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    let capturedSpotPayload = null;

    ical.async.fromURL = async (url) => {
      if (url === CALENDAR_URL_1 || url === CALENDAR_URL_2) {
        return {};
      }
      throw new Error(`Unexpected iCal URL in test: ${url}`);
    };

    ConvexHttpClient.prototype.query = async function query(functionName) {
      if (functionName === 'sources:listSources') {
        return [];
      }
      if (functionName === 'placeRecommendations:listPlaceRecommendations') {
        return [];
      }
      throw new Error(`Unexpected Convex query in test: ${functionName}`);
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'spots:upsertSpots') {
        capturedSpotPayload = args;
        return { spotCount: Array.isArray(args?.spots) ? args.spots.length : 0, syncedAt: args?.syncedAt || '' };
      }

      if (functionName === 'events:upsertEvents') {
        return { eventCount: Array.isArray(args?.events) ? args.events.length : 0, syncedAt: args?.syncedAt || '' };
      }

      if (functionName === 'sources:updateSource') {
        return { ok: true };
      }

      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    await syncEvents();

    assert.ok(capturedSpotPayload, 'spots upsert payload should be sent to Convex');
    const spots = Array.isArray(capturedSpotPayload.spots) ? capturedSpotPayload.spots : [];
    assert.ok(spots.length > 0, 'spots payload should not be empty');
    assert.equal(
      spots.every(
        (spot) =>
          !Object.prototype.hasOwnProperty.call(spot, 'boundary') &&
          !Object.prototype.hasOwnProperty.call(spot, 'crimeTypes') &&
          !Object.prototype.hasOwnProperty.call(spot, 'risk')
      ),
      true,
      'unsupported fields must be stripped before Convex spots upsert'
    );
  });

  it('hydrates convex-backed events, spots, and shared recommendations before returning /api/events payloads', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';
    await writeFile(GEOCODE_CACHE_FILE, '{}\n', 'utf-8');
    resetEventsCachesForTesting();

    const geocodeQueryArgs = [];
    let savedEventsPayload = null;
    let savedSpotsPayload = null;
    let savedRecommendationCoordinates = null;

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'tripConfig:getTripConfig') {
        return {
          tripStart: '',
          tripEnd: '',
          baseLocation: '',
          showSharedPlaceRecommendations: true
        };
      }
      if (functionName === 'sources:listSources') {
        return [];
      }
      if (functionName === 'events:listEvents') {
        return [{
          id: 'evt-1',
          name: 'Concert',
          description: '',
          eventUrl: 'https://luma.com/concert',
          startDateTimeText: '',
          startDateISO: '2026-03-10',
          locationText: 'Mission District, San Francisco, CA',
          sourceId: 'src-1',
          sourceUrl: CALENDAR_URL_1,
          confidence: 1
        }];
      }
      if (functionName === 'events:getSyncMeta') {
        return {
          syncedAt: '2026-03-05T00:00:00.000Z',
          calendars: [CALENDAR_URL_1],
          eventCount: 1
        };
      }
      if (functionName === 'spots:listSpots') {
        return [{
          id: 'spot-1',
          name: 'Cafe Zero',
          tag: 'cafes',
          location: 'Mission District, San Francisco, CA',
          mapLink: '',
          cornerLink: '',
          curatorComment: '',
          description: '',
          details: ''
        }];
      }
      if (functionName === 'spots:getSyncMeta') {
        return {
          syncedAt: '2026-03-05T00:00:00.000Z',
          calendars: [],
          eventCount: 1
        };
      }
      if (functionName === 'placeRecommendations:listPlaceRecommendations') {
        return [{
          _id: 'rec-1',
          placeKey: 'cafe-zero',
          placeName: 'Cafe Zero',
          friendName: 'Winston',
          tag: 'cafes',
          location: 'Mission District, San Francisco, CA',
          mapLink: '',
          createdAt: '2026-03-05T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z'
        }];
      }
      if (functionName === 'geocodeCache:getByAddressKeys') {
        geocodeQueryArgs.push(args);
        return [{
          addressKey: 'mission district, san francisco, ca',
          addressText: 'Mission District, San Francisco, CA',
          lat: 37.7599,
          lng: -122.4148,
          updatedAt: '2026-03-05T00:00:00.000Z'
        }];
      }
      throw new Error(`Unexpected Convex query in test: ${functionName}`);
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'events:upsertEvents') {
        savedEventsPayload = args;
        return { eventCount: Array.isArray(args?.events) ? args.events.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'spots:upsertSpots') {
        savedSpotsPayload = args;
        return { spotCount: Array.isArray(args?.spots) ? args.spots.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'placeRecommendations:updateCoordinates') {
        savedRecommendationCoordinates = args;
        return { updated: Array.isArray(args?.recommendations) ? args.recommendations.length : 0, unchanged: 0, skipped: 0 };
      }
      if (functionName === 'geocodeCache:upsertMany') {
        return { inserted: 0, updated: 0, unchanged: 0 };
      }
      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    const payload = await loadEventsPayload();

    assert.equal(geocodeQueryArgs.length, 1);
    assert.deepEqual(geocodeQueryArgs[0], {
      addressKeys: ['mission district, san francisco, ca']
    });
    assert.equal(payload.events[0].lat, 37.7599);
    assert.equal(payload.events[0].lng, -122.4148);
    assert.equal(payload.places.some((place) => place.name === 'Cafe Zero' && place.lat === 37.7599 && place.lng === -122.4148), true);
    assert.equal(Array.isArray(savedEventsPayload?.events), true);
    assert.equal(savedEventsPayload.events[0].lat, 37.7599);
    assert.equal(Array.isArray(savedSpotsPayload?.spots), true);
    assert.equal(savedSpotsPayload.spots[0].lat, 37.7599);
    assert.deepEqual(savedRecommendationCoordinates, {
      recommendations: [{
        placeKey: 'cafe-zero',
        friendName: 'Winston',
        lat: 37.7599,
        lng: -122.4148
      }]
    });
  });

  it('dedupes repeated unresolved addresses during sync before hitting Google geocoding', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';
    process.env.GOOGLE_MAPS_GEOCODING_KEY = 'test-google-key';
    await writeFile(GEOCODE_CACHE_FILE, '{}\n', 'utf-8');
    resetEventsCachesForTesting();

    let googleLookupCount = 0;

    ConvexHttpClient.prototype.query = async function query(functionName) {
      if (functionName === 'sources:listSources') {
        return [];
      }
      if (functionName === 'placeRecommendations:listPlaceRecommendations') {
        return [];
      }
      if (functionName === 'geocodeCache:getByAddressKeys') {
        return [];
      }
      return null;
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'events:upsertEvents') {
        return { eventCount: Array.isArray(args?.events) ? args.events.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'spots:upsertSpots') {
        return { spotCount: Array.isArray(args?.spots) ? args.spots.length : 0, syncedAt: args?.syncedAt || '' };
      }
      if (functionName === 'sources:updateSource') {
        return { ok: true };
      }
      if (functionName === 'geocodeCache:upsertMany') {
        return { inserted: Array.isArray(args?.entries) ? args.entries.length : 0, updated: 0, unchanged: 0 };
      }
      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    ical.async.fromURL = async (url) => {
      if (url === CALENDAR_URL_1 || url === CALENDAR_URL_2) {
        return {
          first: {
            type: 'VEVENT',
            summary: `Event ${url.endsWith('kCka') ? 'Two' : 'One'}`,
            uid: `event-${url.endsWith('kCka') ? 'two' : 'one'}`,
            start: new Date('2026-03-10T18:00:00.000Z'),
            location: 'Mission District, San Francisco, CA',
            url: `https://luma.com/${url.endsWith('kCka') ? 'two' : 'one'}`
          }
        };
      }
      throw new Error(`Unexpected iCal URL in test: ${url}`);
    };

    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://maps.googleapis.com/maps/api/geocode/json?')) {
        googleLookupCount += 1;
        return new Response(JSON.stringify({
          status: 'OK',
          results: [{
            geometry: {
              location: {
                lat: 37.7599,
                lng: -122.4148
              }
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const payload = await syncEvents();

    assert.equal(googleLookupCount, 1);
    assert.equal(payload.events.every((event) => event.lat === 37.7599 && event.lng === -122.4148), true);
  });

  it('logs coordinate enrichment summaries only once per repeated stats fingerprint', () => {
    resetEventsCachesForTesting();

    const stats = {
      totalRows: 190,
      alreadyResolved: 0,
      mapLinkResolved: 20,
      localCacheHits: 104,
      convexCacheHits: 0,
      googleLookups: 0,
      googleResolved: 0,
      unresolved: 35,
      updatedRows: 155
    };

    assert.equal(shouldLogCoordinateEnrichmentSummary(stats), true);
    assert.equal(shouldLogCoordinateEnrichmentSummary(stats), false);
    assert.equal(
      shouldLogCoordinateEnrichmentSummary({
        ...stats,
        googleResolved: 2
      }),
      true
    );
  });

  it('backfills stored Convex rows with missing coordinates through the admin path', async () => {
    process.env.GOOGLE_MAPS_GEOCODING_KEY = 'test-google-key';
    await writeFile(GEOCODE_CACHE_FILE, '{}\n', 'utf-8');
    resetEventsCachesForTesting();

    const geocodeBatchArgs = [];
    let geocodeCacheUpsertArgs = null;
    let backfillWriteArgs = null;
    let googleLookupCount = 0;

    const client = {
      async query(functionName, args) {
        if (functionName === 'adminCleanup:listCoordinateBackfillRows') {
          return {
            events: [{
              eventUrl: 'https://luma.com/concert',
              locationText: 'Mission District, San Francisco, CA'
            }],
            spots: [{
              id: 'spot-1',
              name: 'Cafe Zero',
              location: 'Mission District, San Francisco, CA',
              mapLink: ''
            }],
            placeRecommendations: [{
              placeKey: 'cafe-zero',
              placeName: 'Cafe Zero',
              friendName: 'Winston',
              location: 'Mission District, San Francisco, CA',
              mapLink: ''
            }]
          };
        }
        if (functionName === 'geocodeCache:getByAddressKeys') {
          geocodeBatchArgs.push(args);
          return [];
        }
        throw new Error(`Unexpected backfill query in test: ${functionName}`);
      },
      async mutation(functionName, args) {
        if (functionName === 'geocodeCache:upsertMany') {
          geocodeCacheUpsertArgs = args;
          return { inserted: Array.isArray(args?.entries) ? args.entries.length : 0, updated: 0, unchanged: 0 };
        }
        if (functionName === 'adminCleanup:applyCoordinateBackfill') {
          backfillWriteArgs = args;
          return {
            dryRun: Boolean(args?.dryRun),
            eventsUpdated: Array.isArray(args?.events) ? args.events.length : 0,
            spotsUpdated: Array.isArray(args?.spots) ? args.spots.length : 0,
            recommendationsUpdated: Array.isArray(args?.placeRecommendations) ? args.placeRecommendations.length : 0
          };
        }
        throw new Error(`Unexpected backfill mutation in test: ${functionName}`);
      }
    };

    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://maps.googleapis.com/maps/api/geocode/json?')) {
        googleLookupCount += 1;
        return new Response(JSON.stringify({
          status: 'OK',
          results: [{
            geometry: {
              location: {
                lat: 37.7599,
                lng: -122.4148
              }
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const summary = await backfillConvexCoordinates({ client, dryRun: false });

    assert.equal(googleLookupCount, 1);
    assert.deepEqual(geocodeBatchArgs, [{
      addressKeys: ['mission district, san francisco, ca']
    }]);
    assert.equal(Array.isArray(geocodeCacheUpsertArgs?.entries), true);
    assert.equal(geocodeCacheUpsertArgs.entries.length, 1);
    assert.deepEqual(backfillWriteArgs, {
      dryRun: false,
      events: [{
        eventUrl: 'https://luma.com/concert',
        lat: 37.7599,
        lng: -122.4148
      }],
      spots: [{
        id: 'spot-1',
        lat: 37.7599,
        lng: -122.4148
      }],
      placeRecommendations: [{
        placeKey: 'cafe-zero',
        friendName: 'Winston',
        lat: 37.7599,
        lng: -122.4148
      }]
    });
    assert.deepEqual(summary.updated, {
      events: 1,
      spots: 1,
      placeRecommendations: 1
    });
  });
});
