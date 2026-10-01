import { test } from 'node:test';
import assert from 'node:assert/strict';
import ical from 'node-ical';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { reconcileImportedRecordsForUser } from '../convex/importedRecords.ts';
import { formatEventDay, mergeSyncEvents, syncEvents, syncSingleSource, loadEventsPayload } from './events/core.ts';
import { runWithConvexClient } from './convex-client-context.ts';

const sourceUrl = 'https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB';
const otherUrl = 'https://api2.luma.com/ics/get?entity=discover&id=discplace-BDj7GNbGlsF7Cka';
const event = (id, url = sourceUrl) => ({
  id, name: id, eventUrl: `https://luma.com/${id}`, description: '',
  startDateISO: '2026-10-01', startDateTimeText: '', locationText: '',
  sourceUrl: url, sourceId: 'source-1', lat: 37.7, lng: -122.4
});

function clientWith({ events = [], source = null, rejectSave = false } = {}) {
  const writes = [];
  return {
    writes,
    async query(name) {
      if (name === 'events:listEvents') return events;
      if (name === 'sources:listSources') return source ? [source] : [];
      if (name.endsWith('listSpots') || name.endsWith('listPlaceRecommendations') || name.endsWith('getByAddressKeys')) return [];
      return null;
    },
    async mutation(name, args) {
      writes.push({ name, args });
      if (rejectSave && name === 'events:upsertEvents') throw new Error('Durable database unavailable');
      return {};
    }
  };
}

test('event days use Los Angeles time and retain all-day calendar dates', () => {
  assert.equal(formatEventDay(new Date('2026-10-02T03:00:00Z')), '2026-10-01');
  assert.equal(formatEventDay(new Date('2026-10-02T00:00:00Z'), true), '2026-10-02');
  assert.equal(formatEventDay(new Date('invalid')), '');
});

test('failed and incremental sources retain events; successful snapshots reconcile only their own events', () => {
  const saved = [event('failed'), event('success', otherUrl), event('rss', 'https://example.com/feed.xml')];
  const merged = mergeSyncEvents(saved, [event('fresh', otherUrl)], [otherUrl]);
  assert.deepEqual(merged.map((row) => row.id).sort(), ['failed', 'fresh', 'rss']);
  assert.equal(mergeSyncEvents([event('a')], [{ ...event('a'), name: 'updated' }], [])[0].name, 'updated');
  const withoutUrls = [{ ...event('a'), eventUrl: '' }, { ...event('b'), eventUrl: '' }];
  assert.equal(mergeSyncEvents([], withoutUrls).length, 2);
});

test('repeated failed feeds never enter durable reconciliation set', async () => {
  const original = ical.async.fromURL;
  const client = clientWith({ events: [event('saved')] });
  ical.async.fromURL = async (url) => {
    if (url === sourceUrl) throw new Error('Feed offline');
    return { vcalendar: { type: 'VCALENDAR', version: '2.0' } };
  };
  try {
    for (let i = 0; i < 2; i++) {
      const result = await runWithConvexClient(client, syncEvents);
      assert.ok(result.events.some((row) => row.id === 'saved'));
      assert.ok(result.meta.ingestionErrors.some((error) => error.stage === 'unsupported'));
    }
    const writes = client.writes.filter((write) => write.name === 'events:upsertEvents');
    assert.equal(writes.length, 2);
    for (const write of writes) assert.deepEqual(write.args.successfulSourceUrls, [otherUrl]);
  } finally { ical.async.fromURL = original; }
});

