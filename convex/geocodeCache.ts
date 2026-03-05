import { mutation, query } from './_generated/server.js';
import { v } from 'convex/values';
import { requireAuthenticatedUserId } from './authz';
import { listGeocodeCacheRowsByAddressKeys, upsertGeocodeCacheRows } from './geocodeCacheHelpers';

const geocodeEntryValidator = v.object({
  addressKey: v.string(),
  addressText: v.string(),
  lat: v.number(),
  lng: v.number(),
  updatedAt: v.string()
});

const geocodeRecordValidator = v.object({
  addressKey: v.string(),
  addressText: v.string(),
  lat: v.number(),
  lng: v.number(),
  updatedAt: v.string()
});

const upsertManyResultValidator = v.object({
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number()
});

export const getByAddressKeys = query({
  args: {
    addressKeys: v.array(v.string())
  },
  returns: v.array(geocodeRecordValidator),
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);
    return listGeocodeCacheRowsByAddressKeys(ctx, args.addressKeys);
  }
});

export const upsertMany = mutation({
  args: {
    entries: v.array(geocodeEntryValidator)
  },
  returns: upsertManyResultValidator,
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);
    return upsertGeocodeCacheRows(ctx, args.entries);
  }
});
