import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const eventValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  eventUrl: v.string(),
  startDateTimeText: v.string(),
  startDateISO: v.string(),
  locationText: v.string(),
  address: v.string(),
  googleMapsUrl: v.string()
});

export const listEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect();

    return events
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
  handler: async (ctx) => {
    const row = await ctx.db.query('syncMeta').withIndex('by_key', (q) => q.eq('key', 'events')).first();

    if (!row) {
      return null;
    }

    const { _creationTime, _id, ...meta } = row;
    return meta;
  }
});

export const upsertEvents = mutation({
  args: {
    events: v.array(eventValidator),
    syncedAt: v.string(),
    calendars: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const keepUrls = new Set(args.events.map((event) => event.eventUrl));
    const existingRows = await ctx.db.query('events').collect();

    for (const row of existingRows) {
      if (!keepUrls.has(row.eventUrl)) {
        await ctx.db.delete(row._id);
      }
    }

    for (const event of args.events) {
      const existing = await ctx.db
        .query('events')
        .withIndex('by_event_url', (q) => q.eq('eventUrl', event.eventUrl))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, event);
      } else {
        await ctx.db.insert('events', event);
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
