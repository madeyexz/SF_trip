import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId } from './authz';

export const getRouteByKey = query({
  args: {
    key: v.string()
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);
    const row = await ctx.db
      .query('routeCache')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first();

    if (!row) {
      return null;
    }

    return {
      encodedPolyline: row.encodedPolyline,
      totalDistanceMeters: row.totalDistanceMeters,
      totalDurationSeconds: row.totalDurationSeconds,
      updatedAt: row.updatedAt
    };
  }
});

export const upsertRouteByKey = mutation({
  args: {
    key: v.string(),
    encodedPolyline: v.string(),
    totalDistanceMeters: v.number(),
    totalDurationSeconds: v.number(),
    updatedAt: v.string()
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);

    const existing = await ctx.db
      .query('routeCache')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first();

    const nextValue = {
      key: args.key,
      encodedPolyline: args.encodedPolyline,
      totalDistanceMeters: args.totalDistanceMeters,
      totalDurationSeconds: args.totalDurationSeconds,
      updatedAt: args.updatedAt
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextValue);
    } else {
      await ctx.db.insert('routeCache', nextValue);
    }

    return {
      key: args.key,
      updatedAt: args.updatedAt
    };
  }
});
