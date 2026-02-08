#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CORNER_LIST_URL = 'https://www.corner.inc/list/e65af393-70dd-46d5-948a-d774f472d2ee';
const DEFAULT_OUTPUT_FILE = 'data/static-places.json';
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev';
const TAGS = ['eat', 'bar', 'cafes', 'go out', 'shops'];

const envFromFile = await loadDotEnv(path.join(process.cwd(), '.env'));
const firecrawlKey = process.env.FIRECRAWL_API_KEY || envFromFile.FIRECRAWL_API_KEY || '';
const cornerListUrl = process.env.CORNER_LIST_URL || envFromFile.CORNER_LIST_URL || DEFAULT_CORNER_LIST_URL;
const outputFile = process.env.OUTPUT_FILE || envFromFile.OUTPUT_FILE || DEFAULT_OUTPUT_FILE;

if (!firecrawlKey) {
  console.error('Missing FIRECRAWL_API_KEY in env or .env file.');
  process.exit(1);
}

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
  'Extract all places in this specific Corner list.',
  'For each place include: name, tag (eat/bar/cafes/go out/shops if inferable),',
  'location text, direct place URL, best map URL if shown,',
  'curatorComment (the curator note/comment for this place in this list if present),',
  'shortDescription, and any important details.'
].join(' ');

const extractPayload = {
  urls: [cornerListUrl],
  prompt,
  schema,
  allowExternalLinks: false,
  includeSubdomains: false,
  enableWebSearch: false
};

const extractResponse = await callFirecrawl('/v1/extract', extractPayload, firecrawlKey);
const rawPlaces = Array.isArray(extractResponse?.data?.places) ? extractResponse.data.places : [];
const normalized = normalizePlaces(rawPlaces);

if (normalized.length === 0) {
  console.error('No places extracted. Check list URL or prompt.');
  process.exit(1);
}

await writeFile(path.join(process.cwd(), outputFile), `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${normalized.length} places to ${outputFile}`);

async function callFirecrawl(endpoint, payload, apiKey) {
  const response = await fetch(`${FIRECRAWL_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    return waitForExtract(jsonPayload.id, apiKey);
  }

  return jsonPayload;
}

async function waitForExtract(jobId, apiKey) {
  const maxAttempts = 40;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${FIRECRAWL_BASE_URL}/v1/extract/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePlaces(rawPlaces) {
  const normalized = [];
  const seen = new Set();

  for (const raw of rawPlaces) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const name = clean(raw.name);
    const location = clean(raw.location);
    if (!name || !location) {
      continue;
    }

    const cornerLink = clean(raw.cornerLink);
    const dedupeKey = cornerLink || `${name}|${location}`.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const tag = normalizeTag(raw.tag, `${name} ${raw.shortDescription || ''} ${raw.details || ''}`);
    const mapLink = normalizeMapLink(raw.mapLink, location);
    const description = clean(raw.shortDescription);

    normalized.push({
      id: `corner-${normalized.length + 1}`,
      name,
      tag,
      location,
      mapLink,
      cornerLink,
      curatorComment: clean(raw.curatorComment),
      description,
      details: clean(raw.details)
    });
  }

  return normalized;
}

function normalizeTag(tag, fallbackText) {
  const value = clean(tag).toLowerCase();
  if (TAGS.includes(value)) {
    return value;
  }

  const haystack = `${value} ${clean(fallbackText).toLowerCase()}`;
  if (/(coffee|cafe|espresso|matcha|tea|bakery)/.test(haystack)) return 'cafes';
  if (/(bar|cocktail|wine|pub|brewery)/.test(haystack)) return 'bar';
  if (/(shop|store|boutique|retail|market)/.test(haystack)) return 'shops';
  if (/(club|night|party|dance|music venue|late night)/.test(haystack)) return 'go out';
  return 'eat';
}

function normalizeMapLink(rawLink, location) {
  const link = clean(rawLink);
  if (link.startsWith('https://') || link.startsWith('http://')) {
    return link;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function clean(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

async function loadDotEnv(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const result = {};

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      result[key] = value;
    }

    return result;
  } catch {
    return {};
  }
}
