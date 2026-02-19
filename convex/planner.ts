import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;
const ROOM_CODE_PATTERN = /^[a-z0-9_-]{2,64}$/;

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

type ConvexCtx = QueryCtx | MutationCtx;

type PlanItem = {
  id: string;
  kind: 'event' | 'place';
  sourceKey: string;
  title: string;
  locationText: string;
  link: string;
  tag: string;
  startMinutes: number;
  endMinutes: number;
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function normalizeRoomCode(value: unknown) {
  const nextValue = cleanText(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!ROOM_CODE_PATTERN.test(nextValue)) {
    return '';
  }
  return nextValue;
}

function normalizeDateISO(value: unknown) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function clampMinutes(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sortPlanItems(items: PlanItem[]) {
  return [...items].sort((left, right) => left.startMinutes - right.startMinutes);
}

function sanitizePlannerByDate(value: Record<string, unknown>) {
  const result: Record<string, PlanItem[]> = {};
  for (const [dateISOInput, itemsInput] of Object.entries(value || {})) {
    const dateISO = normalizeDateISO(dateISOInput);
    if (!dateISO || !Array.isArray(itemsInput)) {
      continue;
    }

    const nextItems = itemsInput
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        const startMinutes = clampMinutes(row.startMinutes, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES);
        const endMinutes = clampMinutes(row.endMinutes, startMinutes + MIN_PLAN_BLOCK_MINUTES, MINUTES_IN_DAY);
        return {
          id: cleanText(row.id) || `plan-${Math.random().toString(36).slice(2, 10)}`,
          kind: row.kind === 'event' ? 'event' : 'place',
          sourceKey: cleanText(row.sourceKey),
          title: cleanText(row.title) || 'Untitled stop',
          locationText: cleanText(row.locationText),
          link: cleanText(row.link),
          tag: cleanText(row.tag).toLowerCase(),
          startMinutes,
          endMinutes
        } as PlanItem;
      })
      .filter((item) => item.sourceKey);

    if (nextItems.length > 0) {
      result[dateISO] = sortPlanItems(nextItems);
    }
  }
  return result;
}

async function requireCurrentUserId(ctx: ConvexCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return String(userId);
}

function toPersonalRoomCode(userId: string) {
  return `self:${userId}`;
}

async function ensureRoomMembership(
  ctx: ConvexCtx,
  userId: string,
  roomCodeInput: string | undefined,
) {
  const normalizedRoomCode = normalizeRoomCode(roomCodeInput || '');
  if (!normalizedRoomCode) {
    return {
      roomCode: toPersonalRoomCode(userId),
      isPairRoom: false
    };
  }

  const membership = await ctx.db
    .query('pairMembers')
    .withIndex('by_room_user', (q) => q.eq('roomCode', normalizedRoomCode).eq('userId', userId))
    .first();

  if (!membership) {
    throw new Error('Join this pair room before viewing or editing it.');
  }

  return {
    roomCode: normalizedRoomCode,
    isPairRoom: true
  };
}

function pushByDate(target: Record<string, PlanItem[]>, dateISO: string, item: PlanItem) {
  if (!target[dateISO]) {
    target[dateISO] = [];
  }
  target[dateISO].push(item);
}

function finalizePlannerByDate(value: Record<string, PlanItem[]>) {
  const result: Record<string, PlanItem[]> = {};
  for (const [dateISO, items] of Object.entries(value)) {
    result[dateISO] = sortPlanItems(items);
  }
  return result;
}

async function maybeMigrateLegacyPlanner(
  ctx: MutationCtx,
  roomCode: string,
  ownerUserId: string,
) {
  const existingAnyRow = await ctx.db
    .query('plannerEntries')
    .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
    .first();
  if (existingAnyRow) {
    return 0;
  }

  const legacy = await ctx.db
    .query('plannerState')
    .withIndex('by_key', (q) => q.eq('key', roomCode))
    .first();
  if (!legacy || !legacy.plannerByDate) {
    return 0;
  }

  const sanitized = sanitizePlannerByDate(legacy.plannerByDate);
  const now = new Date().toISOString();
  let inserted = 0;
  for (const [dateISO, items] of Object.entries(sanitized)) {
    for (const item of items) {
      await ctx.db.insert('plannerEntries', {
        roomCode,
        ownerUserId,
        dateISO,
        itemId: item.id,
        kind: item.kind,
        sourceKey: item.sourceKey,
        title: item.title,
        locationText: item.locationText,
        link: item.link,
        tag: item.tag,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        updatedAt: now
      });
      inserted += 1;
    }
  }
  return inserted;
}

