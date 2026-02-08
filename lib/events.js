import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';

const DOC_LOCATION_FILE = path.join(process.cwd(), 'docs', 'my_location.md');
const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_CACHE_FILE = path.join(DATA_DIR, 'events-cache.json');
const SAMPLE_EVENTS_FILE = path.join(DATA_DIR, 'sample-events.json');
const STATIC_PLACES_FILE = path.join(DATA_DIR, 'static-places.json');

export function getCalendarUrls() {
  return (process.env.LUMA_CALENDAR_URLS || 'https://luma.com/sf,https://luma.com/cerebralvalley_')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getMaxEventUrls() {
  return Number(process.env.MAX_EVENT_URLS || 5);
}

export async function loadBaseLocation() {
  try {
    const value = await readFile(DOC_LOCATION_FILE, 'utf-8');
    return value.trim();
  } catch {
    return 'San Francisco, CA';
  }
}

export async function loadEventsPayload() {
  const calendars = getCalendarUrls();
  const places = await loadStaticPlaces();
  const convexPayload = await loadEventsFromConvex(calendars);

  if (convexPayload) {
    return {
      ...convexPayload,
      places
    };
  }

  try {
    const raw = await readFile(EVENTS_CACHE_FILE, 'utf-8');
    const payload = JSON.parse(raw);
    return {
      ...payload,
      places
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
          eventCount: 0
        },
        events: [],
        places
      };
    }
  }
}

export async function syncEvents() {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || '';
  const places = await loadStaticPlaces();

  if (!firecrawlKey) {
    throw new Error('FIRECRAWL_API_KEY is missing. Add it in .env to sync events.');
  }

  const calendars = getCalendarUrls();
  const maxEventUrls = getMaxEventUrls();

  await mkdir(DATA_DIR, { recursive: true });

  const eventUrls = await fetchEventUrlsFromCalendars(calendars, firecrawlKey);
  const limitedUrls = eventUrls.slice(0, maxEventUrls);

  const events = [];
  const chunkSize = 4;

  for (let index = 0; index < limitedUrls.length; index += chunkSize) {
    const chunk = limitedUrls.slice(index, index + chunkSize);
    const result = await Promise.allSettled(
      chunk.map((eventUrl) => fetchEventDetailsWithRetry(eventUrl, firecrawlKey))
    );

    for (const item of result) {
      if (item.status !== 'fulfilled') {
        continue;
      }

      const normalized = normalizeEvent(item.value);
      if (normalized) {
        events.push(normalized);
      }
    }
  }

  const deduped = dedupeAndSortEvents(events);

  const payload = {
    meta: {
      syncedAt: new Date().toISOString(),
      calendars,
      eventCount: deduped.length
    },
    events: deduped,
    places
  };

  await writeFile(EVENTS_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  await saveEventsToConvex(payload);
  return payload;
}

async function loadStaticPlaces() {
  try {
    const raw = await readFile(STATIC_PLACES_FILE, 'utf-8');
    const places = JSON.parse(raw);
    return Array.isArray(places) ? places : [];
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
      calendars: payload.meta.calendars
    });
  } catch (error) {
    console.error('Convex write failed; local cache is still updated.', error);
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
    /([A-Za-z][^\]\n]{2,90})\]\(https:\/\/www\.google\.com\/maps\/search\/\?[^\)]+\)/
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
  const explicitDate = cleanText(rawEvent.startDateISO);
  const startDateISO = explicitDate || inferDateISO(startDateTimeText);

  return {
    id: eventUrl.replace('https://luma.com/', ''),
    name,
    description: cleanText(rawEvent.description),
    eventUrl,
    startDateTimeText,
    startDateISO,
    locationText: cleanText(rawEvent.locationText),
    address: cleanText(rawEvent.address),
    googleMapsUrl: cleanText(rawEvent.googleMapsUrl)
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
