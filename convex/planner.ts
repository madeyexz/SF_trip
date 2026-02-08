import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const PLANNER_STATE_KEY = 'default';

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

export const getPlannerState = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('plannerState')
      .withIndex('by_key', (q) => q.eq('key', PLANNER_STATE_KEY))
      .first();

    if (!row) {
      return {
        plannerByDate: {},
        updatedAt: null
      };
    }

    return {
      plannerByDate: row.plannerByDate,
      updatedAt: row.updatedAt
    };
  }
});

export const replacePlannerState = mutation({
  args: {
    plannerByDate: plannerByDateValidator,
    updatedAt: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('plannerState')
      .withIndex('by_key', (q) => q.eq('key', PLANNER_STATE_KEY))
      .first();

    const nextValue = {
      key: PLANNER_STATE_KEY,
      plannerByDate: args.plannerByDate,
      updatedAt: args.updatedAt
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextValue);
    } else {
      await ctx.db.insert('plannerState', nextValue);
    }

    return {
      updatedAt: args.updatedAt,
      dateCount: Object.keys(args.plannerByDate).length
    };
  }
});
