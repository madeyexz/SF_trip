import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  users: defineTable({
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    role: v.optional(v.union(v.literal('owner'), v.literal('member'))),
    tripStart: v.optional(v.string()),
    tripEnd: v.optional(v.string()),
    baseLocation: v.optional(v.string())
  }).index('email', ['email']),
  plannerEntries: defineTable({
    roomCode: v.string(),
    ownerUserId: v.string(),
    dateISO: v.string(),
    itemId: v.string(),
    kind: v.union(v.literal('event'), v.literal('place')),
    sourceKey: v.string(),
    title: v.string(),
    locationText: v.string(),
    link: v.string(),
    tag: v.string(),
    startMinutes: v.number(),
    endMinutes: v.number(),
    updatedAt: v.string()
  })
    .index('by_room_code', ['roomCode'])
    .index('by_room_owner', ['roomCode', 'ownerUserId']),
  pairRooms: defineTable({
    roomCode: v.string(),
    createdByUserId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    members: v.optional(v.array(v.object({
      userId: v.string(),
      joinedAt: v.string()
    }))),
    expiredAt: v.optional(v.string())
  })
    .index('by_room_code', ['roomCode'])
    .index('by_created_by', ['createdByUserId']),
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
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    confidence: v.optional(v.number()),
    missedSyncCount: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.string()),
    updatedAt: v.optional(v.string())
  }),
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
    missedSyncCount: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.string()),
    updatedAt: v.optional(v.string())
  }),
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
