import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server.js';
import { v } from 'convex/values';
import {
  normalizePlannerDateISO,
  sanitizePlannerByDate,
  sortPlanItems
} from '../lib/planner-domain.ts';

const planItemValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal('event'), v.literal('place')),
  sourceKey: v.string(),
  title: v.string(),
  locationText: v.string(),
  link: v.string(),
  tag: v.string(),
  startMinutes: v.number(),
  endMinutes: v.number()
});

const plannerByDateValidator = v.record(v.string(), v.array(planItemValidator));
const getPlannerStateResultValidator = v.object({
  userId: v.string(),
  plannerByDate: plannerByDateValidator
});
const replacePlannerStateResultValidator = v.object({
  userId: v.string(),
  dateCount: v.number(),
  itemCount: v.number(),
  updatedAt: v.string()
});

async function requireCurrentUserId(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return String(userId);
}

export async function getPlannerStateForUser(ctx: any, userId: string) {
  const rows = await ctx.db
    .query('plannerEntries')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .collect();

  const plannerByDate: Record<string, any[]> = {};
  for (const row of rows) {
    const dateISO = normalizePlannerDateISO(row.dateISO);
    if (!dateISO) {
      continue;
    }
    if (!plannerByDate[dateISO]) {
      plannerByDate[dateISO] = [];
    }
    plannerByDate[dateISO].push({
      id: row.itemId,
      kind: row.kind,
      sourceKey: row.sourceKey,
      title: row.title,
      locationText: row.locationText,
      link: row.link,
      tag: row.tag,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes
    });
  }

  for (const dateISO of Object.keys(plannerByDate)) {
    plannerByDate[dateISO] = sortPlanItems(plannerByDate[dateISO]);
  }

  return {
    userId,
    plannerByDate
  };
}

export async function replacePlannerStateForUser(
  ctx: any,
  userId: string,
  plannerByDateInput: Record<string, unknown>
) {
  const plannerByDate = sanitizePlannerByDate(plannerByDateInput);
  const existingRows = await ctx.db
    .query('plannerEntries')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .collect();

  for (const row of existingRows) {
    await ctx.db.delete(row._id);
  }

  const updatedAt = new Date().toISOString();
  let itemCount = 0;

  for (const [dateISO, items] of Object.entries(plannerByDate)) {
    for (const item of items) {
      await ctx.db.insert('plannerEntries', {
        userId,
        dateISO,
        itemId: item.id,
        kind: item.kind,
        sourceKey: item.sourceKey,
        title: item.title,
        locationText: item.locationText,
        link: item.link,
        tag: item.tag,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        updatedAt
      });
      itemCount += 1;
    }
  }

  return {
    userId,
    dateCount: Object.keys(plannerByDate).length,
    itemCount,
    updatedAt
  };
}

export const getPlannerState = query({
  args: {},
  returns: getPlannerStateResultValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    return getPlannerStateForUser(ctx, userId);
  }
});

export const replacePlannerState = mutation({
  args: {
    plannerByDate: plannerByDateValidator
  },
  returns: replacePlannerStateResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    return replacePlannerStateForUser(ctx, userId, args.plannerByDate);
  }
});
