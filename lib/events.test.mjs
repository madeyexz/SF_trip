import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ical from 'node-ical';

import { syncEvents } from './events.ts';

const EVENTS_CACHE_FILE = path.join(process.cwd(), 'data', 'events-cache.json');
const CALENDAR_URL_1 = 'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB';
const CALENDAR_URL_2 = 'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka';
const BEEHIIV_RSS_URL = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';

const ORIGINAL_ICAL_FROM_URL = ical.async.fromURL;
const ORIGINAL_FETCH = globalThis.fetch;
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
});

afterEach(async () => {
  restoreEnv();
  ical.async.fromURL = ORIGINAL_ICAL_FROM_URL;
  globalThis.fetch = ORIGINAL_FETCH;

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
});
