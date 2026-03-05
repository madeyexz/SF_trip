import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;

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

type PlanItem = {
  id: string;
  kind: 'event' | 'place';
  sourceKey: string;
  title: string;
  locationText: string;
  link: string;
  tag: string;
  startMinutes: number;
  endMinutes: number;
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function normalizeDateISO(value: unknown) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function clampMinutes(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sortPlanItems<T extends { startMinutes: number }>(items: T[]) {
  return [...items].sort((left, right) => left.startMinutes - right.startMinutes);
}

function sanitizePlannerByDate(value: Record<string, unknown>) {
  const result: Record<string, PlanItem[]> = {};

  for (const [dateISOInput, itemsInput] of Object.entries(value || {})) {
    const dateISO = normalizeDateISO(dateISOInput);
    if (!dateISO || !Array.isArray(itemsInput)) {
      continue;
    }

    const nextItems = itemsInput
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        const startMinutes = clampMinutes(row.startMinutes, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES);
        const endMinutes = clampMinutes(row.endMinutes, startMinutes + MIN_PLAN_BLOCK_MINUTES, MINUTES_IN_DAY);

        return {
          id: cleanText(row.id) || `plan-${Math.random().toString(36).slice(2, 10)}`,
          kind: row.kind === 'event' ? 'event' : 'place',
          sourceKey: cleanText(row.sourceKey),
          title: cleanText(row.title) || 'Untitled stop',
          locationText: cleanText(row.locationText),
          link: cleanText(row.link),
          tag: cleanText(row.tag).toLowerCase(),
          startMinutes,
          endMinutes
        } as PlanItem;
      })
      .filter((item) => item.sourceKey);

    result[dateISO] = sortPlanItems(nextItems);
  }

  return result;
}

async function requireCurrentUserId(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return String(userId);
}

export const getPlannerState = query({
  args: {},
  returns: getPlannerStateResultValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const rows = await ctx.db
      .query('plannerEntries')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();

    const plannerByDate: Record<string, PlanItem[]> = {};
    for (const row of rows) {
      const dateISO = normalizeDateISO(row.dateISO);
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
});

export const replacePlannerState = mutation({
  args: {
    plannerByDate: plannerByDateValidator
  },
  returns: replacePlannerStateResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const plannerByDate = sanitizePlannerByDate(args.plannerByDate);
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
});
