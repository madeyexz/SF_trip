import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadSourcesPayload, syncSingleSource } from './events.js';

const BEEHIIV_RSS_URL = 'https://rss.beehiiv.com/feeds/9B98D9gG4C.xml';
const FIRECRAWL_EXTRACT_URL = 'https://api.firecrawl.dev/v1/extract';
const EVENTS_CACHE_FILE = path.join(process.cwd(), 'data', 'events-cache.json');

let originalFetch;
let originalEnv;
let hadOriginalEventsCache;
let originalEventsCache;

beforeEach(async () => {
  originalFetch = globalThis.fetch;
  originalEnv = {
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    RSS_INITIAL_ITEMS: process.env.RSS_INITIAL_ITEMS,
    RSS_MAX_ITEMS_PER_SYNC: process.env.RSS_MAX_ITEMS_PER_SYNC,
    CONVEX_URL: process.env.CONVEX_URL,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    GOOGLE_MAPS_GEOCODING_KEY: process.env.GOOGLE_MAPS_GEOCODING_KEY,
    GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY,
    GOOGLE_MAPS_BROWSER_KEY: process.env.GOOGLE_MAPS_BROWSER_KEY
  };

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
  process.env.RSS_INITIAL_ITEMS = '2';
  process.env.RSS_MAX_ITEMS_PER_SYNC = '5';
});

afterEach(async () => {
  globalThis.fetch = originalFetch;

  restoreEnv('FIRECRAWL_API_KEY');
  restoreEnv('RSS_INITIAL_ITEMS');
  restoreEnv('RSS_MAX_ITEMS_PER_SYNC');
  restoreEnv('CONVEX_URL');
  restoreEnv('NEXT_PUBLIC_CONVEX_URL');
  restoreEnv('GOOGLE_MAPS_GEOCODING_KEY');
  restoreEnv('GOOGLE_MAPS_SERVER_KEY');
  restoreEnv('GOOGLE_MAPS_BROWSER_KEY');

  if (hadOriginalEventsCache) {
    await writeFile(EVENTS_CACHE_FILE, originalEventsCache, 'utf-8');
  } else {
    await rm(EVENTS_CACHE_FILE, { force: true });
  }
});

