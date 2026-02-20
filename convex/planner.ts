import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { computePairRoomTransitions } from './pairPolicy';
import { hasPairRoomUser, mergePairRoomMembers, normalizePairRoomMembers } from './pairRoomMembers';

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
const plannerStateItemValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal('event'), v.literal('place')),
  sourceKey: v.string(),
  title: v.string(),
  locationText: v.string(),
  link: v.string(),
  tag: v.string(),
  startMinutes: v.number(),
  endMinutes: v.number(),
  ownerUserId: v.string()
});
const plannerStateByDateValidator = v.record(v.string(), v.array(plannerStateItemValidator));
const getPlannerStateResultValidator = v.object({
  userId: v.string(),
  roomCode: v.string(),
  memberCount: v.number(),
  plannerByDateMine: plannerStateByDateValidator,
  plannerByDatePartner: plannerStateByDateValidator,
  plannerByDateCombined: plannerStateByDateValidator
});
const replacePlannerStateResultValidator = v.object({
  userId: v.string(),
  roomCode: v.string(),
  dateCount: v.number(),
  itemCount: v.number(),
  updatedAt: v.string()
});
const pairRoomMutationResultValidator = v.object({
  roomCode: v.string(),
  memberCount: v.number()
});
const joinPairRoomResultValidator = v.object({
  roomCode: v.string(),
  memberCount: v.number(),
  migratedLegacyRoom: v.boolean()
});
const leavePairRoomResultValidator = v.object({
  leftRoomCount: v.number()
});
const listMyPairRoomsResultValidator = v.array(v.object({
  roomCode: v.string(),
  memberCount: v.number(),
  joinedAt: v.string(),
  updatedAt: v.string()
}));

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
type PlannerStateItem = PlanItem & {
  ownerUserId: string;
};

type PlannerByDate = Record<string, PlanItem[]>;

