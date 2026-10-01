import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId } from './authz';
import { listImportedRecordsForUser, getImportSyncMetaForUser, reconcileImportedRecordsForUser, saveImportSyncMetaForUser } from './importedRecords';

const eventValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  eventUrl: v.string(),
  startDateTimeText: v.string(),
  startDateISO: v.string(),
  locationText: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  sourceId: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  confidence: v.optional(v.number())
});
const eventRecordValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  eventUrl: v.string(),
  startDateTimeText: v.string(),
  startDateISO: v.string(),
  locationText: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  sourceId: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  confidence: v.optional(v.number()),
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
const geocodeValidator = v.object({
  addressKey: v.string(),
  lat: v.number(),
  lng: v.number(),
  updatedAt: v.string()
});
const upsertGeocodeResultValidator = v.object({
  addressKey: v.string(),
  updatedAt: v.string()
});
const upsertEventsResultValidator = v.object({
  eventCount: v.number(),
  syncedAt: v.string()
});

export const listEvents = query({
  args: {},
  returns: v.array(eventRecordValidator),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const events = await listImportedRecordsForUser(ctx, 'events', userId);

    return events
      .filter((event) => !event.isDeleted)
      .map((event) => ({
        id: event.id,
        name: event.name,
        description: event.description,
        eventUrl: event.eventUrl,
        startDateTimeText: event.startDateTimeText,
        startDateISO: event.startDateISO,
        locationText: event.locationText,
        lat: event.lat,
        lng: event.lng,
        sourceId: event.sourceId,
        sourceUrl: event.sourceUrl,
        confidence: event.confidence,
        missedSyncCount: event.missedSyncCount,
        isDeleted: event.isDeleted,
        lastSeenAt: event.lastSeenAt,
        updatedAt: event.updatedAt
      }))
      .sort((left, right) => {
        const leftValue = left.startDateISO || '9999-99-99';
        const rightValue = right.startDateISO || '9999-99-99';
        return leftValue.localeCompare(rightValue);
      });
  }
});

export const getSyncMeta = query({
  args: {},
  returns: v.union(v.null(), syncMetaValidator),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return getImportSyncMetaForUser(ctx, 'events', userId);
  }
});

export const getGeocodeByAddressKey = query({
  args: {
    addressKey: v.string()
  },
  returns: v.union(v.null(), geocodeValidator),
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);
    const row = await ctx.db
      .query('geocodeCache')
      .withIndex('by_address_key', (q) => q.eq('addressKey', args.addressKey))
      .first();

    if (!row) {
      return null;
    }

    return {
      addressKey: row.addressKey,
      lat: row.lat,
      lng: row.lng,
      updatedAt: row.updatedAt
    };
  }
});

export const upsertGeocode = mutation({
  args: {
    addressKey: v.string(),
    addressText: v.string(),
    lat: v.number(),
    lng: v.number(),
    updatedAt: v.string()
  },
  returns: upsertGeocodeResultValidator,
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);

    const existing = await ctx.db
      .query('geocodeCache')
      .withIndex('by_address_key', (q) => q.eq('addressKey', args.addressKey))
      .first();

    const next = {
      addressKey: args.addressKey,
      addressText: args.addressText,
      lat: args.lat,
      lng: args.lng,
      updatedAt: args.updatedAt
    };

    if (existing) {
      const shouldPatch = existing.addressText !== args.addressText ||
        existing.lat !== args.lat ||
        existing.lng !== args.lng;
      if (shouldPatch) {
        await ctx.db.patch(existing._id, next);
      }
      return {
        addressKey: args.addressKey,
        updatedAt: shouldPatch ? args.updatedAt : existing.updatedAt
      };
    } else {
      await ctx.db.insert('geocodeCache', next);
      return {
        addressKey: args.addressKey,
        updatedAt: args.updatedAt
      };
    }
  }
});

export const upsertEvents = mutation({
  args: {
    events: v.array(eventValidator),
    syncedAt: v.string(),
    calendars: v.array(v.string()),
    missedSyncThreshold: v.optional(v.number()),
    successfulSourceUrls: v.optional(v.array(v.string()))
  },
  returns: upsertEventsResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await reconcileImportedRecordsForUser(
      ctx, 'events', userId, args.events, args.syncedAt,
      args.successfulSourceUrls, Math.max(1, Number(args.missedSyncThreshold) || 2)
    );
    await saveImportSyncMetaForUser(
      ctx, 'events', userId, args.syncedAt, args.calendars, args.events.length
    );

    return {
      eventCount: args.events.length,
      syncedAt: args.syncedAt
    };
  }
});