test('single-source sync saves fetched events without reconciling other sources', async () => {
  const original = ical.async.fromURL;
  const client = clientWith({ events: [event('other', otherUrl)],
    source: { _id: 'source-1', url: 'https://example.com/calendar.ics', sourceType: 'event', status: 'active' } });
  ical.async.fromURL = async () => ({ vcalendar: { type: 'VCALENDAR', version: '2.0' }, one: { type: 'VEVENT', summary: 'new', uid: 'new',
    url: 'https://luma.com/new', start: new Date('2026-10-02T03:00:00Z'), geo: { lat: 37.7, lon: -122.4 } } });
  try {
    const result = await runWithConvexClient(client, () => syncSingleSource('source-1'));
    assert.equal(result.events, 1);
    const write = client.writes.find((write) => write.name === 'events:upsertEvents');
    assert.equal(write.args.events[0].id, 'new');
    assert.deepEqual(write.args.successfulSourceUrls, []);
    assert.ok(client.writes.findIndex((write) => write.name === 'sources:updateSource') > client.writes.indexOf(write));
  } finally { ical.async.fromURL = original; }
});

test('failed durable save rejects sync and does not mark sources processed', async () => {
  const original = ical.async.fromURL;
  const client = clientWith({ rejectSave: true });
  ical.async.fromURL = async () => ({ vcalendar: { type: 'VCALENDAR', version: '2.0' } });
  try {
    await assert.rejects(runWithConvexClient(client, syncEvents), /Durable database unavailable/);
    assert.equal(client.writes.some((write) => write.name === 'sources:updateSource'), false);
  } finally { ical.async.fromURL = original; }
});

test('paused sources cannot be manually synced', async () => {
  const client = clientWith({ source: { _id: 'source-1', url: sourceUrl, sourceType: 'event', status: 'paused' } });
  await assert.rejects(runWithConvexClient(client, () => syncSingleSource('source-1')), /paused/);
  assert.equal(client.writes.length, 0);
});

const emptyCalendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SF Trip//Safety Test//EN\r\nEND:VCALENDAR\r\n';

function reconciliationClient() {
  const rows = [{ ...event('saved'), _id: 'event-row', userId: 'user-1' }];
  const client = clientWith();
  const originalQuery = client.query;
  client.query = async (name) => name === 'events:listEvents' ? rows.filter((row) => !row.isDeleted) : originalQuery(name);
  const ctx = { db: {
    query() { return { withIndex() { return this; }, async collect() { return rows; } }; },
    async patch(id, patch) { Object.assign(rows.find((row) => row._id === id), patch); },
    async replace(id, next) { Object.assign(rows.find((row) => row._id === id), next); },
    async insert(_table, next) { rows.push({ ...next, _id: `row-${rows.length}` }); }
  } };
  client.mutation = async (name, args) => {
    client.writes.push({ name, args });
    if (name === 'events:upsertEvents') await reconcileImportedRecordsForUser(
      ctx, 'events', 'user-1', args.events, args.syncedAt, args.successfulSourceUrls, args.missedSyncThreshold
    );
    return {};
  };
  return { client, rows };
}

