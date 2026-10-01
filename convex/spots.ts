import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId } from './authz';
import { listImportedRecordsForUser, getImportSyncMetaForUser, reconcileImportedRecordsForUser, saveImportSyncMetaForUser } from './importedRecords';

const spotValidator = v.object({
  id: v.string(),
  sourceUrl: v.optional(v.string()),
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
const spotRecordValidator = v.object({
  id: v.string(),
  sourceUrl: v.optional(v.string()),
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
  missedSyncCount: v.optional(v.number()),
  isDeleted: v.optional(v.boolean()),
  lastSeenAt: v.optional(v.string()),
  updatedAt: v.optional(v.string())
});
const syncMetaValidator = v.object({
  key: v.string(),
  syncedAt: v.string(),
  calendars: v.array(v.string()),
  eventCount: v.number()
});
const upsertSpotsResultValidator = v.object({
  spotCount: v.number(),
  syncedAt: v.string()
});

export const listSpots = query({
  args: {},
  returns: v.array(spotRecordValidator),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const rows = await listImportedRecordsForUser(ctx, 'spots', userId);

    return rows
      .filter((spot) => !spot.isDeleted)
      .map((spot) => ({
        id: spot.id,
        sourceUrl: spot.sourceUrl,
        name: spot.name,
        tag: spot.tag,
        location: spot.location,
        mapLink: spot.mapLink,
        cornerLink: spot.cornerLink,
        curatorComment: spot.curatorComment,
        description: spot.description,
        details: spot.details,
        lat: spot.lat,
        lng: spot.lng,
        missedSyncCount: spot.missedSyncCount,
        isDeleted: spot.isDeleted,
        lastSeenAt: spot.lastSeenAt,
        updatedAt: spot.updatedAt
      }))
      .sort((left, right) => `${left.tag}|${left.name}`.localeCompare(`${right.tag}|${right.name}`));
  }
});

export const getSyncMeta = query({
  args: {},
  returns: v.union(v.null(), syncMetaValidator),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return getImportSyncMetaForUser(ctx, 'spots', userId);
  }
});

export const upsertSpots = mutation({
  args: {
    spots: v.array(spotValidator),
    syncedAt: v.string(),
    sourceUrls: v.array(v.string()),
    missedSyncThreshold: v.optional(v.number()),
    successfulSourceUrls: v.optional(v.array(v.string()))
  },
  returns: upsertSpotsResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await reconcileImportedRecordsForUser(
      ctx, 'spots', userId, args.spots, args.syncedAt,
      args.successfulSourceUrls, Math.max(1, Number(args.missedSyncThreshold) || 2)
    );
    await saveImportSyncMetaForUser(
      ctx, 'spots', userId, args.syncedAt, args.sourceUrls, args.spots.length
    );

    return {
      spotCount: args.spots.length,
      syncedAt: args.syncedAt
    };
  }
});
