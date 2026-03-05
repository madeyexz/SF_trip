import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId } from './authz';

const customSpotInputValidator = v.object({
  id: v.string(),
  sourceKey: v.string(),
  name: v.string(),
  tag: v.string(),
  location: v.string(),
  mapLink: v.string(),
  cornerLink: v.string(),
  curatorComment: v.string(),
  description: v.string(),
  details: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number())
});

const customSpotRecordValidator = v.object({
  _id: v.id('customSpots'),
  id: v.string(),
  userId: v.string(),
  sourceKey: v.string(),
  name: v.string(),
  tag: v.string(),
  location: v.string(),
  mapLink: v.string(),
  cornerLink: v.string(),
  curatorComment: v.string(),
  description: v.string(),
  details: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  createdAt: v.string(),
  updatedAt: v.string()
});

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function buildResponse(row: any) {
  return {
    _id: row._id,
    id: row.id,
    userId: row.userId,
    sourceKey: row.sourceKey,
    name: row.name,
    tag: row.tag,
    location: row.location,
    mapLink: row.mapLink,
    cornerLink: row.cornerLink,
    curatorComment: row.curatorComment,
    description: row.description,
    details: row.details,
    ...(typeof row.lat === 'number' ? { lat: row.lat } : {}),
    ...(typeof row.lng === 'number' ? { lng: row.lng } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function buildComparablePayload(row: any) {
  return {
    id: cleanText(row.id),
    sourceKey: cleanText(row.sourceKey),
    name: cleanText(row.name),
    tag: cleanText(row.tag),
    location: cleanText(row.location),
    mapLink: cleanText(row.mapLink),
    cornerLink: cleanText(row.cornerLink),
    curatorComment: cleanText(row.curatorComment),
    description: cleanText(row.description),
    details: cleanText(row.details),
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null
  };
}

export const listCustomSpots = query({
  args: {},
  returns: v.array(customSpotRecordValidator),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const rows = await ctx.db
      .query('customSpots')
      .withIndex('by_user_updated_at', (q) => q.eq('userId', userId))
      .collect();

    return rows
      .map((row) => buildResponse(row))
      .sort((left, right) => `${left.tag}|${left.name}`.localeCompare(`${right.tag}|${right.name}`));
  }
});

export const upsertCustomSpot = mutation({
  args: {
    spot: customSpotInputValidator
  },
  returns: customSpotRecordValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const now = new Date().toISOString();
    const nextSpot = {
      id: cleanText(args.spot.id),
      sourceKey: cleanText(args.spot.sourceKey),
      name: cleanText(args.spot.name),
      tag: cleanText(args.spot.tag),
      location: cleanText(args.spot.location),
      mapLink: cleanText(args.spot.mapLink),
      cornerLink: cleanText(args.spot.cornerLink),
      curatorComment: cleanText(args.spot.curatorComment),
      description: cleanText(args.spot.description),
      details: cleanText(args.spot.details),
      ...(typeof args.spot.lat === 'number' ? { lat: args.spot.lat } : {}),
      ...(typeof args.spot.lng === 'number' ? { lng: args.spot.lng } : {}),
      updatedAt: now
    };

    const existing = await ctx.db
      .query('customSpots')
      .withIndex('by_user_source_key', (q) => q.eq('userId', userId).eq('sourceKey', nextSpot.sourceKey))
      .first();

    if (existing) {
      const comparableExisting = buildComparablePayload(existing);
      const comparableNext = buildComparablePayload(nextSpot);
      if (JSON.stringify(comparableExisting) !== JSON.stringify(comparableNext)) {
        await ctx.db.patch(existing._id, nextSpot);
      }
      return buildResponse({
        ...existing,
        ...nextSpot
      });
    }

    const createdId = await ctx.db.insert('customSpots', {
      userId,
      ...nextSpot,
      createdAt: now
    });

    return buildResponse({
      _id: createdId,
      userId,
      ...nextSpot,
      createdAt: now
    });
  }
});
