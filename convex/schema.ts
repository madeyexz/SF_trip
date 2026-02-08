import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  plannerState: defineTable({
    key: v.string(),
    plannerByDate: v.record(
      v.string(),
      v.array(
        v.object({
          id: v.string(),
          kind: v.union(v.literal('event'), v.literal('place')),
          sourceKey: v.string(),
          title: v.string(),
          locationText: v.string(),
          link: v.string(),
          tag: v.string(),
          startMinutes: v.number(),
          endMinutes: v.number()
        })
      )
    ),
    updatedAt: v.string()
  }).index('by_key', ['key']),
  routeCache: defineTable({
    key: v.string(),
    encodedPolyline: v.string(),
    totalDistanceMeters: v.number(),
    totalDurationSeconds: v.number(),
    updatedAt: v.string()
  }).index('by_key', ['key']),
  events: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.string(),
    eventUrl: v.string(),
    startDateTimeText: v.string(),
    startDateISO: v.string(),
    locationText: v.string(),
    address: v.string(),
    googleMapsUrl: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number())
  }).index('by_event_url', ['eventUrl']),
  geocodeCache: defineTable({
    addressKey: v.string(),
    addressText: v.string(),
    lat: v.number(),
    lng: v.number(),
    updatedAt: v.string()
  }).index('by_address_key', ['addressKey']),
  syncMeta: defineTable({
    key: v.string(),
    syncedAt: v.string(),
    calendars: v.array(v.string()),
    eventCount: v.number()
  }).index('by_key', ['key'])
});