function restoreEnv(key) {
  const previous = originalEnv[key];
  if (previous === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = previous;
}

async function writeEventsCacheMeta(meta = {}) {
  const payload = {
    meta,
    events: [],
    places: []
  };
  await writeFile(EVENTS_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

function buildRssFeed(items) {
  const rows = items
    .map((item) => {
      return [
        '<item>',
        `  <title><![CDATA[${item.title}]]></title>`,
        `  <link>${item.link}</link>`,
        `  <guid>${item.guid || item.link}</guid>`,
        `  <pubDate>${item.pubDate}</pubDate>`,
        item.atomPublished ? `  <atom:published>${item.atomPublished}</atom:published>` : '',
        item.atomUpdated ? `  <atom:updated>${item.atomUpdated}</atom:updated>` : '',
        '</item>'
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    rows,
    '</channel>',
    '</rss>'
  ].join('\n');
}

async function findBeehiivSourceId() {
  const payload = await loadSourcesPayload();
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const beehiivSources = sources.filter(
    (source) => source.sourceType === 'event' && source.url === BEEHIIV_RSS_URL
  );

  assert.equal(beehiivSources.length, 1, 'Beehiiv RSS source should exist exactly once');
  return beehiivSources[0].id;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('Beehiiv RSS sync', () => {
  it('includes Beehiiv RSS source exactly once in source payload', async () => {
    const payload = await loadSourcesPayload();
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    const beehiivSources = sources.filter(
      (source) => source.sourceType === 'event' && source.url === BEEHIIV_RSS_URL
    );

    assert.equal(beehiivSources.length, 1);
  });

  it('on first sync, parses only the most recent RSS items and dedupes canonical URLs', async () => {
    const sourceId = await findBeehiivSourceId();
    await writeEventsCacheMeta({});

    const item1Url = 'https://sfirl.com/p/issue-1';
    const item2Url = 'https://sfirl.com/p/issue-2';
    const item3Url = 'https://sfirl.com/p/issue-3';

    const feedXml = buildRssFeed([
      {
        title: 'Issue 1',
        link: item1Url,
        pubDate: 'Wed, 01 Jan 2025 16:00:00 GMT'
      },
      {
        title: 'Issue 2',
        link: item2Url,
        pubDate: 'Thu, 02 Jan 2025 16:00:00 GMT'
      },
      {
        title: 'Issue 3',
        link: item3Url,
        pubDate: 'Fri, 03 Jan 2025 16:00:00 GMT'
      }
    ]);

    const extractedByPost = new Map([
      [
        item2Url,
        [
          {
            name: 'Duplicate Canonical Event',
            eventUrl: 'https://tickets.example.com/event?utm_source=beehiiv#section',
            startDateISO: '2025-02-20',
            startDateTimeText: '2025-02-20 19:00',
            locationText: 'SOMA, SF',
            address: 'SOMA, San Francisco',
            description: 'Issue 2 extract',
            googleMapsUrl: ''
          }
        ]
      ],
      [
        item3Url,
        [
          {
            name: 'Duplicate Canonical Event',
            eventUrl: 'https://tickets.example.com/event?utm_medium=email',
            startDateISO: '2025-02-20',
            startDateTimeText: '2025-02-20 19:00',
            locationText: 'SOMA, SF',
            address: 'SOMA, San Francisco',
            description: 'Issue 3 extract',
            googleMapsUrl: ''
          }
        ]
      ]
    ]);

    const firecrawlPostUrls = [];

    globalThis.fetch = async (url, options = {}) => {
      if (url === BEEHIIV_RSS_URL) {
        return new Response(feedXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      }

      if (url === FIRECRAWL_EXTRACT_URL && (options.method || 'GET') === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const postUrl = body?.urls?.[0] || '';
        firecrawlPostUrls.push(postUrl);
        const events = extractedByPost.get(postUrl) || [];
        return jsonResponse({ success: true, data: { events } });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const result = await syncSingleSource(sourceId);

    assert.equal(result.errors.length, 0, 'sync should not return ingestion errors');
    assert.equal(result.events, 1, 'canonicalized duplicate event URLs should be deduped');

    assert.equal(firecrawlPostUrls.length, 2, 'should parse only last 2 RSS items on first sync');
    assert.ok(!firecrawlPostUrls.includes(item1Url), 'oldest item should not be parsed on first sync');
    assert.ok(firecrawlPostUrls.includes(item2Url));
    assert.ok(firecrawlPostUrls.includes(item3Url));
  });

  it('skips Firecrawl extraction when RSS item guid is already seen with same version', async () => {
    const sourceId = await findBeehiivSourceId();
    await writeEventsCacheMeta({
      rssSeenBySourceUrl: {
        [BEEHIIV_RSS_URL]: {
          'https://sfirl.beehiiv.com/p/old-issue': '2026-01-02T12:00:00.000Z'
        }
      }
    });

    const feedXml = buildRssFeed([
      {
        title: 'Old Issue',
        link: 'https://sfirl.com/p/old-issue',
        guid: 'https://sfirl.beehiiv.com/p/old-issue',
        pubDate: 'Thu, 02 Jan 2026 12:00:00 GMT',
        atomUpdated: '2026-01-02T12:00:00Z'
      }
    ]);

    let firecrawlCalls = 0;

    globalThis.fetch = async (url, options = {}) => {
      if (url === BEEHIIV_RSS_URL) {
        return new Response(feedXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      }

      if (url === FIRECRAWL_EXTRACT_URL && (options.method || 'GET') === 'POST') {
        firecrawlCalls += 1;
        return jsonResponse({ success: true, data: { events: [] } });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const result = await syncSingleSource(sourceId);

    assert.equal(result.errors.length, 0);
    assert.equal(result.events, 0);
    assert.equal(firecrawlCalls, 0, 'already-seen RSS guid/version should not trigger Firecrawl');
  });

  it('re-parses RSS item when same guid has a newer atom:updated version', async () => {
    const sourceId = await findBeehiivSourceId();
    await writeEventsCacheMeta({
      rssSeenBySourceUrl: {
        [BEEHIIV_RSS_URL]: {
          'https://sfirl.beehiiv.com/p/updated-issue': '2026-01-01T12:00:00.000Z'
        }
      }
    });

    const itemUrl = 'https://sfirl.com/p/updated-issue';
    const feedXml = buildRssFeed([
      {
        title: 'Updated Issue',
        link: itemUrl,
        guid: 'https://sfirl.beehiiv.com/p/updated-issue',
        pubDate: 'Fri, 02 Jan 2026 12:00:00 GMT',
        atomUpdated: '2026-01-02T12:00:00Z'
      }
    ]);

    const firecrawlPostUrls = [];
    globalThis.fetch = async (url, options = {}) => {
      if (url === BEEHIIV_RSS_URL) {
        return new Response(feedXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      }

      if (url === FIRECRAWL_EXTRACT_URL && (options.method || 'GET') === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const postUrl = body?.urls?.[0] || '';
        firecrawlPostUrls.push(postUrl);
        return jsonResponse({ success: true, data: { events: [] } });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const result = await syncSingleSource(sourceId);

    assert.equal(result.errors.length, 0);
    assert.equal(result.events, 0);
    assert.equal(firecrawlPostUrls.length, 1, 'newer guid version should trigger Firecrawl');
    assert.equal(firecrawlPostUrls[0], itemUrl);
  });

  it('returns a firecrawl-stage error when FIRECRAWL_API_KEY is missing', async () => {
    const sourceId = await findBeehiivSourceId();
    await writeEventsCacheMeta({});
    process.env.FIRECRAWL_API_KEY = '';

    let rssFetchCalls = 0;
    globalThis.fetch = async (url) => {
      if (url === BEEHIIV_RSS_URL) {
        rssFetchCalls += 1;
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    };

    const result = await syncSingleSource(sourceId);

    assert.equal(result.events, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].stage, 'firecrawl');
    assert.match(result.errors[0].message, /Missing FIRECRAWL_API_KEY/i);
    assert.equal(rssFetchCalls, 0, 'RSS feed should not be fetched when API key is missing');
  });
});