export const getPlannerState = query({
  args: {
    roomCode: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const { roomCode, isPairRoom } = await ensureRoomMembership(ctx, userId, args.roomCode);

    const rows = await ctx.db
      .query('plannerEntries')
      .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
      .collect();

    const plannerByDateMine: Record<string, PlanItem[]> = {};
    const plannerByDatePartner: Record<string, PlanItem[]> = {};
    const plannerByDateCombined: Record<string, PlanItem[]> = {};

    for (const row of rows) {
      const planItem = {
        id: row.itemId,
        kind: row.kind,
        sourceKey: row.sourceKey,
        title: row.title,
        locationText: row.locationText,
        link: row.link,
        tag: row.tag,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
        ownerUserId: row.ownerUserId
      };
      pushByDate(plannerByDateCombined, row.dateISO, planItem);
      if (row.ownerUserId === userId) {
        pushByDate(plannerByDateMine, row.dateISO, planItem);
      } else {
        pushByDate(plannerByDatePartner, row.dateISO, planItem);
      }
    }

    const memberCount = isPairRoom
      ? (
        await ctx.db
          .query('pairMembers')
          .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
          .collect()
      ).length
      : 1;

    return {
      userId,
      roomCode,
      memberCount,
      plannerByDateMine: finalizePlannerByDate(plannerByDateMine),
      plannerByDatePartner: finalizePlannerByDate(plannerByDatePartner),
      plannerByDateCombined: finalizePlannerByDate(plannerByDateCombined)
    };
  }
});

export const replacePlannerState = mutation({
  args: {
    roomCode: v.optional(v.string()),
    plannerByDate: plannerByDateValidator
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const { roomCode, isPairRoom } = await ensureRoomMembership(ctx, userId, args.roomCode);
    if (isPairRoom) {
      await maybeMigrateLegacyPlanner(ctx, roomCode, userId);
    }

    const existing = await ctx.db
      .query('plannerEntries')
      .withIndex('by_room_owner', (q) => q.eq('roomCode', roomCode).eq('ownerUserId', userId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const sanitized = sanitizePlannerByDate(args.plannerByDate);
    const updatedAt = new Date().toISOString();
    let inserted = 0;
    for (const [dateISO, items] of Object.entries(sanitized)) {
      for (const item of items) {
        await ctx.db.insert('plannerEntries', {
          roomCode,
          ownerUserId: userId,
          dateISO,
          itemId: item.id,
          kind: item.kind,
          sourceKey: item.sourceKey,
          title: item.title,
          locationText: item.locationText,
          link: item.link,
          tag: item.tag,
          startMinutes: item.startMinutes,
          endMinutes: item.endMinutes,
          updatedAt
        });
        inserted += 1;
      }
    }

    return {
      userId,
      roomCode,
      dateCount: Object.keys(sanitized).length,
      itemCount: inserted,
      updatedAt
    };
  }
});

function generateRoomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 7; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const createPairRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const now = new Date().toISOString();

    let roomCode = '';
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = generateRoomCode();
      const existing = await ctx.db
        .query('pairRooms')
        .withIndex('by_room_code', (q) => q.eq('roomCode', candidate))
        .first();
      if (!existing) {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      throw new Error('Could not create a unique pair room. Please retry.');
    }

    await ctx.db.insert('pairRooms', {
      roomCode,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now
    });
    await ctx.db.insert('pairMembers', {
      roomCode,
      userId,
      joinedAt: now
    });

    return {
      roomCode,
      memberCount: 1
    };
  }
});

export const joinPairRoom = mutation({
  args: {
    roomCode: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const roomCode = normalizeRoomCode(args.roomCode);
    if (!roomCode) {
      throw new Error('Room code must be 2-64 chars: a-z, 0-9, _ or -.');
    }

    const now = new Date().toISOString();
    let room = await ctx.db
      .query('pairRooms')
      .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
      .first();

    if (!room) {
      const legacy = await ctx.db
        .query('plannerState')
        .withIndex('by_key', (q) => q.eq('key', roomCode))
        .first();
      if (!legacy) {
        throw new Error('Pair room not found.');
      }

      await ctx.db.insert('pairRooms', {
        roomCode,
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now
      });
      await ctx.db.insert('pairMembers', {
        roomCode,
        userId,
        joinedAt: now
      });
      await maybeMigrateLegacyPlanner(ctx, roomCode, userId);

      return {
        roomCode,
        memberCount: 1,
        migratedLegacyRoom: true
      };
    }

    const existingMembership = await ctx.db
      .query('pairMembers')
      .withIndex('by_room_user', (q) => q.eq('roomCode', roomCode).eq('userId', userId))
      .first();

    if (!existingMembership) {
      const members = await ctx.db
        .query('pairMembers')
        .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
        .collect();
      if (members.length >= 2) {
        throw new Error('This pair room is full (2 people max).');
      }

      await ctx.db.insert('pairMembers', {
        roomCode,
        userId,
        joinedAt: now
      });
    }

    await ctx.db.patch(room._id, {
      updatedAt: now
    });

    const memberCount = (
      await ctx.db
        .query('pairMembers')
        .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
        .collect()
    ).length;

    return {
      roomCode,
      memberCount,
      migratedLegacyRoom: false
    };
  }
});

export const listMyPairRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const memberships = await ctx.db
      .query('pairMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const rooms = [];
    for (const membership of memberships) {
      const room = await ctx.db
        .query('pairRooms')
        .withIndex('by_room_code', (q) => q.eq('roomCode', membership.roomCode))
        .first();
      if (!room) {
        continue;
      }
      const memberCount = (
        await ctx.db
          .query('pairMembers')
          .withIndex('by_room_code', (q) => q.eq('roomCode', membership.roomCode))
          .collect()
      ).length;
      rooms.push({
        roomCode: membership.roomCode,
        memberCount,
        joinedAt: membership.joinedAt,
        updatedAt: room.updatedAt
      });
    }

    return rooms.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
});
