import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId, requireOwnerUserId } from './authz';

const TRIP_CONFIG_KEY = 'default';
const tripConfigValidator = v.object({
  tripStart: v.string(),
  tripEnd: v.string(),
  baseLocation: v.string(),
  updatedAt: v.union(v.null(), v.string())
});
const saveTripConfigResultValidator = v.object({
  tripStart: v.string(),
  tripEnd: v.string()
});

export const getTripConfig = query({
  args: {},
  returns: tripConfigValidator,
  handler: async (ctx) => {
    await requireAuthenticatedUserId(ctx);
    const row = await ctx.db
      .query('tripConfig')
      .withIndex('by_key', (q) => q.eq('key', TRIP_CONFIG_KEY))
      .first();

    if (!row) {
      return { tripStart: '', tripEnd: '', baseLocation: '', updatedAt: null };
    }

    return {
      tripStart: row.tripStart,
      tripEnd: row.tripEnd,
      baseLocation: row.baseLocation ?? '',
      updatedAt: row.updatedAt
    };
  }
});

export const saveTripConfig = mutation({
  args: {
    tripStart: v.string(),
    tripEnd: v.string(),
    baseLocation: v.optional(v.string()),
    updatedAt: v.string()
  },
  returns: saveTripConfigResultValidator,
  handler: async (ctx, args) => {
    await requireOwnerUserId(ctx);

    const existing = await ctx.db
      .query('tripConfig')
      .withIndex('by_key', (q) => q.eq('key', TRIP_CONFIG_KEY))
      .first();
    const shouldUpdateBaseLocation = args.baseLocation !== undefined;
    const nextBaseLocation = shouldUpdateBaseLocation ? args.baseLocation : existing?.baseLocation;

    const nextValue: {
      key: string;
      tripStart: string;
      tripEnd: string;
      updatedAt: string;
      baseLocation?: string;
    } = {
      key: TRIP_CONFIG_KEY,
      tripStart: args.tripStart,
      tripEnd: args.tripEnd,
      updatedAt: args.updatedAt
    };
    if (shouldUpdateBaseLocation) {
      nextValue.baseLocation = nextBaseLocation;
    }

    if (existing) {
      const shouldPatch = existing.tripStart !== args.tripStart ||
        existing.tripEnd !== args.tripEnd ||
        (shouldUpdateBaseLocation && existing.baseLocation !== nextBaseLocation);
      if (shouldPatch) {
        await ctx.db.patch(existing._id, nextValue);
      }
    } else {
      await ctx.db.insert('tripConfig', nextValue);
    }

    return { tripStart: args.tripStart, tripEnd: args.tripEnd };
  }
});
