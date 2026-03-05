import { internalMutation, internalQuery, mutation } from './_generated/server';
import { v } from 'convex/values';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function userIdFromLegacyRoomCode(roomCode: unknown) {
  const value = cleanText(roomCode);
  return value.startsWith('self:') ? value.slice(5) : '';
}

function buildSharedRecommendationKey(row: any) {
  return `${cleanText(row?.placeKey)}|${cleanText(row?.friendName).toLowerCase()}`;
}

function buildFriendUrl(friendName: unknown) {
  const normalized = cleanText(friendName).toLowerCase();
  if (normalized === 'winston') {
    return 'https://x.com/hsu_winston';
  }
  return '';
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
    const dbAny = ctx.db as any;
    const [userRows, sourceRows, plannerRows, pairRoomRows] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('sources').collect(),
      ctx.db.query('plannerEntries').collect(),
      dbAny.query('pairRooms').collect()
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
      if ((row as any).role === undefined) {
        continue;
      }
      summary.users.rolesRemoved += 1;
      if (!args.dryRun) {
        await dbAny.patch(row._id, { role: undefined });
      }
    }

    for (const row of sourceRows) {
      const existingUserId = cleanText((row as any).userId);
      if (existingUserId) {
        summary.sources.alreadyMigrated += 1;
        if (!args.dryRun && cleanText((row as any).roomCode)) {
          await dbAny.patch(row._id, { roomCode: undefined });
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
        await dbAny.patch(row._id, {
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
          await dbAny.patch(row._id, {
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
        await dbAny.patch(row._id, {
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

export const migrateSharedPlaceRecommendations = mutation({
  args: {
    dryRun: v.boolean()
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('placeRecommendations').collect();
    const rowsByKey = new Map<string, any[]>();

    for (const row of rows) {
      const key = buildSharedRecommendationKey(row);
      if (!key) {
        continue;
      }
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, []);
      }
      rowsByKey.get(key)?.push(row);
    }

    const summary = {
      dryRun: args.dryRun,
      total: rows.length,
      dedupedGroups: 0,
      patched: 0,
      deleted: 0,
      skipped: 0
    };

    for (const groupRows of rowsByKey.values()) {
      const sortedRows = [...groupRows].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
      const canonicalRow = sortedRows[0];
      if (!canonicalRow) {
        summary.skipped += 1;
        continue;
      }

      const friendUrl = cleanText((canonicalRow as any).friendUrl) || buildFriendUrl(canonicalRow.friendName);
      const needsPatch = cleanText((canonicalRow as any).userId)
        || (friendUrl && cleanText((canonicalRow as any).friendUrl) !== friendUrl);
      const duplicateRows = sortedRows.slice(1);

      if (duplicateRows.length > 0) {
        summary.dedupedGroups += 1;
        summary.deleted += duplicateRows.length;
      }

      if (needsPatch) {
        summary.patched += 1;
      }

      if (args.dryRun) {
        continue;
      }

      if (needsPatch) {
        await ctx.db.patch(canonicalRow._id, {
          userId: undefined,
          ...(friendUrl ? { friendUrl } : {})
        } as any);
      }

      for (const duplicateRow of duplicateRows) {
        await ctx.db.delete(duplicateRow._id);
      }
    }

    return summary;
  }
});

export const listCoordinateBackfillRows = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const [eventRows, spotRows, recommendationRows] = await Promise.all([
      ctx.db.query('events').collect(),
      ctx.db.query('spots').collect(),
      ctx.db.query('placeRecommendations').collect()
    ]);

    return {
      events: eventRows
        .filter((row: any) => typeof row.lat !== 'number' || typeof row.lng !== 'number')
        .map((row: any) => ({
          id: row.id,
          eventUrl: row.eventUrl,
          locationText: row.locationText,
          lat: row.lat,
          lng: row.lng
        })),
      spots: spotRows
        .filter((row: any) => typeof row.lat !== 'number' || typeof row.lng !== 'number')
        .map((row: any) => ({
          id: row.id,
          name: row.name,
          location: row.location,
          mapLink: row.mapLink,
          lat: row.lat,
          lng: row.lng
        })),
      placeRecommendations: recommendationRows
        .filter((row: any) => typeof row.lat !== 'number' || typeof row.lng !== 'number')
        .map((row: any) => ({
          placeKey: row.placeKey,
          placeName: row.placeName,
          friendName: row.friendName,
          location: row.location,
          mapLink: row.mapLink,
          lat: row.lat,
          lng: row.lng
        }))
    };
  }
});

export const applyCoordinateBackfill = internalMutation({
  args: {
    dryRun: v.boolean(),
    events: v.array(v.object({
      eventUrl: v.string(),
      lat: v.number(),
      lng: v.number()
    })),
    spots: v.array(v.object({
      id: v.string(),
      lat: v.number(),
      lng: v.number()
    })),
    placeRecommendations: v.array(v.object({
      placeKey: v.string(),
      friendName: v.string(),
      lat: v.number(),
      lng: v.number()
    }))
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const summary = {
      dryRun: args.dryRun,
      eventsUpdated: 0,
      spotsUpdated: 0,
      recommendationsUpdated: 0
    };

    for (const eventUpdate of args.events) {
      const existing = await ctx.db.query('events').filter((q: any) => q.eq(q.field('eventUrl'), eventUpdate.eventUrl)).first();
      if (!existing) {
        continue;
      }
      summary.eventsUpdated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(existing._id, {
          lat: eventUpdate.lat,
          lng: eventUpdate.lng,
          updatedAt: new Date().toISOString()
        });
      }
    }

    for (const spotUpdate of args.spots) {
      const existing = await ctx.db.query('spots').filter((q: any) => q.eq(q.field('id'), spotUpdate.id)).first();
      if (!existing) {
        continue;
      }
      summary.spotsUpdated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(existing._id, {
          lat: spotUpdate.lat,
          lng: spotUpdate.lng,
          updatedAt: new Date().toISOString()
        });
      }
    }

    for (const recommendationUpdate of args.placeRecommendations) {
      const existing = await ctx.db
        .query('placeRecommendations')
        .withIndex('by_place_friend', (q: any) =>
          q.eq('placeKey', recommendationUpdate.placeKey).eq('friendName', recommendationUpdate.friendName)
        )
        .first();
      if (!existing) {
        continue;
      }
      summary.recommendationsUpdated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(existing._id, {
          lat: recommendationUpdate.lat,
          lng: recommendationUpdate.lng,
          updatedAt: new Date().toISOString()
        });
      }
    }

    return summary;
  }
});