test('HTTP 200 HTML, plaintext, incomplete and wrong-version feeds cannot retire prior events', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const invalid of ['<html>Upstream unavailable</html>', 'Rate limited. Please try later.',
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n', 'BEGIN:VCALENDAR\r\nVERSION:9.0\r\nEND:VCALENDAR']) {
      const { client, rows } = reconciliationClient();
      globalThis.fetch = async (url) => new Response(url === sourceUrl ? invalid : emptyCalendar, { status: 200 });
      for (let i = 0; i < 2; i++) {
        const payload = await runWithConvexClient(client, syncEvents);
        assert.ok(payload.events.some((row) => row.id === 'saved'));
        assert.ok(payload.meta.ingestionErrors.some((error) => error.sourceUrl === sourceUrl && /Invalid iCal/.test(error.message)));
      }
      assert.equal(rows[0].isDeleted, undefined);
      assert.equal(rows[0].missedSyncCount, undefined);
      assert.ok(client.writes.filter((write) => write.name === 'events:upsertEvents')
        .every((write) => !write.args.successfulSourceUrls.includes(sourceUrl)));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('a genuine empty VCALENDAR retires missing events only after the configured missed-sync threshold', async () => {
  const originalFetch = globalThis.fetch;
  const { client, rows } = reconciliationClient();
  globalThis.fetch = async () => new Response(emptyCalendar, { status: 200 });
  try {
    await runWithConvexClient(client, syncEvents);
    assert.equal(rows[0].missedSyncCount, 1);
    assert.equal(rows[0].isDeleted, false);
    await runWithConvexClient(client, syncEvents);
    assert.equal(rows[0].missedSyncCount, 2);
    assert.equal(rows[0].isDeleted, true);
  } finally { globalThis.fetch = originalFetch; }
});

async function withSharedCache(cache, run) {
  const cachePath = path.join(process.cwd(), 'data', 'events-cache.json');
  let previous;
  try { previous = await readFile(cachePath, 'utf-8'); } catch { /* no shared cache */ }
  await writeFile(cachePath, JSON.stringify(cache));
  try { return await run(); } finally {
    if (previous !== undefined) await writeFile(cachePath, previous);
    else await rm(cachePath, { force: true });
  }
}

test('new authenticated users receive no global cached events or spots when their database has no rows or metadata', async () => {
  await withSharedCache({ events: [event('private-global-event')], places: [{ id: 'private-global-place', name: 'Private place', lat: 37.7, lng: -122.4 }], meta: {} }, async () => {
    const payload = await runWithConvexClient(clientWith(), loadEventsPayload);
    assert.deepEqual(payload.events, []);
    assert.equal(payload.meta.eventCount, 0);
    assert.equal(payload.meta.source, 'convex');
    assert.equal(payload.places.some((place) => place.id === 'private-global-place'), false);
  });
});

test('authenticated database event and spot read failures propagate instead of returning global cached data', async () => {
  await withSharedCache({ events: [event('private-global-event')], places: [], meta: {} }, async () => {
    for (const failedQuery of ['events:listEvents', 'events:getSyncMeta', 'spots:listSpots', 'spots:getSyncMeta']) {
      const client = clientWith();
      const originalQuery = client.query;
      client.query = async (name) => {
        if (name === failedQuery) throw new Error(`Read failed: ${failedQuery}`);
        return originalQuery(name);
      };
      await assert.rejects(runWithConvexClient(client, loadEventsPayload), /Read failed:/);
    }
  });
});

test('authenticated RSS without personal seen state never inherits another user’s shared progress', async () => {
  const originalFetch = globalThis.fetch;
  const previousEnabled = process.env.ENABLE_FIRECRAWL;
  const previousKey = process.env.FIRECRAWL_API_KEY;
  process.env.ENABLE_FIRECRAWL = 'true';
  process.env.FIRECRAWL_API_KEY = 'mock-key';
  const rssUrl = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';
  const guid = 'https://sfirl.com/p/private-progress';
  const version = '2026-10-01T12:00:00.000Z';
  const client = clientWith({ source: { _id: 'rss-personal', sourceType: 'event', url: rssUrl, status: 'active' } });
  let extracted = 0;
  globalThis.fetch = async (url) => {
    if (url === rssUrl) return new Response(`<rss><channel><item><title>New newsletter</title><link>${guid}</link><guid>${guid}</guid><pubDate>${version}</pubDate></item></channel></rss>`);
    if (url === 'https://api.firecrawl.dev/v1/extract') {
      extracted++;
      return Response.json({ success: true, data: { events: [] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    await withSharedCache({ events: [], places: [], meta: { rssSeenBySourceUrl: { [rssUrl.toLowerCase()]: { [guid]: version } } } }, async () => {
      const result = await runWithConvexClient(client, () => syncSingleSource('rss-personal'));
      assert.deepEqual(result.errors, []);
      assert.equal(extracted, 1, 'a different user’s seen GUID must not suppress this user’s extraction');
      assert.ok(client.writes.some((write) => write.name === 'sources:updateSource' && write.args.rssStateJson.includes(guid)));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnabled === undefined) delete process.env.ENABLE_FIRECRAWL;
    else process.env.ENABLE_FIRECRAWL = previousEnabled;
    if (previousKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = previousKey;
  }
});
