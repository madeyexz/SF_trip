import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  events: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.string(),
    eventUrl: v.string(),
    startDateTimeText: v.string(),
    startDateISO: v.string(),
    locationText: v.string(),
    address: v.string(),
    googleMapsUrl: v.string()
  }).index('by_event_url', ['eventUrl']),
  syncMeta: defineTable({
    key: v.string(),
    syncedAt: v.string(),
    calendars: v.array(v.string()),
    eventCount: v.number()
  }).index('by_key', ['key'])
});
