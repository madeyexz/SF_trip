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
    lng: v.optional(v.number()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    confidence: v.optional(v.number()),
    missedSyncCount: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.string()),
    updatedAt: v.optional(v.string())
  }).index('by_event_url', ['eventUrl'])
    .index('by_source_id', ['sourceId']),
  spots: defineTable({
    id: v.string(),
    name: v.string(),
    tag: v.string(),
    location: v.string(),
    mapLink: v.string(),
    cornerLink: v.string(),
    curatorComment: v.string(),
    description: v.string(),
    details: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    confidence: v.optional(v.number()),
    missedSyncCount: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.string()),
    updatedAt: v.optional(v.string())
  }).index('by_spot_id', ['id'])
    .index('by_source_id', ['sourceId']),
  sources: defineTable({
    sourceType: v.union(v.literal('event'), v.literal('spot')),
    url: v.string(),
    label: v.string(),
    status: v.union(v.literal('active'), v.literal('paused')),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastSyncedAt: v.optional(v.string()),
    lastError: v.optional(v.string())
  }).index('by_type_status', ['sourceType', 'status'])
    .index('by_url', ['url']),
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
  }).index('by_key', ['key']),
  tripConfig: defineTable({
    key: v.string(),
    tripStart: v.string(),
    tripEnd: v.string(),
    updatedAt: v.string()
  }).index('by_key', ['key'])
});
