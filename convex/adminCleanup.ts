import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

export const previewSoftDeletePurge = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const [eventRows, spotRows] = await Promise.all([
      ctx.db.query('events').collect(),
      ctx.db.query('spots').collect()
    ]);

    const deletedEvents = eventRows.filter((row) => Boolean(row.isDeleted));
    const deletedSpots = spotRows.filter((row) => Boolean(row.isDeleted));

    return {
      events: {
        total: eventRows.length,
        markedDeleted: deletedEvents.length,
        active: eventRows.length - deletedEvents.length,
        sampleEventUrls: deletedEvents.slice(0, 10).map((row) => row.eventUrl)
      },
      spots: {
        total: spotRows.length,
        markedDeleted: deletedSpots.length,
        active: spotRows.length - deletedSpots.length,
        sampleSpotIds: deletedSpots.slice(0, 10).map((row) => row.id)
      }
    };
  }
});

export const purgeSoftDeleted = internalMutation({
  args: {
    dryRun: v.boolean(),
    limitPerTable: v.optional(v.number())
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const [eventRows, spotRows] = await Promise.all([
      ctx.db.query('events').collect(),
      ctx.db.query('spots').collect()
    ]);
    const deletedEvents = eventRows.filter((row) => Boolean(row.isDeleted));
    const deletedSpots = spotRows.filter((row) => Boolean(row.isDeleted));
    const limitPerTable = Math.max(0, Number(args.limitPerTable) || 0);

    const plannedEvents = limitPerTable > 0 ? deletedEvents.slice(0, limitPerTable) : deletedEvents;
    const plannedSpots = limitPerTable > 0 ? deletedSpots.slice(0, limitPerTable) : deletedSpots;

    if (args.dryRun) {
      return {
        executed: false,
        events: {
          totalMarkedDeleted: deletedEvents.length,
          plannedDeletes: plannedEvents.length
        },
        spots: {
          totalMarkedDeleted: deletedSpots.length,
          plannedDeletes: plannedSpots.length
        }
      };
    }

    for (const row of plannedEvents) {
      await ctx.db.delete(row._id);
    }
    for (const row of plannedSpots) {
      await ctx.db.delete(row._id);
    }

    return {
      executed: true,
      events: {
        deleted: plannedEvents.length,
        remainingMarkedDeleted: deletedEvents.length - plannedEvents.length
      },
      spots: {
        deleted: plannedSpots.length,
        remainingMarkedDeleted: deletedSpots.length - plannedSpots.length
      }
    };
  }
});
