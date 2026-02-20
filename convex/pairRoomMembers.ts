export type PairRoomMember = {
  userId: string;
  joinedAt: string;
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

export function normalizePairRoomMembers(value: unknown): PairRoomMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const byUserId = new Map<string, PairRoomMember>();
  for (const row of value) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const record = row as { userId?: unknown; joinedAt?: unknown };
    const userId = cleanText(record.userId);
    if (!userId) {
      continue;
    }
    const joinedAt = cleanText(record.joinedAt) || new Date(0).toISOString();
    const existing = byUserId.get(userId);
    if (!existing || joinedAt < existing.joinedAt) {
      byUserId.set(userId, { userId, joinedAt });
    }
  }
  return [...byUserId.values()].sort((left, right) => {
    if (left.joinedAt !== right.joinedAt) {
      return left.joinedAt.localeCompare(right.joinedAt);
    }
    return left.userId.localeCompare(right.userId);
  });
}

export function mergePairRoomMembers(
  currentMembers: unknown,
  legacyMembers: unknown,
): PairRoomMember[] {
  const normalizedCurrent = normalizePairRoomMembers(currentMembers);
  const normalizedLegacy = normalizePairRoomMembers(legacyMembers);
  return normalizePairRoomMembers([...normalizedCurrent, ...normalizedLegacy]);
}

export function pairRoomMembersFingerprint(members: PairRoomMember[]) {
  return members.map((member) => `${member.userId}@${member.joinedAt}`).join('|');
}

export function hasPairRoomUser(members: PairRoomMember[], userId: string) {
  return members.some((member) => member.userId === userId);
}

export function roomHasEveryLegacyMember(
  roomMembers: PairRoomMember[],
  legacyMembers: PairRoomMember[],
) {
  if (legacyMembers.length === 0) {
    return true;
  }
  const roomUserIds = new Set(roomMembers.map((member) => member.userId));
  return legacyMembers.every((member) => roomUserIds.has(member.userId));
}
