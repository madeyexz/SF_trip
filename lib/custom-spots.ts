import { ConvexHttpClient } from 'convex/browser';

import { getScopedConvexClient } from './convex-client-context.ts';

export const CUSTOM_SPOT_TAGS = ['eat', 'bar', 'cafes', 'go out', 'shops', 'sightseeing'] as const;

type CustomSpotTag = (typeof CUSTOM_SPOT_TAGS)[number];

type CustomSpotPayloadInput = {
  id?: unknown;
  sourceKey?: unknown;
  name?: unknown;
  tag?: unknown;
  location?: unknown;
  mapLink?: unknown;
  cornerLink?: unknown;
  curatorComment?: unknown;
  description?: unknown;
  details?: unknown;
  lat?: unknown;
  lng?: unknown;
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function slugify(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

export function normalizeCustomSpotTag(tag: unknown): CustomSpotTag {
  const normalized = normalizeComparableText(tag);
  if ((CUSTOM_SPOT_TAGS as readonly string[]).includes(normalized)) {
    return normalized as CustomSpotTag;
  }
  throw new Error('Tag must be one of eat, bar, cafes, go out, shops, sightseeing.');
}

export function buildCustomSpotSourceKey(input: {
  sourceKey?: unknown;
  id?: unknown;
  mapLink?: unknown;
  name?: unknown;
  location?: unknown;
}) {
  const explicitSourceKey = cleanText(input?.sourceKey);
  if (explicitSourceKey) {
    return explicitSourceKey;
  }

  const explicitId = cleanText(input?.id);
  if (explicitId) {
    return `google-place:${explicitId}`;
  }

  return [
    normalizeComparableText(input?.name),
    normalizeComparableText(input?.location),
    normalizeComparableText(input?.mapLink)
  ].join('|');
}

export function normalizeCustomSpotPayload(input: CustomSpotPayloadInput) {
  const name = cleanText(input?.name);
  const location = cleanText(input?.location);
  const mapLink = cleanText(input?.mapLink);
  const sourceKey = buildCustomSpotSourceKey(input);
  const tag = normalizeCustomSpotTag(input?.tag);
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);

  if (!name) {
    throw new Error('Spot name is required.');
  }
  if (!location) {
    throw new Error('Spot location is required.');
  }
  if (!mapLink) {
    throw new Error('Spot map link is required.');
  }
  if (!sourceKey) {
    throw new Error('Spot source key is required.');
  }

  const explicitId = cleanText(input?.id);
  const generatedId = `custom-${slugify(explicitId || sourceKey || `${name}-${location}`) || 'spot'}`;

  return {
    id: generatedId,
    sourceKey,
    name,
    tag,
    location,
    mapLink,
    cornerLink: cleanText(input?.cornerLink),
    curatorComment: cleanText(input?.curatorComment),
    description: cleanText(input?.description),
    details: cleanText(input?.details),
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {})
  };
}

function normalizeCustomSpotRecord(row: any) {
  return {
    id: cleanText(row?.id),
    sourceKey: cleanText(row?.sourceKey),
    name: cleanText(row?.name),
    tag: normalizeCustomSpotTag(row?.tag),
    location: cleanText(row?.location),
    mapLink: cleanText(row?.mapLink),
    cornerLink: cleanText(row?.cornerLink),
    curatorComment: cleanText(row?.curatorComment),
    description: cleanText(row?.description),
    details: cleanText(row?.details),
    ...(typeof row?.lat === 'number' ? { lat: row.lat } : {}),
    ...(typeof row?.lng === 'number' ? { lng: row.lng } : {}),
    sourceType: 'custom_spot'
  };
}

export async function loadCustomSpotsPayload() {
  const client = createConvexClient();

  if (!client) {
    return [];
  }

  try {
    const rows = await client.query('customSpots:listCustomSpots', {});
    return Array.isArray(rows) ? rows.map(normalizeCustomSpotRecord) : [];
  } catch (error) {
    console.error('Convex custom spots read failed; continuing without saved custom spots.', error);
    return [];
  }
}

export async function createCustomSpotPayload(input: CustomSpotPayloadInput) {
  const client = createConvexClient();
  if (!client) {
    throw new Error('CONVEX_URL is missing. Configure Convex to persist custom spots.');
  }

  const spot = normalizeCustomSpotPayload(input);
  const created = await client.mutation('customSpots:upsertCustomSpot', { spot });
  return normalizeCustomSpotRecord(created);
}