type PlannerEntryLike = {
  dateISO: string;
  itemId: string;
  kind: 'event' | 'place';
  sourceKey: string;
  title: string;
  locationText: string;
  link: string;
  tag: string;
  startMinutes: number;
  endMinutes: number;
  updatedAt: string;
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

function sortPlanItems<T extends { startMinutes: number }>(items: T[]) {
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

  const room = await getPairRoomByCode(ctx, normalizedRoomCode);
  if (!room || room.expiredAt) {
    throw new Error('This pair room is no longer active.');
  }
  const members = normalizePairRoomMembers(room.members || []);
  if (!hasPairRoomUser(members, userId)) {
    throw new Error('Join this pair room before viewing or editing it.');
  }

  return {
    roomCode: normalizedRoomCode,
    isPairRoom: true
  };
}

async function getPairRoomByCode(ctx: ConvexCtx, roomCode: string) {
  const rooms = await ctx.db
    .query('pairRooms')
    .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
    .collect();
  if (rooms.length === 0) {
    return null;
  }
  return rooms.find((room) => !room.expiredAt) || rooms[0];
}

async function getActiveMembershipRoomCodes(ctx: MutationCtx, userId: string) {
  const rooms = await ctx.db.query('pairRooms').collect();
  const membershipRoomCodes: string[] = [];
  for (const room of rooms) {
    if (room.expiredAt) {
      continue;
    }
    const members = normalizePairRoomMembers(room.members || []);
    if (hasPairRoomUser(members, userId)) {
      membershipRoomCodes.push(room.roomCode);
    }
  }
  return membershipRoomCodes;
}

async function getActiveOwnedRoomCodes(ctx: MutationCtx, userId: string) {
  const rooms = await ctx.db
    .query('pairRooms')
    .withIndex('by_created_by', (q) => q.eq('createdByUserId', userId))
    .collect();
  const ownedRoomCodes: string[] = [];
  for (const room of rooms) {
    if (!room.expiredAt) {
      ownedRoomCodes.push(room.roomCode);
    }
  }
  return ownedRoomCodes;
}

async function removeUserMembershipsForRoomCodes(
  ctx: MutationCtx,
  userId: string,
  roomCodes: string[],
  now: string,
) {
  const roomCodeSet = new Set(roomCodes);
  if (roomCodeSet.size === 0) {
    return 0;
  }
  const rooms = await ctx.db.query('pairRooms').collect();
  let patchedCount = 0;
  for (const room of rooms) {
    if (!roomCodeSet.has(room.roomCode) || room.expiredAt) {
      continue;
    }
    const members = normalizePairRoomMembers(room.members || []);
    const nextMembers = members.filter((member) => member.userId !== userId);
    if (nextMembers.length === members.length) {
      continue;
    }
    await ctx.db.patch(room._id, {
      members: nextMembers,
      updatedAt: now
    });
    patchedCount += 1;
  }
  return patchedCount;
}

async function expireOwnedRooms(ctx: MutationCtx, roomCodes: string[], now: string) {
  const roomCodeSet = new Set(roomCodes);
  if (roomCodeSet.size === 0) {
    return 0;
  }

  let expiredCount = 0;
  for (const roomCode of roomCodeSet) {
    const room = await getPairRoomByCode(ctx, roomCode);
    if (!room || room.expiredAt) {
      continue;
    }
    await ctx.db.patch(room._id, {
      members: [],
      expiredAt: now,
      updatedAt: now
    });
    expiredCount += 1;
  }

  return expiredCount;
}

async function applyPairTransition(
  ctx: MutationCtx,
  userId: string,
  action: 'create' | 'join' | 'leave',
  nextRoomCode: string,
  now: string,
) {
  const transition = computePairRoomTransitions({
    action,
    nextRoomCode,
    membershipRoomCodes: await getActiveMembershipRoomCodes(ctx, userId),
    ownedRoomCodes: await getActiveOwnedRoomCodes(ctx, userId)
  });

  await removeUserMembershipsForRoomCodes(ctx, userId, transition.membershipRoomCodesToRemove, now);
  await expireOwnedRooms(ctx, transition.ownedRoomCodesToExpire, now);

  return transition;
}

function pushByDate<T>(target: Record<string, T[]>, dateISO: string, item: T) {
  if (!target[dateISO]) {
    target[dateISO] = [];
  }
  target[dateISO].push(item);
}

function finalizePlannerByDate<T extends { startMinutes: number }>(value: Record<string, T[]>) {
  const result: Record<string, T[]> = {};
  for (const [dateISO, items] of Object.entries(value)) {
    result[dateISO] = sortPlanItems(items);
  }
  return result;
}

function plannerFingerprint(plannerByDate: PlannerByDate) {
  const entries = Object.entries(plannerByDate)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([dateISO, items]) => {
      const normalizedItems = [...items].sort((left, right) => {
        if (left.startMinutes !== right.startMinutes) {
          return left.startMinutes - right.startMinutes;
        }
        if (left.endMinutes !== right.endMinutes) {
          return left.endMinutes - right.endMinutes;
        }
        if (left.kind !== right.kind) {
          return left.kind.localeCompare(right.kind);
        }
        if (left.sourceKey !== right.sourceKey) {
          return left.sourceKey.localeCompare(right.sourceKey);
        }
        if (left.id !== right.id) {
          return left.id.localeCompare(right.id);
        }
        if (left.title !== right.title) {
          return left.title.localeCompare(right.title);
        }
        if (left.locationText !== right.locationText) {
          return left.locationText.localeCompare(right.locationText);
        }
        if (left.link !== right.link) {
          return left.link.localeCompare(right.link);
        }
        return left.tag.localeCompare(right.tag);
      });
      return [dateISO, normalizedItems];
    });
  return JSON.stringify(entries);
}

function plannerByDateFromRows(rows: PlannerEntryLike[]) {
  const plannerByDate: PlannerByDate = {};
  for (const row of rows) {
    pushByDate(plannerByDate, row.dateISO, {
      id: row.itemId,
      kind: row.kind,
      sourceKey: row.sourceKey,
      title: row.title,
      locationText: row.locationText,
      link: row.link,
      tag: row.tag,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes
    });
  }
  return finalizePlannerByDate(plannerByDate);
}

