import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const TRIP_CONFIG_KEY = 'default';

export const getTripConfig = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('tripConfig')
      .withIndex('by_key', (q) => q.eq('key', TRIP_CONFIG_KEY))
      .first();

    if (!row) {
      return { tripStart: '', tripEnd: '', updatedAt: null };
    }

    return {
      tripStart: row.tripStart,
      tripEnd: row.tripEnd,
      updatedAt: row.updatedAt
    };
  }
});

export const saveTripConfig = mutation({
  args: {
    tripStart: v.string(),
    tripEnd: v.string(),
    updatedAt: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('tripConfig')
      .withIndex('by_key', (q) => q.eq('key', TRIP_CONFIG_KEY))
      .first();

    const nextValue = {
      key: TRIP_CONFIG_KEY,
      tripStart: args.tripStart,
      tripEnd: args.tripEnd,
      updatedAt: args.updatedAt
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextValue);
    } else {
      await ctx.db.insert('tripConfig', nextValue);
    }

    return { tripStart: args.tripStart, tripEnd: args.tripEnd };
  }
});
