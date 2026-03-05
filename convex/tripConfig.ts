import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireAuthenticatedUserId } from './authz';

const tripConfigValidator = v.object({
  tripStart: v.string(),
  tripEnd: v.string(),
  baseLocation: v.string(),
  showSharedPlaceRecommendations: v.boolean()
});
const saveTripConfigResultValidator = v.object({
  tripStart: v.string(),
  tripEnd: v.string(),
  showSharedPlaceRecommendations: v.boolean()
});

export const getTripConfig = query({
  args: {},
  returns: tripConfigValidator,
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId as Id<'users'>);

    return {
      tripStart: user?.tripStart ?? '',
      tripEnd: user?.tripEnd ?? '',
      baseLocation: user?.baseLocation ?? '',
      showSharedPlaceRecommendations: user?.showSharedPlaceRecommendations ?? true
    };
  }
});

export const saveTripConfig = mutation({
  args: {
    tripStart: v.string(),
    tripEnd: v.string(),
    baseLocation: v.optional(v.string()),
    showSharedPlaceRecommendations: v.optional(v.boolean())
  },
  returns: saveTripConfigResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId as Id<'users'>);
    if (!user) {
      throw new Error('Authenticated user record not found.');
    }
    const shouldUpdateBaseLocation = args.baseLocation !== undefined;
    const nextBaseLocation = shouldUpdateBaseLocation
      ? args.baseLocation
      : user.baseLocation;
    const shouldUpdateSharedRecommendations = args.showSharedPlaceRecommendations !== undefined;

    const nextUserPatch: {
      tripStart: string;
      tripEnd: string;
      baseLocation?: string;
      showSharedPlaceRecommendations?: boolean;
    } = {
      tripStart: args.tripStart,
      tripEnd: args.tripEnd
    };
    if (shouldUpdateBaseLocation) {
      nextUserPatch.baseLocation = nextBaseLocation;
    }
    if (shouldUpdateSharedRecommendations) {
      nextUserPatch.showSharedPlaceRecommendations = Boolean(args.showSharedPlaceRecommendations);
    }

    await ctx.db.patch(userId as Id<'users'>, nextUserPatch);

    return {
      tripStart: args.tripStart,
      tripEnd: args.tripEnd,
      showSharedPlaceRecommendations: shouldUpdateSharedRecommendations
        ? Boolean(args.showSharedPlaceRecommendations)
        : user.showSharedPlaceRecommendations ?? true
    };
  }
});