export const getPlannerState = query({
  args: {
    roomCode: v.optional(v.string())
  },
  returns: getPlannerStateResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const { roomCode, isPairRoom } = await ensureRoomMembership(ctx, userId, args.roomCode);

    const rows = await ctx.db
      .query('plannerEntries')
      .withIndex('by_room_code', (q) => q.eq('roomCode', roomCode))
      .collect();

    const plannerByDateMine: Record<string, PlannerStateItem[]> = {};
    const plannerByDatePartner: Record<string, PlannerStateItem[]> = {};
    const plannerByDateCombined: Record<string, PlannerStateItem[]> = {};

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

    const pairRoom = isPairRoom
      ? await getPairRoomByCode(ctx, roomCode)
      : null;
    const memberCount = pairRoom
      ? normalizePairRoomMembers(pairRoom.members || []).length
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
  returns: replacePlannerStateResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const { roomCode } = await ensureRoomMembership(ctx, userId, args.roomCode);

    const existing = await ctx.db
      .query('plannerEntries')
      .withIndex('by_room_owner', (q) => q.eq('roomCode', roomCode).eq('ownerUserId', userId))
      .collect();

    const sanitized = sanitizePlannerByDate(args.plannerByDate);
    if (plannerFingerprint(plannerByDateFromRows(existing)) === plannerFingerprint(sanitized)) {
      const updatedAt = existing.reduce(
        (maxUpdatedAt, row) => (row.updatedAt > maxUpdatedAt ? row.updatedAt : maxUpdatedAt),
        ''
      ) || new Date().toISOString();
      return {
        userId,
        roomCode,
        dateCount: Object.keys(sanitized).length,
        itemCount: existing.length,
        updatedAt
      };
    }

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

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
  returns: pairRoomMutationResultValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const now = new Date().toISOString();
    await applyPairTransition(ctx, userId, 'create', '', now);

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
      updatedAt: now,
      members: [{ userId, joinedAt: now }],
      expiredAt: undefined
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
  returns: joinPairRoomResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const roomCode = normalizeRoomCode(args.roomCode);
    if (!roomCode) {
      throw new Error('Room code must be 2-64 chars: a-z, 0-9, _ or -.');
    }

    const now = new Date().toISOString();
    let room = await getPairRoomByCode(ctx, roomCode);
    if (room?.expiredAt) {
      throw new Error('This pair room is no longer active.');
    }

    if (!room) {
      throw new Error('Pair room not found.');
    }

    await applyPairTransition(ctx, userId, 'join', roomCode, now);
    room = await getPairRoomByCode(ctx, roomCode);
    if (!room || room.expiredAt) {
      throw new Error('This pair room is no longer active.');
    }

    const members = normalizePairRoomMembers(room.members || []);
    const hasMembership = hasPairRoomUser(members, userId);
    let nextMembers = members;
    if (!hasMembership) {
      if (members.length >= 2) {
        throw new Error('This pair room is full (2 people max).');
      }
      nextMembers = mergePairRoomMembers(members, [{ userId, joinedAt: now }]);
      await ctx.db.patch(room._id, {
        members: nextMembers,
        updatedAt: now
      });
    }

    return {
      roomCode,
      memberCount: nextMembers.length,
      migratedLegacyRoom: false
    };
  }
});

export const leavePairRoom = mutation({
  args: {},
  returns: leavePairRoomResultValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const now = new Date().toISOString();
    const transition = await applyPairTransition(ctx, userId, 'leave', '', now);
    return {
      leftRoomCount: transition.membershipRoomCodesToRemove.length
    };
  }
});

export const listMyPairRooms = query({
  args: {},
  returns: listMyPairRoomsResultValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const allRooms = await ctx.db.query('pairRooms').collect();
    const rooms = [];
    for (const room of allRooms) {
      if (room.expiredAt) {
        continue;
      }
      const members = normalizePairRoomMembers(room.members || []);
      const membership = members.find((member) => member.userId === userId);
      if (!membership) {
        continue;
      }
      rooms.push({
        roomCode: room.roomCode,
        memberCount: members.length,
        joinedAt: membership.joinedAt,
        updatedAt: room.updatedAt
      });
    }

    return rooms.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
});
