import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ical from 'node-ical';
import { ConvexHttpClient } from 'convex/browser';

import { createSourcePayload, loadSourcesPayload, syncEvents } from './events.ts';

const EVENTS_CACHE_FILE = path.join(process.cwd(), 'data', 'events-cache.json');
const CALENDAR_URL_1 = 'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB';
const CALENDAR_URL_2 = 'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka';
const BEEHIIV_RSS_URL = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';
const DEFAULT_CORNER_LIST_URL = 'https://www.corner.inc/list/e65af393-70dd-46d5-948a-d774f472d2ee';
const ROOM_CODE = 'shared-room';

const ORIGINAL_ICAL_FROM_URL = ical.async.fromURL;
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CONVEX_QUERY = ConvexHttpClient.prototype.query;
const ORIGINAL_CONVEX_MUTATION = ConvexHttpClient.prototype.mutation;
const ORIGINAL_ENV = {
  CONVEX_URL: process.env.CONVEX_URL,
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  GOOGLE_MAPS_GEOCODING_KEY: process.env.GOOGLE_MAPS_GEOCODING_KEY,
  GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY,
  GOOGLE_MAPS_BROWSER_KEY: process.env.GOOGLE_MAPS_BROWSER_KEY
};

let hadOriginalEventsCache = false;
let originalEventsCache = '';

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

  process.env.CONVEX_URL = '';
  process.env.NEXT_PUBLIC_CONVEX_URL = '';
  process.env.GOOGLE_MAPS_GEOCODING_KEY = '';
  process.env.GOOGLE_MAPS_SERVER_KEY = '';
  process.env.GOOGLE_MAPS_BROWSER_KEY = '';
  process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';

  ical.async.fromURL = ORIGINAL_ICAL_FROM_URL;
  globalThis.fetch = ORIGINAL_FETCH;
  ConvexHttpClient.prototype.query = ORIGINAL_CONVEX_QUERY;
  ConvexHttpClient.prototype.mutation = ORIGINAL_CONVEX_MUTATION;
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
      () => createSourcePayload({ sourceType: 'event', url: 'https://127.0.0.1/internal.ics' }, ROOM_CODE),
      /public internet/i
    );
  });

  it('creates room-scoped source records in Convex', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    let createSourceArgs = null;

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'sources:createSource') {
        createSourceArgs = args;
        return {
          _id: 'src_123',
          roomCode: args?.roomCode || '',
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
      },
      ROOM_CODE
    );

    assert.equal(createSourceArgs?.roomCode, ROOM_CODE);
    assert.equal(createSourceArgs?.sourceType, 'event');
    assert.equal(createSourceArgs?.url, 'https://example.com/my-feed.ics');
    assert.equal(source?.id, 'src_123');
    assert.equal(source?.roomCode, ROOM_CODE);
  });

  it('loads room-scoped sources and always appends required default sources as readonly', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, ROOM_CODE);
        return [{
          _id: 'src_event_only',
          roomCode: ROOM_CODE,
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

    const payload = await loadSourcesPayload(ROOM_CODE);
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

  it('uses fallback source URLs when a room has no stored source records', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    const fetchedCalendarUrls = [];

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, ROOM_CODE);
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

    const payload = await syncEvents(ROOM_CODE);

    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_1), true);
    assert.equal(fetchedCalendarUrls.includes(CALENDAR_URL_2), true);
    assert.equal(Array.isArray(payload?.events), true);
    assert.equal(payload.events.length, 2);
    assert.equal(Array.isArray(payload?.meta?.ingestionErrors), true);
    assert.equal(payload.meta.ingestionErrors.length, 0);
  });

  it('syncEvents always includes required default event feeds alongside custom room feeds', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    const fetchedCalendarUrls = [];
    const customCalendarUrl = 'https://example.com/custom-room-feed.ics';

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'sources:listSources') {
        assert.equal(args?.roomCode, ROOM_CODE);
        return [{
          _id: 'src_custom_event',
          roomCode: ROOM_CODE,
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

    await syncEvents(ROOM_CODE);

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
});
