export type PairTransitionAction = 'create' | 'join' | 'leave';

type PairTransitionInput = {
  action: PairTransitionAction;
  nextRoomCode: string;
  membershipRoomCodes: string[];
  ownedRoomCodes: string[];
};

type PairTransitionResult = {
  membershipRoomCodesToRemove: string[];
  ownedRoomCodesToExpire: string[];
};

function uniqueRoomCodes(roomCodes: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const roomCode of roomCodes) {
    const normalized = String(roomCode || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function computePairRoomTransitions(input: PairTransitionInput): PairTransitionResult {
  const nextRoomCode = String(input.nextRoomCode || '').trim();
  const memberships = uniqueRoomCodes(input.membershipRoomCodes || []);
  const ownedRooms = uniqueRoomCodes(input.ownedRoomCodes || []);

  const membershipRoomCodesToRemove = memberships.filter((roomCode) => {
    if (input.action === 'leave') {
      return true;
    }
    if (!nextRoomCode) {
      return true;
    }
    return roomCode !== nextRoomCode;
  });

  const ownedRoomCodesToExpire = input.action === 'create'
    ? ownedRooms.filter((roomCode) => roomCode !== nextRoomCode)
    : [];

  return {
    membershipRoomCodesToRemove,
    ownedRoomCodesToExpire
  };
}
