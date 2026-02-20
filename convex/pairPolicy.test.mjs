import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computePairRoomTransitions } from './pairPolicy.ts';

describe('pair policy transitions', () => {
  it('expels prior memberships and expires old owned rooms when creating', () => {
    const transition = computePairRoomTransitions({
      action: 'create',
      nextRoomCode: 'new-room',
      membershipRoomCodes: ['old-joined', 'old-owned', 'new-room'],
      ownedRoomCodes: ['old-owned', 'older-owned', 'new-room']
    });

    assert.deepEqual(transition.membershipRoomCodesToRemove, ['old-joined', 'old-owned']);
    assert.deepEqual(transition.ownedRoomCodesToExpire, ['old-owned', 'older-owned']);
  });

  it('keeps ownership untouched while switching joined rooms', () => {
    const transition = computePairRoomTransitions({
      action: 'join',
      nextRoomCode: 'room-b',
      membershipRoomCodes: ['room-a', 'room-b'],
      ownedRoomCodes: ['room-a']
    });

    assert.deepEqual(transition.membershipRoomCodesToRemove, ['room-a']);
    assert.deepEqual(transition.ownedRoomCodesToExpire, []);
  });

  it('removes all memberships when leaving', () => {
    const transition = computePairRoomTransitions({
      action: 'leave',
      nextRoomCode: '',
      membershipRoomCodes: ['room-a', 'room-b'],
      ownedRoomCodes: ['room-z']
    });

    assert.deepEqual(transition.membershipRoomCodesToRemove, ['room-a', 'room-b']);
    assert.deepEqual(transition.ownedRoomCodesToExpire, []);
  });
});
