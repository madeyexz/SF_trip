import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { requireAuthenticatedUserId, requireOwnerUserId } from './authz';

const sourceTypeValidator = v.union(v.literal('event'), v.literal('spot'));
const sourceStatusValidator = v.union(v.literal('active'), v.literal('paused'));
const sourceRecordValidator = v.object({
  _id: v.id('sources'),
  sourceType: sourceTypeValidator,
  url: v.string(),
  label: v.string(),
  status: sourceStatusValidator,
  createdAt: v.string(),
  updatedAt: v.string(),
  lastSyncedAt: v.optional(v.string()),
  lastError: v.optional(v.string()),
  rssStateJson: v.optional(v.string())
});
const deleteSourceResultValidator = v.object({
  deleted: v.boolean()
});

type SourceRecordLike = {
  _id: Id<'sources'>;
  sourceType: 'event' | 'spot';
  url: string;
  label: string;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  lastError?: string;
  rssStateJson?: string;
};

function buildSourceResponse(row: SourceRecordLike) {
  return {
    _id: row._id,
    sourceType: row.sourceType,
    url: row.url,
    label: row.label,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(typeof row.lastSyncedAt === 'string' ? { lastSyncedAt: row.lastSyncedAt } : {}),
    ...(typeof row.lastError === 'string' ? { lastError: row.lastError } : {}),
    ...(typeof row.rssStateJson === 'string' ? { rssStateJson: row.rssStateJson } : {})
  };
}

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
  returns: v.array(sourceRecordValidator),
  handler: async (ctx) => {
    await requireAuthenticatedUserId(ctx);
    const rows = await ctx.db.query('sources').collect();

    return rows
      .map(({ _creationTime, ...row }) => buildSourceResponse(row))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
});

export const listActiveSources = query({
  args: {
    sourceType: sourceTypeValidator
  },
  returns: v.array(sourceRecordValidator),
  handler: async (ctx, args) => {
    await requireAuthenticatedUserId(ctx);
    const rows = await ctx.db
      .query('sources')
      .withIndex('by_type_status', (q) => q.eq('sourceType', args.sourceType).eq('status', 'active'))
      .collect();

    return rows.map(({ _creationTime, ...row }) => buildSourceResponse(row));
  }
});

export const createSource = mutation({
  args: {
    sourceType: sourceTypeValidator,
    url: v.string(),
    label: v.optional(v.string())
  },
  returns: sourceRecordValidator,
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
      const shouldPatch = existing.label !== nextLabel || existing.status !== 'active';
      if (shouldPatch) {
        await ctx.db.patch(existing._id, {
          label: nextLabel,
          status: 'active',
          updatedAt: now
        });
      }

      return buildSourceResponse({
        ...existing,
        label: nextLabel,
        status: 'active',
        updatedAt: shouldPatch ? now : existing.updatedAt
      });
    }

    const sourceId = await ctx.db.insert('sources', {
      sourceType: args.sourceType,
      url: nextUrl,
      label: nextLabel,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    return buildSourceResponse({
      _id: sourceId,
      sourceType: args.sourceType,
      url: nextUrl,
      label: nextLabel,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
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
  returns: v.union(v.null(), sourceRecordValidator),
  handler: async (ctx, args) => {
    await requireOwnerUserId(ctx);

    const existing = await ctx.db.get(args.sourceId);
    if (!existing) {
      return null;
    }

    const updates: {
      updatedAt?: string,
      label?: string,
      status?: 'active' | 'paused',
      lastSyncedAt?: string,
      lastError?: string,
      rssStateJson?: string
    } = {};

    if (typeof args.label === 'string') {
      const nextLabel = args.label.trim() || existing.label;
      if (nextLabel !== existing.label) {
        updates.label = nextLabel;
      }
    }

    if (typeof args.status === 'string') {
      if (args.status !== existing.status) {
        updates.status = args.status;
      }
    }

    if (typeof args.lastSyncedAt === 'string') {
      if (args.lastSyncedAt !== existing.lastSyncedAt) {
        updates.lastSyncedAt = args.lastSyncedAt;
      }
    }

    if (typeof args.lastError === 'string') {
      const nextLastError = args.lastError.trim();
      if (nextLastError !== existing.lastError) {
        updates.lastError = nextLastError;
      }
    }

    if (typeof args.rssStateJson === 'string') {
      const nextRssStateJson = args.rssStateJson.trim();
      if (nextRssStateJson !== existing.rssStateJson) {
        updates.rssStateJson = nextRssStateJson;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await ctx.db.patch(args.sourceId, updates);
    }
    return buildSourceResponse({
      _id: existing._id,
      sourceType: existing.sourceType,
      url: existing.url,
      label: updates.label ?? existing.label,
      status: updates.status ?? existing.status,
      createdAt: existing.createdAt,
      updatedAt: updates.updatedAt ?? existing.updatedAt,
      lastSyncedAt: updates.lastSyncedAt ?? existing.lastSyncedAt,
      lastError: updates.lastError ?? existing.lastError,
      rssStateJson: updates.rssStateJson ?? existing.rssStateJson
    });
  }
});

export const deleteSource = mutation({
  args: {
    sourceId: v.id('sources')
  },
  returns: deleteSourceResultValidator,
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
