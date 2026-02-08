import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const sourceTypeValidator = v.union(v.literal('event'), v.literal('spot'));
const sourceStatusValidator = v.union(v.literal('active'), v.literal('paused'));

export const listSources = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('sources').collect();

    return rows
      .map(({ _creationTime, ...row }) => row)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
});

export const listActiveSources = query({
  args: {
    sourceType: sourceTypeValidator
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('sources')
      .withIndex('by_type_status', (q) => q.eq('sourceType', args.sourceType).eq('status', 'active'))
      .collect();

    return rows.map(({ _creationTime, ...row }) => row);
  }
});

export const createSource = mutation({
  args: {
    sourceType: sourceTypeValidator,
    url: v.string(),
    label: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const nextUrl = args.url.trim();
    const nextLabel = (args.label || '').trim() || nextUrl;
    const existing = await ctx.db
      .query('sources')
      .withIndex('by_url', (q) => q.eq('url', nextUrl))
      .first();

    if (existing && existing.sourceType === args.sourceType) {
      await ctx.db.patch(existing._id, {
        label: nextLabel,
        status: 'active',
        updatedAt: now
      });

      return {
        ...existing,
        label: nextLabel,
        status: 'active',
        updatedAt: now
      };
    }

    const sourceId = await ctx.db.insert('sources', {
      sourceType: args.sourceType,
      url: nextUrl,
      label: nextLabel,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    const created = await ctx.db.get(sourceId);
    return created;
  }
});

export const updateSource = mutation({
  args: {
    sourceId: v.id('sources'),
    label: v.optional(v.string()),
    status: v.optional(sourceStatusValidator),
    lastSyncedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
    rssStateJson: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceId);
    if (!existing) {
      return null;
    }

    const updates: {
      updatedAt: string,
      label?: string,
      status?: 'active' | 'paused',
      lastSyncedAt?: string,
      lastError?: string,
      rssStateJson?: string
    } = {
      updatedAt: new Date().toISOString()
    };

    if (typeof args.label === 'string') {
      updates.label = args.label.trim() || existing.label;
    }

    if (typeof args.status === 'string') {
      updates.status = args.status;
    }

    if (typeof args.lastSyncedAt === 'string') {
      updates.lastSyncedAt = args.lastSyncedAt;
    }

    if (typeof args.lastError === 'string') {
      updates.lastError = args.lastError.trim();
    }

    if (typeof args.rssStateJson === 'string') {
      updates.rssStateJson = args.rssStateJson.trim();
    }

    await ctx.db.patch(args.sourceId, updates);
    return {
      ...existing,
      ...updates
    };
  }
});

export const deleteSource = mutation({
  args: {
    sourceId: v.id('sources')
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceId);
    if (!existing) {
      return { deleted: false };
    }

    await ctx.db.delete(args.sourceId);
    return { deleted: true };
  }
});
