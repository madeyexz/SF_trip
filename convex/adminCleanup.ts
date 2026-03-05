import { internalMutation, internalQuery, mutation } from './_generated/server';
import { v } from 'convex/values';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function userIdFromLegacyRoomCode(roomCode: unknown) {
  const value = cleanText(roomCode);
  return value.startsWith('self:') ? value.slice(5) : '';
}

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

export const migrateLegacyPersonalStorage = mutation({
  args: {
    dryRun: v.boolean()
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const [userRows, sourceRows, plannerRows, pairRoomRows] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('sources').collect(),
      ctx.db.query('plannerEntries').collect(),
      ctx.db.query('pairRooms').collect()
    ]);

    const summary = {
      dryRun: args.dryRun,
      users: {
        total: userRows.length,
        rolesRemoved: 0
      },
      sources: {
        total: sourceRows.length,
        migrated: 0,
        alreadyMigrated: 0,
        skipped: [] as string[]
      },
      plannerEntries: {
        total: plannerRows.length,
        migrated: 0,
        alreadyMigrated: 0,
        skipped: [] as string[]
      },
      pairRooms: {
        total: pairRoomRows.length,
        deleted: 0
      }
    };

    for (const row of userRows) {
      if (row.role === undefined) {
        continue;
      }
      summary.users.rolesRemoved += 1;
      if (!args.dryRun) {
        await ctx.db.patch(row._id, { role: undefined });
      }
    }

    for (const row of sourceRows) {
      const existingUserId = cleanText((row as any).userId);
      if (existingUserId) {
        summary.sources.alreadyMigrated += 1;
        if (!args.dryRun && cleanText((row as any).roomCode)) {
          await ctx.db.patch(row._id, { roomCode: undefined });
        }
        continue;
      }

      const nextUserId = userIdFromLegacyRoomCode((row as any).roomCode);
      if (!nextUserId) {
        summary.sources.skipped.push(String(row._id));
        continue;
      }

      summary.sources.migrated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(row._id, {
          userId: nextUserId,
          roomCode: undefined
        });
      }
    }

    for (const row of plannerRows) {
      const existingUserId = cleanText((row as any).userId);
      if (existingUserId) {
        summary.plannerEntries.alreadyMigrated += 1;
        if (!args.dryRun && (cleanText((row as any).roomCode) || cleanText((row as any).ownerUserId))) {
          await ctx.db.patch(row._id, {
            roomCode: undefined,
            ownerUserId: undefined
          });
        }
        continue;
      }

      const nextUserId = cleanText((row as any).ownerUserId);
      if (!nextUserId) {
        summary.plannerEntries.skipped.push(String(row._id));
        continue;
      }

      summary.plannerEntries.migrated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(row._id, {
          userId: nextUserId,
          roomCode: undefined,
          ownerUserId: undefined
        });
      }
    }

    summary.pairRooms.deleted = pairRoomRows.length;
    if (!args.dryRun) {
      for (const row of pairRoomRows) {
        await ctx.db.delete(row._id);
      }
    }

    return summary;
  }
});
