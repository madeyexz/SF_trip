import { internalMutation, query } from './_generated/server';
import { v } from 'convex/values';

const placeRecommendationInputValidator = v.object({
  placeKey: v.string(),
  placeName: v.string(),
  friendName: v.string(),
  friendUrl: v.optional(v.string()),
  tag: v.string(),
  location: v.string(),
  mapLink: v.string(),
  cornerLink: v.optional(v.string()),
  note: v.optional(v.string()),
  details: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number())
});

const placeRecommendationRecordValidator = v.object({
  _id: v.id('placeRecommendations'),
  placeKey: v.string(),
  placeName: v.string(),
  friendName: v.string(),
  friendUrl: v.optional(v.string()),
  tag: v.string(),
  location: v.string(),
  mapLink: v.string(),
  cornerLink: v.optional(v.string()),
  note: v.optional(v.string()),
  details: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  createdAt: v.string(),
  updatedAt: v.string()
});

const upsertPlaceRecommendationsResultValidator = v.object({
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number()
});

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function buildRecommendationResponse(row: any) {
  return {
    _id: row._id,
    placeKey: row.placeKey,
    placeName: row.placeName,
    friendName: row.friendName,
    ...(typeof row.friendUrl === 'string' ? { friendUrl: row.friendUrl } : {}),
    tag: row.tag,
    location: row.location,
    mapLink: row.mapLink,
    ...(typeof row.cornerLink === 'string' ? { cornerLink: row.cornerLink } : {}),
    ...(typeof row.note === 'string' ? { note: row.note } : {}),
    ...(typeof row.details === 'string' ? { details: row.details } : {}),
    ...(typeof row.sourceUrl === 'string' ? { sourceUrl: row.sourceUrl } : {}),
    ...(typeof row.lat === 'number' ? { lat: row.lat } : {}),
    ...(typeof row.lng === 'number' ? { lng: row.lng } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function buildStoredRecommendation(row: any, now: string) {
  return {
    placeKey: cleanText(row.placeKey),
    placeName: cleanText(row.placeName),
    friendName: cleanText(row.friendName),
    ...(cleanText(row.friendUrl) ? { friendUrl: cleanText(row.friendUrl) } : {}),
    tag: cleanText(row.tag),
    location: cleanText(row.location),
    mapLink: cleanText(row.mapLink),
    ...(cleanText(row.cornerLink) ? { cornerLink: cleanText(row.cornerLink) } : {}),
    ...(cleanText(row.note) ? { note: cleanText(row.note) } : {}),
    ...(cleanText(row.details) ? { details: cleanText(row.details) } : {}),
    ...(cleanText(row.sourceUrl) ? { sourceUrl: cleanText(row.sourceUrl) } : {}),
    ...(typeof row.lat === 'number' ? { lat: row.lat } : {}),
    ...(typeof row.lng === 'number' ? { lng: row.lng } : {}),
    updatedAt: now
  };
}

function buildComparableStoredPayload(row: any) {
  return {
    placeKey: row.placeKey,
    placeName: row.placeName,
    friendName: row.friendName,
    friendUrl: typeof row.friendUrl === 'string' ? row.friendUrl : '',
    tag: row.tag,
    location: row.location,
    mapLink: row.mapLink,
    cornerLink: typeof row.cornerLink === 'string' ? row.cornerLink : '',
    note: typeof row.note === 'string' ? row.note : '',
    details: typeof row.details === 'string' ? row.details : '',
    sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : '',
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null
  };
}

async function upsertSharedPlaceRecommendationsInternal(ctx: any, recommendationsInput: any[]) {
  const recommendations = Array.isArray(recommendationsInput) ? recommendationsInput : [];
  const now = new Date().toISOString();
  const summary = {
    inserted: 0,
    updated: 0,
    unchanged: 0
  };

  for (const recommendation of recommendations) {
    const stored = buildStoredRecommendation(recommendation, now);
    if (!stored.placeKey || !stored.placeName || !stored.friendName || !stored.location || !stored.mapLink) {
      continue;
    }

    const existing = await ctx.db
      .query('placeRecommendations')
      .withIndex('by_place_friend', (q: any) => q.eq('placeKey', stored.placeKey).eq('friendName', stored.friendName))
      .first();

    if (!existing) {
      await ctx.db.insert('placeRecommendations', {
        ...stored,
        createdAt: now
      });
      summary.inserted += 1;
      continue;
    }

    const next = {
      ...stored,
      createdAt: existing.createdAt
    };

    if (JSON.stringify(buildComparableStoredPayload(existing)) === JSON.stringify(buildComparableStoredPayload(next))) {
      summary.unchanged += 1;
      continue;
    }

    await ctx.db.patch(existing._id, next);
    summary.updated += 1;
  }

  return summary;
}

export const listPlaceRecommendations = query({
  args: {},
  returns: v.array(placeRecommendationRecordValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query('placeRecommendations').withIndex('by_updated_at').collect();
    return rows
      .map((row) => buildRecommendationResponse(row))
      .sort((left, right) => `${left.placeName}|${left.friendName}`.localeCompare(`${right.placeName}|${right.friendName}`));
  }
});

export const upsertSharedPlaceRecommendations = internalMutation({
  args: {
    recommendations: v.array(placeRecommendationInputValidator)
  },
  returns: upsertPlaceRecommendationsResultValidator,
  handler: async (ctx, args) => upsertSharedPlaceRecommendationsInternal(ctx, args.recommendations)
});
