import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId, requireOwnerUserId } from './authz';

const eventValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  eventUrl: v.string(),
  startDateTimeText: v.string(),
  startDateISO: v.string(),
  locationText: v.string(),
  address: v.string(),
  googleMapsUrl: v.string(),
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
  address: v.string(),
  googleMapsUrl: v.string(),
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
    await requireAuthenticatedUserId(ctx);
    const events = await ctx.db.query('events').collect();

    return events
      .filter((event) => !event.isDeleted)
      .map(({ _creationTime, _id, ...event }) => event)
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
    await requireAuthenticatedUserId(ctx);
    const row = await ctx.db.query('syncMeta').withIndex('by_key', (q) => q.eq('key', 'events')).first();

    if (!row) {
      return null;
    }

    const { _creationTime, _id, ...meta } = row;
    return meta;
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
    missedSyncThreshold: v.optional(v.number())
  },
  returns: upsertEventsResultValidator,
  handler: async (ctx, args) => {
    await requireOwnerUserId(ctx);

    const missedSyncThreshold = Math.max(1, Number(args.missedSyncThreshold) || 2);
    const keepUrls = new Set(args.events.map((event) => event.eventUrl));
    const existingRows = await ctx.db.query('events').collect();
    const existingByUrl = new Map(existingRows.map((row) => [row.eventUrl, row]));

    for (const row of existingRows) {
      if (!keepUrls.has(row.eventUrl)) {
        const nextMissedSyncCount = (Number(row.missedSyncCount) || 0) + 1;
        const isDeleted = nextMissedSyncCount >= missedSyncThreshold;

        await ctx.db.patch(row._id, {
          missedSyncCount: nextMissedSyncCount,
          isDeleted,
          updatedAt: args.syncedAt
        });
      }
    }

    for (const event of args.events) {
      const existing = existingByUrl.get(event.eventUrl);
      const nextEvent = {
        ...event,
        missedSyncCount: 0,
        isDeleted: false,
        lastSeenAt: args.syncedAt,
        updatedAt: args.syncedAt
      };

      if (existing) {
        await ctx.db.patch(existing._id, nextEvent);
      } else {
        await ctx.db.insert('events', nextEvent);
      }
    }

    const existingMeta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'events'))
      .first();

    const nextMeta = {
      key: 'events',
      syncedAt: args.syncedAt,
      calendars: args.calendars,
      eventCount: args.events.length
    };

    if (existingMeta) {
      await ctx.db.patch(existingMeta._id, nextMeta);
    } else {
      await ctx.db.insert('syncMeta', nextMeta);
    }

    return {
      eventCount: args.events.length,
      syncedAt: args.syncedAt
    };
  }
});
