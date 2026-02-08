import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ical from 'node-ical';

const ICAL_URLS = [
  'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB',
  'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka'
];

const REQUIRED_EVENT_KEYS = [
  'id',
  'name',
  'description',
  'eventUrl',
  'startDateTimeText',
  'startDateISO',
  'locationText'
];

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function toCoordinateNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseIcalEvent(entry, sourceUrl) {
  const name = cleanText(entry.summary || '');
  if (!name) return null;

  const startDate = entry.start ? new Date(entry.start) : null;
  const startDateISO = startDate ? startDate.toISOString().slice(0, 10) : '';
  const startDateTimeText = startDate
    ? startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

  const uid = cleanText(entry.uid || '');
  const rawLocation = cleanText(entry.location || '');
  const locationIsUrl = rawLocation.startsWith('https://') || rawLocation.startsWith('http://');
  const eventUrl = cleanText(entry.url || '') || (locationIsUrl ? rawLocation : '');
  const locationText = locationIsUrl ? '' : rawLocation;
  const description = cleanText(entry.description || '').slice(0, 500);
  const geo = entry.geo || {};
  const lat = toCoordinateNumber(geo.lat);
  const lng = toCoordinateNumber(geo.lon || geo.lng);

  return {
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
    sourceId: '',
    sourceUrl,
    confidence: 1
  };
}

describe('iCal feed fetching', () => {
  for (const url of ICAL_URLS) {
    it(`fetches and parses ${url}`, async () => {
      const parsed = await ical.async.fromURL(url);
      assert.ok(parsed, 'ical.async.fromURL should return a truthy object');
      assert.ok(typeof parsed === 'object', 'parsed result should be an object');

      const entries = Object.values(parsed);
      assert.ok(entries.length > 0, 'feed should contain at least one entry');

      const vevents = entries.filter((e) => e.type === 'VEVENT');
      assert.ok(vevents.length > 0, `feed should contain VEVENT entries, got ${entries.map((e) => e.type).join(', ')}`);
    });
  }
});

describe('iCal VEVENT parsing into event shape', () => {
  let allEvents = [];

  it('parses events from all feeds', async () => {
    for (const url of ICAL_URLS) {
      const parsed = await ical.async.fromURL(url);
      for (const entry of Object.values(parsed)) {
        if (entry.type !== 'VEVENT') continue;
        const event = parseIcalEvent(entry, url);
        if (event) allEvents.push(event);
      }
    }

    assert.ok(allEvents.length > 0, 'should parse at least one event across all feeds');
    console.log(`  Parsed ${allEvents.length} events total`);
  });

  it('every event has required keys', () => {
    assert.ok(allEvents.length > 0, 'precondition: events must be parsed first');
    for (const event of allEvents) {
      for (const key of REQUIRED_EVENT_KEYS) {
        assert.ok(key in event, `event "${event.name}" missing key "${key}"`);
      }
    }
  });

  it('every event has a non-empty name', () => {
    for (const event of allEvents) {
      assert.ok(event.name.length > 0, `event id=${event.id} has empty name`);
    }
  });

  it('every event has a non-empty id', () => {
    for (const event of allEvents) {
      assert.ok(event.id.length > 0, `event "${event.name}" has empty id`);
    }
  });

  it('every event has a valid startDateISO (YYYY-MM-DD)', () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const event of allEvents) {
      assert.ok(
        datePattern.test(event.startDateISO),
        `event "${event.name}" has invalid startDateISO: "${event.startDateISO}"`
      );
    }
  });

  it('every event has a non-empty startDateTimeText', () => {
    for (const event of allEvents) {
      assert.ok(
        event.startDateTimeText.length > 0,
        `event "${event.name}" has empty startDateTimeText`
      );
    }
  });

  it('events have string types for all text fields', () => {
    for (const event of allEvents) {
      assert.equal(typeof event.name, 'string');
      assert.equal(typeof event.description, 'string');
      assert.equal(typeof event.eventUrl, 'string');
      assert.equal(typeof event.startDateTimeText, 'string');
      assert.equal(typeof event.startDateISO, 'string');
      assert.equal(typeof event.locationText, 'string');
      assert.equal(typeof event.address, 'string');
      assert.equal(typeof event.googleMapsUrl, 'string');
    }
  });

  it('events with geo coordinates have valid lat/lng numbers', () => {
    const withGeo = allEvents.filter((e) => 'lat' in e && 'lng' in e);
    for (const event of withGeo) {
      assert.ok(isFiniteCoordinate(event.lat), `event "${event.name}" lat is not a finite number`);
      assert.ok(isFiniteCoordinate(event.lng), `event "${event.name}" lng is not a finite number`);
      assert.ok(event.lat >= -90 && event.lat <= 90, `event "${event.name}" lat out of range: ${event.lat}`);
      assert.ok(event.lng >= -180 && event.lng <= 180, `event "${event.name}" lng out of range: ${event.lng}`);
    }
    console.log(`  ${withGeo.length}/${allEvents.length} events have geo coordinates`);
  });

  it('no duplicate event ids', () => {
    const ids = allEvents.map((e) => e.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, `found ${ids.length - unique.size} duplicate ids`);
  });

  it('events are compatible with sample-events.json shape', () => {
    const sampleKeys = new Set([
      'id', 'name', 'description', 'eventUrl', 'startDateTimeText',
      'startDateISO', 'locationText', 'address', 'googleMapsUrl'
    ]);
    const first = allEvents[0];
    for (const key of sampleKeys) {
      assert.ok(key in first, `parsed event missing key "${key}" that sample-events.json uses`);
    }
  });

  it('locationText never contains a URL (URLs go to eventUrl instead)', () => {
    for (const event of allEvents) {
      assert.ok(
        !event.locationText.startsWith('https://') && !event.locationText.startsWith('http://'),
        `event "${event.name}" has URL in locationText: "${event.locationText}"`
      );
    }
  });

  it('prints a few sample events for visual inspection', () => {
    const samples = allEvents.slice(0, 3);
    for (const event of samples) {
      console.log(`  [${event.startDateISO}] ${event.name}`);
      console.log(`    URL: ${event.eventUrl}`);
      console.log(`    Location: ${event.locationText}`);
      console.log(`    Time: ${event.startDateTimeText}`);
    }
  });
});
