import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAuthenticatedUserId, requireOwnerUserId } from './authz';

const sourceTypeValidator = v.union(v.literal('event'), v.literal('spot'));
const sourceStatusValidator = v.union(v.literal('active'), v.literal('paused'));

function parseIpv4(hostname: string) {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateHost(hostname: string) {
  const value = hostname.toLowerCase();
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal') ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:')
  ) {
    return true;
  }

  const ipv4 = parseIpv4(value);
  if (!ipv4) {
    return false;
  }
  const [a, b] = ipv4;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function assertPublicSourceUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL. Use a full http(s) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid URL. Use a full http(s) URL.');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('Source URL must target the public internet.');
  }
}

export const listSources = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUserId(ctx);
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
    await requireAuthenticatedUserId(ctx);
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
    await requireOwnerUserId(ctx);

    const now = new Date().toISOString();
    const nextUrl = args.url.trim();
    const nextLabel = (args.label || '').trim() || nextUrl;
    assertPublicSourceUrl(nextUrl);
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
    await requireOwnerUserId(ctx);

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
    await requireOwnerUserId(ctx);

    const existing = await ctx.db.get(args.sourceId);
    if (!existing) {
      return { deleted: false };
    }

    await ctx.db.delete(args.sourceId);
    return { deleted: true };
  }
});
